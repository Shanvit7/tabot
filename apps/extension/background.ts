/// <reference types="chrome" />

import {
	bulkInsertIngestRecords,
	countEvents,
	deletePageObservations,
	getAllEvents,
	getPageCaptureSiteSummaries,
	getPageObservationById,
	getPageObservations,
	logger,
	prunePageObservations,
	readFailure,
	type StatsSnapshot,
	type StoredIngestRecord,
	type StoredTabEvent,
	sanitizeEventForIngestion,
	type TabEventMetadata,
	type TabEventType,
} from "@tabot/shared";
import { createCaptureIdentity } from "./capture-identity";
import { createEventPipeline } from "./event-pipeline";
import { isForegroundTab, startForegroundTracking } from "./foreground";
import {
	normalizePageCaptureOrigins,
	PAGE_CAPTURE_ORIGINS_KEY,
	pageCaptureSite,
} from "./page-capture-consent";
import {
	ingestPageMessage,
	ingestPageObservationMessage,
} from "./page-ingress";
import {
	approveAuthorizationTransaction,
	getAssistantConnections,
	getRelayStatus,
	startRelay,
} from "./relay";
import { getStorageDb } from "./storage-client";

// One service worker, one bounded serial writer. Queued is not persisted.
const RECOVERY_ALARM = "tabot-ingest-recovery";
const PAGE_RETENTION_ALARM = "tabot-page-retention";
const getDb = getStorageDb;
const pipeline = createEventPipeline<StoredIngestRecord>({
	commit: async (rows) => bulkInsertIngestRecords(await getDb(), rows),
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
const prunePageEvidence = async () => {
	try {
		const { more } = await prunePageObservations(await getDb());
		await chrome.alarms.create(
			PAGE_RETENTION_ALARM,
			more ? { delayInMinutes: 1 } : { periodInMinutes: 360 },
		);
	} catch {
		await chrome.alarms.create(PAGE_RETENTION_ALARM, { delayInMinutes: 60 });
	}
};
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === PAGE_RETENTION_ALARM) void prunePageEvidence();
});
void prunePageEvidence();
const nativeInstance = crypto.randomUUID();
let nativeSequence = 0;

const TRACKING_KEY = "tabot_tracking_enabled";
let trackingEnabled = true;
const trackingReady = chrome.storage.local
	.get(TRACKING_KEY)
	.then((stored) => {
		trackingEnabled = stored[TRACKING_KEY] !== false;
	})
	.catch(() => {});

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
) => {
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
	return pipeline.ingest(
		sanitized,
		async () => {
			await trackingReady;
			if (
				!trackingEnabled ||
				([
					"TAB_ACTIVATED",
					"NAVIGATION",
					"PAGE_VISIBLE",
					"SCROLL",
					"CLICK",
					"KEY_ACTIVITY",
				].includes(type) &&
					!(await isForegroundTab(tabId)))
			)
				return { status: "ignored", code: "capture-policy" };
			return null;
		},
		true,
	);
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

const sampleForeground = startForegroundTracking(async (type, state) => {
	return push(
		type,
		state.tabId,
		state.windowId,
		undefined,
		state.timestamp,
		state,
	);
});

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
	const origins = await chrome.storage.local
		.get(PAGE_CAPTURE_ORIGINS_KEY)
		.then((stored) =>
			normalizePageCaptureOrigins(stored[PAGE_CAPTURE_ORIGINS_KEY]),
		);
	if (origin !== undefined && pageCaptureSite(origin)?.origin !== origin) {
		return { ok: false as const, code: "invalid-origin" };
	}
	const remaining = origin ? origins.filter((item) => item !== origin) : [];
	await chrome.storage.local.set({ [PAGE_CAPTURE_ORIGINS_KEY]: remaining });
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
	return { ok: true as const, deleted, consentedOrigins: remaining };
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
		void (async () => {
			await trackingReady;
			if (message.enabled !== true) await sampleForeground(false);
			trackingEnabled = message.enabled === true;
			await chrome.storage.local.set({ [TRACKING_KEY]: trackingEnabled });
			if (trackingEnabled) await sampleForeground();
			sendResponse({ enabled: trackingEnabled });
		})().catch(() => sendResponse({ enabled: trackingEnabled }));
		return true;
	}

	if (message?.type === "GET_TRACKING") {
		trackingReady.then(() => sendResponse({ enabled: trackingEnabled }));
		return true;
	}

	if (message?.kind === "TABOT_PAGE_OBSERVATION") {
		void ingestPageObservationMessage(message, sender, {
			extensionId: chrome.runtime.id,
			pipeline,
			find: async (id) => getPageObservationById(await getDb(), id),
			eligible: async (tabId) => {
				await trackingReady;
				return trackingEnabled && (await isForegroundTab(tabId));
			},
			consentedOrigins: async () => {
				const stored = await chrome.storage.local.get(PAGE_CAPTURE_ORIGINS_KEY);
				return stored[PAGE_CAPTURE_ORIGINS_KEY];
			},
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
			eligible: async (tabId) => {
				await trackingReady;
				return trackingEnabled && (await isForegroundTab(tabId));
			},
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

	if (message?.type === "GET_STATS") {
		try {
			sendResponse(getMergedStats());
		} catch {}
		return false;
	}

	if (message?.type === "GET_COUNTS") {
		getDb()
			.then((db) => countEvents(db))
			.then((eventCount) => {
				try {
					sendResponse({ eventCount });
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
				getDb()
					.then((db) => countEvents(db))
					.then((eventCount) => {
						try {
							sendResponse({ eventCount });
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
