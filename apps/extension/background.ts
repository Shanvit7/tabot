/// <reference types="chrome" />

import notificationIcon from "data-base64:~assets/icon-128.png";
import {
	bulkInsertEvents,
	chatGptContextUrl,
	chatGptPromptUrl,
	countEvents,
	createEventsDb,
	getAllEvents,
	getContexts,
	getMemories,
	getMeta,
	isAiReadyContext,
	logger,
	memoryPrompt,
	nextNotifiableContext,
	readFailure,
	removeMeta,
	resolveChatGptConnectUrl,
	type StatsSnapshot,
	type StoredTabEvent,
	type TabEventMetadata,
	type TabEventType,
	updateMeta,
} from "@tabot/shared";
import { createEventPipeline } from "./event-pipeline";
import { isForegroundTab, startForegroundTracking } from "./foreground";
import {
	isNotifiableEpisode,
	nextNotifiableMemory,
} from "./notification-model";
import { ingestPageMessage } from "./page-ingress";
import {
	approveAuthorizationTransaction,
	getAssistantConnections,
	getRelayStatus,
	startRelay,
} from "./relay";

// One service worker, one bounded serial writer. Queued is not persisted.
const RECOVERY_ALARM = "tabot-ingest-recovery";
const getDb = createEventsDb;
const pipeline = createEventPipeline({
	commit: async (rows) => bulkInsertEvents(await getDb(), rows),
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
const nativeInstance = crypto.randomUUID();
let nativeSequence = 0;

const TRACKING_KEY = "tabot_tracking_enabled";
const NOTIFICATION_KEY = "tabot_context_notification";
const NOTIFICATION_ID = "tabot-context-ready";
const NOTIFICATION_ALARM = "tabot-context-check";
const PREVIEW_ALARM = "tabot-notification-preview";
const PREVIEW_INDEX_KEY = "tabot_notification_preview_index";
const notificationPreviewEnabled =
	process.env.NODE_ENV === "development" &&
	process.env.PLASMO_PUBLIC_NOTIFICATION_PREVIEW === "1";
const POPUP_LAST_VIEWED_KEY = "tabot_popup_last_viewed_v1";
const STARTUP_POPUP_DAY_KEY = "tabot_startup_popup_day";
const HOME_URL =
	process.env.PLASMO_PUBLIC_HOME_URL ?? "https://shanvit7.github.io/tabot/home";
interface NotificationState {
	lastEnd: number;
	lastNotifiedAt: number;
	lastMemorySeen?: number;
	contextId?: string;
	memoryId?: string;
	kind?: "context" | "episode" | "memory";
	chatGptConnected?: boolean;
}

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

const push = (
	type: TabEventType,
	tabId: number,
	windowId: number,
	metadata?: TabEventMetadata,
	timestamp = Date.now(),
	snapshot: { url?: string; favicon?: string } | undefined = getMeta(tabId),
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
	return pipeline.ingest(
		row,
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
	if (tab.url) updateMeta(tab.id, { url: tab.url });
	if (tab.title) updateMeta(tab.id, { title: tab.title });
	if (tab.favIconUrl) updateMeta(tab.id, { favicon: tab.favIconUrl });
});

chrome.tabs.onActivated.addListener((info) => {
	const timestamp = Date.now();
	void (async () => {
		if (!(await isForegroundTab(info.tabId))) return;
		lastFocusedWindow = info.windowId;
		const tab = await chrome.tabs.get(info.tabId);
		updateMeta(info.tabId, { url: tab.url, favicon: tab.favIconUrl });
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (tab.windowId == null) return;
	// avoid spamming on every property change — only when tab actually updated
	if (tab.incognito) return;
	void push("TAB_UPDATED", tabId, tab.windowId, undefined, Date.now(), {
		url: tab.url,
		favicon: tab.favIconUrl,
	});
	if (changeInfo.url) updateMeta(tabId, { url: changeInfo.url });
	if (changeInfo.title) updateMeta(tabId, { title: changeInfo.title });
	if (changeInfo.favIconUrl)
		updateMeta(tabId, { favicon: changeInfo.favIconUrl });
});

chrome.tabs.onRemoved.addListener((tabId, info) => {
	void push("TAB_REMOVED", tabId, info.windowId);
	removeMeta(tabId);
});

// --- Navigation (spec: chrome.webNavigation) ---
if (chrome.webNavigation?.onCommitted) {
	chrome.webNavigation.onCommitted.addListener((details) => {
		if (details.frameId !== 0) return;
		void push("NAVIGATION", details.tabId, 0, undefined, details.timeStamp, {
			url: details.url,
		});
		if (details.url) updateMeta(details.tabId, { url: details.url });
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
	updateMeta(state.tabId, { url: state.url, favicon: state.favicon });
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

	if (message?.kind === "TABOT_PAGE_EVENT") {
		void ingestPageMessage(message, sender, {
			extensionId: chrome.runtime.id,
			pipeline,
			find: async (id) => (await getDb()).events.get(id),
			eligible: async (tabId) => {
				await trackingReady;
				return trackingEnabled && (await isForegroundTab(tabId));
			},
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
			.then((dexieCount) => {
				try {
					sendResponse({ dexieCount, rxdbCount: dexieCount });
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
					.then((dexieCount) => {
						try {
							sendResponse({ dexieCount, rxdbCount: dexieCount });
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

// First run seeds high-water marks so existing contexts and memories never
// trigger historical notifications. Only future, completed evidence counts.
void chrome.storage.local
	.get(NOTIFICATION_KEY)
	.then((stored) => {
		if (!stored[NOTIFICATION_KEY]) {
			const now = Date.now();
			return chrome.storage.local.set({
				[NOTIFICATION_KEY]: {
					lastEnd: now,
					lastMemorySeen: now,
					lastNotifiedAt: 0,
				},
			});
		}
	})
	.catch((error) => logger.warn("notification init failed", { error }));
void chrome.alarms
	.get(NOTIFICATION_ALARM)
	.then((alarm) => {
		if (!alarm)
			return chrome.alarms.create(NOTIFICATION_ALARM, { periodInMinutes: 15 });
	})
	.catch((error) => logger.warn("notification alarm failed", { error }));

if (notificationPreviewEnabled) {
	void chrome.alarms.get(PREVIEW_ALARM).then((alarm) => {
		if (!alarm)
			void chrome.alarms.create(PREVIEW_ALARM, { periodInMinutes: 0.25 });
	});
} else {
	void chrome.alarms.clear(PREVIEW_ALARM);
}

let notificationCheckRunning = false;
const checkNotifications = async () => {
	if (notificationCheckRunning) return;
	notificationCheckRunning = true;
	try {
		await trackingReady;
		if (!trackingEnabled) return;
		const stored = await chrome.storage.local.get(NOTIFICATION_KEY);
		const state = stored[NOTIFICATION_KEY] as NotificationState | undefined;
		if (!state) return;
		const now = Date.now();
		if (now - state.lastNotifiedAt < 6 * 3_600_000) return;
		const db = await getDb();
		const [contexts, memories] = await Promise.all([
			getContexts(db),
			getMemories(db),
		]);
		const context = nextNotifiableContext(contexts, state.lastEnd, now);
		const memory = nextNotifiableMemory(
			memories,
			state.lastMemorySeen ?? state.lastEnd,
			now,
		);
		if (!context && !memory) return;

		const notifyMemory =
			memory !== undefined &&
			(!context || memory.lastSeen >= context.endTimestamp);
		const selectedContext = notifyMemory
			? contexts.find((item) => item.id === memory.lastContextId)
			: context;
		if (!selectedContext) return;
		const episode = selectedContext.episodes
			?.filter(
				(item) =>
					isNotifiableEpisode(item) &&
					item.endTimestamp <= now - 30 * 60_000 &&
					item.endTimestamp >= now - 24 * 3_600_000,
			)
			.toSorted((a, b) => b.endTimestamp - a.endTimestamp)[0];
		const kind = notifyMemory ? "memory" : episode ? "episode" : "context";
		const connected = await getAssistantConnections()
			.then((result) => result.chatgpt)
			.catch(() => false);
		const title =
			kind === "memory"
				? "A browsing pattern is repeating"
				: kind === "episode"
					? "Activity worth a look"
					: "Activity summary ready";
		const message =
			kind === "memory"
				? `Similar activity appeared ${memory.evidence.occurrenceCount} times across separate periods. Ask ChatGPT what repeats.`
				: `${(episode ?? selectedContext).domains.length} sites · ${Math.round((episode ?? selectedContext).duration / 60_000)} min. Ask ChatGPT to explore this thread.`;
		try {
			await chrome.action.openPopup();
		} catch {
			await chrome.notifications.create(NOTIFICATION_ID, {
				type: "basic",
				iconUrl: notificationIcon,
				title,
				message,
				buttons: [{ title: connected ? "Ask ChatGPT" : "Connect ChatGPT" }],
			});
		}
		await chrome.storage.local.set({
			[NOTIFICATION_KEY]: {
				...state,
				lastEnd: Math.max(state.lastEnd, selectedContext.endTimestamp),
				lastMemorySeen: notifyMemory
					? memory.lastSeen
					: (state.lastMemorySeen ?? state.lastEnd),
				lastNotifiedAt: now,
				contextId: selectedContext.id,
				memoryId: notifyMemory ? memory.id : undefined,
				kind,
				chatGptConnected: connected,
			},
		});
	} catch (error) {
		logger.warn("context notification failed", { error });
	} finally {
		notificationCheckRunning = false;
	}
};

const openStartupPopupForUnreadInsight = async () => {
	if (process.env.NODE_ENV === "development") return;
	const now = Date.now();
	const localDay = `${new Date(now).getFullYear()}-${new Date(now).getMonth()}-${new Date(now).getDate()}`;
	const stored = await chrome.storage.local.get([
		NOTIFICATION_KEY,
		POPUP_LAST_VIEWED_KEY,
		STARTUP_POPUP_DAY_KEY,
	]);
	const notificationState = stored[NOTIFICATION_KEY] as
		| NotificationState
		| undefined;
	const lastViewed = stored[POPUP_LAST_VIEWED_KEY];
	if (
		stored[STARTUP_POPUP_DAY_KEY] === localDay ||
		(notificationState?.lastNotifiedAt &&
			now - notificationState.lastNotifiedAt < 6 * 3_600_000) ||
		typeof lastViewed !== "number"
	)
		return;
	const contexts = await getContexts(await getDb());
	const hasUnreadInsight = contexts.some(
		(context) =>
			context.endTimestamp > lastViewed &&
			context.endTimestamp >= now - 24 * 3_600_000 &&
			context.endTimestamp <= now &&
			isAiReadyContext(context),
	);
	if (!hasUnreadInsight) return;
	await chrome.action.openPopup();
	await chrome.storage.local.set({ [STARTUP_POPUP_DAY_KEY]: localDay });
};

chrome.runtime.onStartup.addListener(() => {
	void checkNotifications()
		.then(openStartupPopupForUnreadInsight)
		.catch((error) => logger.warn("startup popup failed", { error }));
});
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === PREVIEW_ALARM && notificationPreviewEnabled) {
		void chrome.storage.local
			.get(PREVIEW_INDEX_KEY)
			.then(async (stored) => {
				const current = stored[PREVIEW_INDEX_KEY];
				const index = Number.isInteger(current) ? (current + 1) % 6 : 0;
				await chrome.storage.local.set({ [PREVIEW_INDEX_KEY]: index });
				await chrome.action.openPopup();
			})
			.catch((error) => logger.warn("notification preview failed", { error }));
		return;
	}
	if (alarm.name === NOTIFICATION_ALARM) void checkNotifications();
});

chrome.notifications.onClicked.addListener((id) => {
	if (id !== NOTIFICATION_ID) return;
	void chrome.storage.local
		.get(NOTIFICATION_KEY)
		.then((stored) => {
			const state = stored[NOTIFICATION_KEY] as NotificationState | undefined;
			if (state?.contextId) {
				const url = new URL(HOME_URL);
				url.searchParams.set("context", state.contextId);
				return chrome.tabs.create({ url: url.toString() });
			}
		})
		.catch((error) => logger.warn("open context failed", { error }));
});

chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
	if (id !== NOTIFICATION_ID || buttonIndex !== 0) return;
	void chrome.storage.local
		.get(NOTIFICATION_KEY)
		.then((stored) => {
			const state = stored[NOTIFICATION_KEY] as NotificationState | undefined;
			if (!state) return;
			if (state.chatGptConnected !== true)
				return resolveChatGptConnectUrl().then((url) =>
					chrome.tabs.create({ url }),
				);
			if (state.kind === "memory" && state.memoryId)
				return chrome.tabs.create({
					url: chatGptPromptUrl(memoryPrompt(state.memoryId)),
				});
			if (state.contextId)
				return chrome.tabs.create({ url: chatGptContextUrl(state.contextId) });
		})
		.catch((error) => logger.warn("open ChatGPT failed", { error }));
});

startRelay();
