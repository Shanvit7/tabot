/// <reference types="chrome" />

import {
	ACTIVITY_GAP_MS,
	activeDuration,
	activeSpans,
	bulkInsertIngestRecords,
	canonicalPageUrl,
	countEvents,
	deletePageObservations,
	deriveSiteDomain,
	foregroundEvents,
	getAllEvents,
	getPageCaptureSiteSummaries,
	getPageObservationById,
	getPageObservations,
	logger,
	type PageNote,
	prunePageObservations,
	readFailure,
	type StatsSnapshot,
	type StoredIngestRecord,
	type StoredTabEvent,
	safeRecallUrl,
	sanitizeEventForIngestion,
	sanitizeUrlForIngestion,
	type TabEventMetadata,
	type TabEventType,
	validateNoteText,
} from "@tabot/shared";
import {
	isForegroundTab,
	startForegroundTracking,
} from "./background/foreground";
import { pageCaptureSite } from "./capture/site-policy";
import { readDashboardHistory } from "./dashboard/history";
import { isDashboardSender } from "./dashboard/sender";
import { createCaptureIdentity } from "./ingestion/capture-identity";
import { createEventPipeline } from "./ingestion/event-pipeline";
import {
	ingestPageMessage,
	ingestPageObservationMessage,
} from "./ingestion/page-ingress";
import {
	approveAuthorizationTransaction,
	getAssistantConnections,
	getRelayStatus,
	runRelaySanityCheck,
	startRelay,
} from "./relay/relay";
import { getStorageDb } from "./storage/client";

// One service worker, one bounded serial writer. Queued is not persisted.
const RECOVERY_ALARM = "tabot-ingest-recovery";
const PAGE_BUDGET_ALARM = "tabot-page-budget";
const WORKFLOW_TRAINING_ALARM = "tabot-workflow-training";
// Coalesce foreground site visits into a single background training pass.
const scheduleWorkflowTraining = () =>
	void chrome.alarms
		.create(WORKFLOW_TRAINING_ALARM, { delayInMinutes: 0.5 })
		.catch(() => {});
void chrome.alarms.clear("tabot-page-retention").catch(() => {});
void chrome.storage.local
	.remove([
		"tabot_page_capture_origins_v1",
		"tabot_workflow_learning_enabled_v1",
	])
	.catch(() => {});
const getDb = getStorageDb;
const getStorageCounts = async (includeFirstEventTimestamp = false) => {
	const db = await getDb();
	const [eventCount, pageCount] = await Promise.all([
		countEvents(db),
		db.countPages(),
	]);
	return includeFirstEventTimestamp
		? {
				eventCount,
				pageCount,
				firstEventTimestamp: await db.getFirstEventTimestamp(),
			}
		: { eventCount, pageCount };
};
const pipeline = createEventPipeline<StoredIngestRecord>({
	commit: async (rows) => {
		const result = await bulkInsertIngestRecords(await getDb(), rows);
		if (
			rows.some(
				(row) =>
					"type" in row &&
					(row.type === "NAVIGATION" || row.type === "TAB_ACTIVATED"),
			)
		)
			scheduleWorkflowTraining();
		return result;
	},
	onBlocked: (recoverable) => {
		if (recoverable)
			void chrome.alarms
				.create(RECOVERY_ALARM, { delayInMinutes: 0.5 })
				.catch(() => {});
	},
	onHealthy: () => {
		void chrome.alarms.clear(RECOVERY_ALARM).catch(() => {});
	},
});
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === RECOVERY_ALARM) pipeline.retry();
});
// A retained batch cannot survive termination. Stale alarms never invent work.
void chrome.alarms.clear(RECOVERY_ALARM).catch(() => {});
const enforcePageBudget = async () => {
	try {
		const { more } = await prunePageObservations(await getDb());
		await chrome.alarms.create(
			PAGE_BUDGET_ALARM,
			more ? { delayInMinutes: 1 } : { periodInMinutes: 360 },
		);
	} catch {
		await chrome.alarms.create(PAGE_BUDGET_ALARM, { delayInMinutes: 60 });
	}
};
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === PAGE_BUDGET_ALARM) void enforcePageBudget();
});
void enforcePageBudget();
const nativeInstance = crypto.randomUUID();
let nativeSequence = 0;

const TRACKING_KEY = "tabot_tracking_enabled";
const TRACKING_RESUMED_KEY = "tabot_tracking_resumed_at";
let trackingEnabled = false;
let trackingGeneration = 0;
let trackingResumedAt = 0;
const trackingReady = chrome.storage.local
	.get([TRACKING_KEY, TRACKING_RESUMED_KEY])
	.then((stored) => {
		trackingEnabled = stored[TRACKING_KEY] !== false;
		trackingResumedAt =
			typeof stored[TRACKING_RESUMED_KEY] === "number"
				? stored[TRACKING_RESUMED_KEY]
				: 0;
	})
	.catch(() => {});
let trackingUpdates = Promise.resolve();
const readTracking = async () => {
	await trackingReady;
	await trackingUpdates;
	const stored = await chrome.storage.local.get([
		TRACKING_KEY,
		TRACKING_RESUMED_KEY,
	]);
	trackingEnabled = stored[TRACKING_KEY] !== false;
	trackingResumedAt =
		typeof stored[TRACKING_RESUMED_KEY] === "number"
			? stored[TRACKING_RESUMED_KEY]
			: 0;
	return trackingEnabled;
};
const trainWorkflowAutomatically = async () => {
	if (!(await readTracking())) return;
	const db = await getDb();
	const generation = await db.getWorkflowTrainingGeneration();
	if (!(await readTracking())) return;
	await db.trainWorkflowModel(generation);
};
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === WORKFLOW_TRAINING_ALARM)
		void trainWorkflowAutomatically().catch(() => {});
});
void trackingReady.then(() => {
	if (trackingEnabled) scheduleWorkflowTraining();
});
const setTracking = (enabled: boolean) => {
	const update = trackingUpdates.then(async () => {
		await trackingReady;
		const previous = trackingEnabled;
		if (enabled === previous) return enabled;
		if (!enabled) {
			trackingEnabled = false;
			trackingGeneration++;
		}
		try {
			const resumedAt = enabled ? Date.now() : trackingResumedAt;
			await (await getDb()).advanceWorkflowTrainingGeneration();
			await chrome.storage.local.set({
				[TRACKING_KEY]: enabled,
				[TRACKING_RESUMED_KEY]: resumedAt,
			});
			if (enabled) {
				trackingResumedAt = resumedAt;
				trackingGeneration++;
				trackingEnabled = true;
			}
			await sampleForeground(enabled);
			if (enabled) scheduleWorkflowTraining();
		} catch (error) {
			trackingEnabled = previous;
			trackingGeneration++;
			if (previous) await sampleForeground();
			throw error;
		}
		return trackingEnabled;
	});
	trackingUpdates = update.then(
		() => undefined,
		() => undefined,
	);
	return update;
};
const isCaptureEligible = async (tabId: number, timestamp: unknown) => {
	await trackingReady;
	const generation = trackingGeneration;
	return (
		(await isForegroundTab(tabId)) &&
		trackingEnabled &&
		generation === trackingGeneration &&
		typeof timestamp === "number" &&
		timestamp >= trackingResumedAt
	);
};

// --- SW telemetry: browser focus is the ONLY emitted SW signal ---
// popup polling (GET_STATS/GET_COUNTS/GET_EVENTS) is answered without
// recording telemetry — extension UI interaction must not inflate event counts.
let lastFocusedWindow = -1;

const push = async (
	type: TabEventType,
	tabId: number,
	windowId: number,
	metadata?: TabEventMetadata,
	timestamp = Date.now(),
	snapshot?: { url?: string; favicon?: string },
	terminalBoundary = false,
) => {
	const generation = trackingGeneration;
	const row: StoredTabEvent = {
		id: crypto.randomUUID(),
		type,
		tabId,
		windowId,
		timestamp,
		metadata,
		url: snapshot?.url,
		favicon: snapshot?.favicon,
		source: { instanceId: nativeInstance, sequence: ++nativeSequence },
	};
	let sanitized: StoredTabEvent;
	try {
		sanitized = await sanitizeEventForIngestion(row);
	} catch (error) {
		logger.warn("event privacy processing failed", {
			code: error instanceof Error ? error.name : "unknown",
		});
		return { status: "rejected", code: "privacy-processing-failed" };
	}
	return pipeline.ingest(sanitized, async () => {
		await trackingReady;
		if (
			([
				"TAB_ACTIVATED",
				"NAVIGATION",
				"PAGE_VISIBLE",
				"SCROLL",
				"CLICK",
				"KEY_ACTIVITY",
				"NOTE_SAVED",
			].includes(type) &&
				!(await isForegroundTab(tabId))) ||
			(type !== "NOTE_SAVED" &&
				!(terminalBoundary && type === "PAGE_HIDDEN") &&
				(!trackingEnabled ||
					generation !== trackingGeneration ||
					timestamp < trackingResumedAt))
		)
			return { status: "ignored", code: "capture-policy" };
		return null;
	});
};

// --- Chrome tab lifecycle ---
chrome.tabs.onCreated.addListener((tab) => {
	if (tab.id == null || tab.windowId == null || tab.incognito) return;
	void push("TAB_CREATED", tab.id, tab.windowId, undefined, Date.now(), {
		url: tab.url,
		favicon: tab.favIconUrl,
	});
});

chrome.tabs.onActivated.addListener((info) => {
	const timestamp = Date.now();
	void (async () => {
		if (!(await isForegroundTab(info.tabId))) return;
		lastFocusedWindow = info.windowId;
		const tab = await chrome.tabs.get(info.tabId);
		await push(
			"TAB_ACTIVATED",
			info.tabId,
			info.windowId,
			undefined,
			timestamp,
			{ url: tab.url, favicon: tab.favIconUrl },
		);
	})().catch((error) => logger.warn("tab activation failed", { error }));
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
	if (tab.windowId == null) return;
	// avoid spamming on every property change — only when tab actually updated
	if (tab.incognito) return;
	void push("TAB_UPDATED", tabId, tab.windowId, undefined, Date.now(), {
		url: tab.url,
		favicon: tab.favIconUrl,
	});
});

chrome.tabs.onRemoved.addListener((tabId, info) => {
	void push("TAB_REMOVED", tabId, info.windowId);
});

// --- Navigation (spec: chrome.webNavigation) ---
if (chrome.webNavigation?.onCommitted) {
	chrome.webNavigation.onCommitted.addListener((details) => {
		if (details.frameId !== 0) return;
		void push("NAVIGATION", details.tabId, 0, undefined, details.timeStamp, {
			url: details.url,
		});
	});
	chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
		if (details.frameId !== 0) return;
		void push("NAVIGATION", details.tabId, 0, undefined, details.timeStamp, {
			url: details.url,
		});
		void chrome.tabs
			.sendMessage(details.tabId, {
				kind: "TABOT_ROUTE_CHANGED",
				url: details.url,
			})
			.catch(() => {});
	});
}

// --- SW telemetry: browser focus (needs `windows` permission) ---
// FINAL: the ONLY SW signal in production. Cross-window continuity evidence,
// consumed at the graph layer (applyFocusContinuity), never a session boundary.
if (chrome.windows?.onFocusChanged) {
	chrome.windows.onFocusChanged.addListener((windowId) => {
		const previousWindowId = lastFocusedWindow;
		// WINDOW_ID_NONE (-1) is a valid Chrome value; normalize, never drop it
		lastFocusedWindow = windowId;
		push("SW_WINDOW_FOCUS", 0, windowId, { previousWindowId });
	});
}

const sampleForeground = startForegroundTracking(
	async (type, state) => {
		return push(
			type,
			state.tabId,
			state.windowId,
			undefined,
			state.timestamp,
			state,
			// Only this trusted sampler may close an active span after pause blocks admission.
			type === "PAGE_HIDDEN",
		);
	},
	() => trackingReady.then(() => trackingEnabled),
);

// --- retired SW signals: NO producers. Historical rows remain readable ---
// (SW_POPUP_OPEN, SW_TRACKING_TOGGLE, SW_DOWNLOAD, SW_LIFECYCLE were removed
// from the production telemetry path. The tracking state still lives in
// chrome.storage.local via SET_TRACKING — just no longer persisted as a
// behavioral event. See packages/shared/src/activities/sw-semantics.ts.)

const getMergedStats = (): StatsSnapshot => pipeline.stats();
const isExtensionPageSender = (sender: chrome.runtime.MessageSender): boolean =>
	sender.id === chrome.runtime.id &&
	sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`) === true;
const deletePageEvidence = async (origin?: string) => {
	if (origin !== undefined && pageCaptureSite(origin)?.origin !== origin) {
		return { ok: false as const, code: "invalid-origin" };
	}
	pipeline.flush();
	const deadline = Date.now() + 15_000;
	while (pipeline.stats().outstandingRows > 0 && Date.now() < deadline)
		await new Promise((resolve) => setTimeout(resolve, 25));
	if (pipeline.stats().outstandingRows > 0)
		return { ok: false as const, code: "writer-busy" };
	let deleted = 0;
	for (let batch = 0; batch < 100; batch++) {
		const result = await deletePageObservations(await getDb(), { origin });
		deleted += result.deleted;
		if (!result.more) break;
		if (batch === 99) return { ok: false as const, code: "delete-incomplete" };
	}
	return { ok: true as const, deleted };
};

const respondAssistantConnections = (
	sendResponse: (response: unknown) => void,
) => {
	void (async () => {
		try {
			sendResponse(await getAssistantConnections());
		} catch {
			sendResponse(null); // Unknown is not disconnected.
		}
	})();
};

// Listeners register synchronously; literal true retains asynchronous response channel.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "SET_TRACKING") {
		void setTracking(message.enabled === true)
			.then((enabled) => sendResponse({ enabled }))
			.catch(() => sendResponse({ enabled: trackingEnabled }));
		return true;
	}

	if (message?.type === "GET_TRACKING") {
		void readTracking()
			.then((enabled) => sendResponse({ enabled }))
			.catch(() =>
				sendResponse({ ok: false, code: "tracking-status-unavailable" }),
			);
		return true;
	}

	if (
		["GET_ACTIVE_PAGE", "SAVE_NOTE", "DELETE_NOTE", "SEARCH_NOTES"].includes(
			message?.type,
		)
	) {
		if (!isExtensionPageSender(sender)) return false;
		void (async () => {
			try {
				const searchOrigin =
					message.type === "SEARCH_NOTES" && typeof message.origin === "string"
						? safeRecallUrl(message.origin)
						: null;
				if (
					message.type === "SEARCH_NOTES" &&
					(typeof message.query !== "string" ||
						!message.query.trim() ||
						message.query.length > 200 ||
						!searchOrigin ||
						searchOrigin.origin !== message.origin)
				)
					throw new Error("invalid-query");
				const db = await getDb();
				if (message.type === "SEARCH_NOTES") {
					const notes = await db.searchNotes(message.query.trim(), {
						domain: deriveSiteDomain(searchOrigin.hostname),
						limit: 20,
					});
					sendResponse({
						notes: notes.map((note) => ({
							id: note.id,
							text: note.text,
							createdAt: note.createdAt,
							title: note.title,
							host: note.host,
							url: safeRecallUrl(note.url)?.href ?? null,
						})),
					});
					return;
				}
				if (message.type === "GET_ACTIVE_PAGE") {
					const [tab] = await chrome.tabs.query({
						active: true,
						lastFocusedWindow: true,
					});
					const rawUrl = tab?.url;
					if (
						!tab?.id ||
						!tab.windowId ||
						!rawUrl ||
						tab.incognito ||
						!/^https?:\/\//.test(rawUrl)
					) {
						sendResponse({
							eligible: false,
							reason: "Notes can't be added on this page",
						});
						return;
					}
					const canonical = canonicalPageUrl(rawUrl);
					const [url, pageKey] = await Promise.all([
						sanitizeUrlForIngestion(canonical),
						createCaptureIdentity(["page-resource:v1", canonical]),
					]);
					if (!url) throw new Error("page-url-unavailable");
					const parsed = new URL(url);
					const noteTitle = (tab.title ?? "").slice(0, 300) || null;
					sendResponse({
						eligible: true,
						tabId: tab.id,
						windowId: tab.windowId,
						url,
						host: parsed.hostname,
						origin: parsed.origin,
						title: tab.title ?? null,
						favicon: tab.favIconUrl ?? null,
						pageKey,
						notes: await db.listPageNotes(pageKey, {
							url,
							host: parsed.hostname,
							title: noteTitle,
						}),
					});
					return;
				}
				if (message.type === "SAVE_NOTE") {
					if (
						!validateNoteText(message.text) ||
						!Number.isSafeInteger(message.tabId) ||
						typeof message.pageKey !== "string"
					)
						throw new Error("invalid-note");
					const tab = await chrome.tabs.get(message.tabId);
					const [active] = await chrome.tabs.query({
						active: true,
						lastFocusedWindow: true,
					});
					if (
						active?.id !== tab.id ||
						tab.incognito ||
						!tab.windowId ||
						!tab.url ||
						!/^https?:\/\//.test(tab.url)
					)
						throw new Error("page-changed");
					const canonical = canonicalPageUrl(tab.url);
					const pageKey = await createCaptureIdentity([
						"page-resource:v1",
						canonical,
					]);
					if (pageKey !== message.pageKey) throw new Error("page-changed");
					const url = await sanitizeUrlForIngestion(canonical);
					if (!url) throw new Error("page-url-unavailable");
					const parsed = new URL(url);
					const now = Date.now();
					const note: PageNote = {
						id:
							typeof message.id === "string" ? message.id : crypto.randomUUID(),
						text: message.text,
						createdAt:
							typeof message.id === "string"
								? ((await db.listPageNotes(pageKey)).find(
										(item) => item.id === message.id,
									)?.createdAt ?? now)
								: now,
						updatedAt: now,
						url,
						origin: parsed.origin,
						host: parsed.hostname,
						site: deriveSiteDomain(parsed.hostname),
						title: (tab.title ?? "").slice(0, 300) || null,
						favicon: tab.favIconUrl ?? null,
						pageKey,
						tabId: tab.id,
						windowId: tab.windowId,
						eventId: null,
					};
					const saved = await db.saveNote(note);
					if (typeof message.id !== "string") {
						try {
							const ack = await push(
								"NOTE_SAVED",
								tab.id,
								tab.windowId,
								{ noteId: saved.id },
								now,
								{ url, favicon: tab.favIconUrl },
							);
							if (ack.status === "persisted" && "id" in ack)
								await db.linkNoteEvent(saved.id, ack.id);
						} catch (error) {
							logger.warn("note saved but activity link failed", {
								code: error instanceof Error ? error.message : "unknown",
							});
						}
					}
					sendResponse({ note: saved });
					return;
				}
				if (typeof message.id !== "string") throw new Error("invalid-note-id");
				sendResponse(await db.deleteNote(message.id));
			} catch (error) {
				sendResponse({
					ok: false,
					code: error instanceof Error ? error.message : "notes-unavailable",
				});
			}
		})();
		return true;
	}

	if (message?.kind === "TABOT_PAGE_OBSERVATION") {
		void ingestPageObservationMessage(message, sender, {
			extensionId: chrome.runtime.id,
			pipeline,
			find: async (id) => getPageObservationById(await getDb(), id),
			eligible: (tabId) => isCaptureEligible(tabId, message.timestamp),
			captureIdentity: createCaptureIdentity,
		})
			.then(sendResponse)
			.catch(() =>
				sendResponse({ status: "retryable", code: "storage-unavailable" }),
			);
		return true;
	}

	if (message?.kind === "TABOT_PAGE_EVENT") {
		void ingestPageMessage(message, sender, {
			extensionId: chrome.runtime.id,
			pipeline,
			find: async (id) => (await getDb()).findEvent(id),
			eligible: (tabId) => isCaptureEligible(tabId, message.timestamp),
			captureIdentity: createCaptureIdentity,
		})
			.then(sendResponse)
			.catch(() =>
				sendResponse({ status: "retryable", code: "storage-unavailable" }),
			);
		return true;
	}
	if (message?.type === "RETRY_INGEST") {
		sendResponse({ resumed: pipeline.retry(true) });
		return false;
	}

	if (message?.type === "GET_ASSISTANT_CONNECTIONS") {
		respondAssistantConnections(sendResponse);
		return true;
	}

	if (message?.type === "GET_RELAY_STATUS") {
		try {
			sendResponse(getRelayStatus());
		} catch {}
		return false;
	}

	if (message?.type === "RUN_RELAY_SANITY_CHECK") {
		if (!isExtensionPageSender(sender)) return false;
		void runRelaySanityCheck().then(sendResponse);
		return true;
	}

	if (message?.type === "GET_STATS") {
		try {
			sendResponse(getMergedStats());
		} catch {}
		return false;
	}

	if (message?.type === "GET_COUNTS") {
		getStorageCounts(true)
			.then((counts) => {
				try {
					sendResponse(counts);
				} catch {}
			})
			.catch(() => {
				try {
					sendResponse(readFailure());
				} catch {}
			});
		return true;
	}

	if (message?.type === "GET_EVENTS") {
		getDb()
			.then((db) => getAllEvents(db))
			.then((events) => {
				try {
					sendResponse(events);
				} catch {}
			})
			.catch(() => {
				try {
					sendResponse(readFailure());
				} catch {}
			});
		return true;
	}

	if (message?.type === "GET_PAGE_CAPTURE_SUMMARIES") {
		if (!isExtensionPageSender(sender)) return false;
		getDb()
			.then((db) => getPageCaptureSiteSummaries(db))
			.then(sendResponse)
			.catch(() => sendResponse(readFailure()));
		return true;
	}

	if (message?.type === "GET_PAGE_OBSERVATIONS") {
		if (!isExtensionPageSender(sender)) return false;
		const { from, to, limit } = message;
		getDb()
			.then((db) => getPageObservations(db, from, to, limit))
			.then(sendResponse)
			.catch(() => sendResponse(readFailure()));
		return true;
	}

	if (message?.type === "GET_PAGE_OBSERVATION") {
		if (!isExtensionPageSender(sender) || typeof message.id !== "string")
			return false;
		getDb()
			.then((db) => getPageObservationById(db, message.id))
			.then(sendResponse)
			.catch(() => sendResponse(readFailure()));
		return true;
	}

	if (message?.type === "DELETE_PAGE_OBSERVATIONS") {
		if (!isExtensionPageSender(sender)) return false;
		const { origin } = message;
		void deletePageEvidence(origin)
			.then(sendResponse)
			.catch(() => sendResponse({ ok: false, code: "delete-failed" }));
		return true;
	}

	return false;
});

const isRelayAuthorizationPage = (url: string | undefined): boolean => {
	if (!url) return false;
	try {
		return new URL(url).origin === new URL(getRelayStatus().relayUrl).origin;
	} catch {
		return false;
	}
};

// externally_connectable Home + OAuth consent page — only the relay's
// origin can ask this extension to approve an authorization transaction.
if (chrome.runtime.onMessageExternal) {
	chrome.runtime.onMessageExternal.addListener(
		(message, sender, sendResponse) => {
			if (message?.type === "TABOT_APPROVE_AUTHORIZATION") {
				if (
					!isRelayAuthorizationPage(sender.url) ||
					typeof message.transactionId !== "string" ||
					!message.transactionId
				)
					return false;
				void (async () => {
					try {
						await approveAuthorizationTransaction(message.transactionId);
						sendResponse({ ok: true });
					} catch {
						sendResponse({ ok: false });
					}
				})();
				return true;
			}

			if (
				message?.type === "SEARCH_HISTORY" ||
				message?.type === "GET_PAGE_PREVIEW" ||
				message?.type === "GET_WORKFLOW_CANDIDATES" ||
				message?.type === "CREATE_WORKFLOW_HANDOFF" ||
				message?.type === "GET_WORKFLOW_SCRIPT_DRAFTS" ||
				message?.type === "DELETE_WORKFLOW_SCRIPT_DRAFT"
			) {
				void (async () => {
					sendResponse(
						await readDashboardHistory(
							message,
							sender.url,
							getDb,
							readTracking,
						),
					);
				})();
				return true;
			}
			if (!isDashboardSender(sender.url)) {
				sendResponse({ ok: false, code: "unauthorized-sender" });
				return false;
			}

			if (message?.type === "GET_ACTIVE_TRACKING_DURATION") {
				void (async () => {
					const enabled = await readTracking();
					const db = await getDb();
					const events = await db.readEvents({
						types: [
							"PAGE_VISIBLE",
							"PAGE_HIDDEN",
							"SW_WINDOW_FOCUS",
							"TAB_ACTIVATED",
							"NAVIGATION",
							"TAB_UPDATED",
						],
					});
					const now = Date.now();
					const spans = activeSpans(events);
					const lastSpan = spans.at(-1);
					const latest = foregroundEvents(events).at(-1);
					const active =
						enabled &&
						lastSpan !== undefined &&
						latest?.timestamp === lastSpan.end &&
						now - lastSpan.end < ACTIVITY_GAP_MS;
					sendResponse({
						durationMs:
							activeDuration(spans, 0, now) +
							(active ? now - (lastSpan?.end ?? now) : 0),
						active,
					});
				})().catch(() => sendResponse(readFailure()));
				return true;
			}
			if (message?.type === "GET_TRACKING") {
				void readTracking()
					.then((enabled) => sendResponse({ enabled }))
					.catch(() =>
						sendResponse({ ok: false, code: "tracking-status-unavailable" }),
					);
				return true;
			}
			if (message?.type === "SET_TRACKING") {
				if (typeof message.enabled !== "boolean") {
					sendResponse({ ok: false, code: "tracking-update-failed" });
					return false;
				}
				void setTracking(message.enabled)
					.then((enabled) => sendResponse({ enabled }))
					.catch(() =>
						sendResponse({ ok: false, code: "tracking-update-failed" }),
					);
				return true;
			}
			if (message?.type === "GET_ASSISTANT_CONNECTIONS") {
				respondAssistantConnections(sendResponse);
				return true;
			}

			if (message?.type === "GET_STATS") {
				try {
					sendResponse(getMergedStats());
				} catch {}
				return false;
			}
			if (message?.type === "GET_COUNTS") {
				getStorageCounts(true)
					.then((counts) => {
						try {
							sendResponse(counts);
						} catch {}
					})
					.catch(() => {
						try {
							sendResponse(readFailure());
						} catch {}
					});
				return true;
			}
			if (message?.type === "GET_EVENTS") {
				getDb()
					.then((db) => getAllEvents(db))
					.then((events) => {
						try {
							sendResponse(events);
						} catch {}
					})
					.catch(() => {
						try {
							sendResponse(readFailure());
						} catch {}
					});
				return true;
			}
			return false;
		},
	);
}

startRelay();
