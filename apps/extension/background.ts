/// <reference types="chrome" />

import notificationIcon from "data-base64:~assets/icon-128.png";
import {
	bulkInsertEvents,
	chatGptContextUrl,
	chatGptPromptUrl,
	countEvents,
	createBuffer,
	createEmptyStats,
	createEventsDb,
	getAllEvents,
	getContexts,
	getMemories,
	getMeta,
	isAiReadyContext,
	LIFECYCLE_KINDS,
	logger,
	memoryPrompt,
	nextNotifiableContext,
	POPUP_SOURCE,
	pushEvent,
	removeMeta,
	type StatsSnapshot,
	type StoredTabEvent,
	type TabEventMetadata,
	type TabEventType,
	updateMeta,
} from "@tabot/shared";
import { isForegroundTab, startForegroundTracking } from "./foreground";
import {
	isNotifiableEpisode,
	nextNotifiableMemory,
} from "./notification-model";
import {
	approveAuthorizationTransaction,
	getAssistantConnection,
	getRelayStatus,
	startRelay,
} from "./relay";

// --- Shared buffer (transient hot path) ---
const CAPACITY = 10_000;
const { control, events, capacity } = createBuffer(CAPACITY);

// ponytail: no Blob Worker — service workers have no URL.createObjectURL, inline drain keeps same SAB semantics
const EVENT_SLOT_SIZE = 8;
const READ_INDEX = 1;
const PUBLISHED_INDEX = 3;
const MAX_BATCH_SIZE = 512;
const TYPE_NAMES: TabEventType[] = [
	"TAB_CREATED",
	"TAB_ACTIVATED",
	"TAB_UPDATED",
	"TAB_REMOVED",
	"NAVIGATION",
	"PAGE_VISIBLE",
	"PAGE_HIDDEN",
	"SCROLL",
	"CLICK",
	"KEY_ACTIVITY",
	// --- SW telemetry — must stay index-aligned with EVENT_TYPES 10–14 ---
	// FINAL: only SW_WINDOW_FOCUS is produced. Entries 11–14 remain index-aligned
	// so HISTORICAL persisted rows still decode deterministically; they are never
	// emitted by this producer anymore.
	"SW_WINDOW_FOCUS",
	"SW_POPUP_OPEN",
	"SW_TRACKING_TOGGLE",
	"SW_DOWNLOAD",
	"SW_LIFECYCLE",
];

const TRACKING_KEY = "tabot_tracking_enabled";
const NOTIFICATION_KEY = "tabot_context_notification";
const NOTIFICATION_ID = "tabot-context-ready";
const NOTIFICATION_ALARM = "tabot-context-check";
const PREVIEW_ALARM = "tabot-notification-preview";
const PREVIEW_INDEX_KEY = "tabot_notification_preview_index";
const POPUP_LAST_VIEWED_KEY = "tabot_popup_last_viewed_v1";
const STARTUP_POPUP_DAY_KEY = "tabot_startup_popup_day";
const HOME_URL =
	process.env.PLASMO_PUBLIC_HOME_URL ?? "https://shanvit7.github.io/tabot/home";
const CHATGPT_URL = "https://chatgpt.com/plugins?search=Tabot";
interface NotificationState {
	lastEnd: number;
	lastNotifiedAt: number;
	lastMemorySeen?: number;
	contextId?: string;
	memoryId?: string;
	kind?: "context" | "episode" | "memory";
	chatGptConnected?: boolean;
}

const latestStats: StatsSnapshot = createEmptyStats(capacity);
let droppedEvents = 0;
let drainScheduled = false;
let trackingEnabled = true;
const trackingReady = chrome.storage.local
	.get(TRACKING_KEY)
	.then((stored) => {
		trackingEnabled = stored[TRACKING_KEY] !== false;
	})
	.catch(() => {});

// ponytail: batch Dexie persistence downstream of SAB — IndexedDB bulkPut keeps hot path allocation-free
let dbPromise: ReturnType<typeof createEventsDb> | null = null;
const getDb = (): ReturnType<typeof createEventsDb> => {
	if (!dbPromise) dbPromise = createEventsDb();
	return dbPromise;
};

// --- SW telemetry: browser focus is the ONLY emitted SW signal ---
// popup polling (GET_STATS/GET_COUNTS/GET_EVENTS) is answered without
// recording telemetry — extension UI interaction must not inflate event counts.
let lastFocusedWindow = -1;

const processBatch = (): number => {
	const read = Atomics.load(control, READ_INDEX);
	const published = Atomics.load(control, PUBLISHED_INDEX);
	const available = published - read;
	if (available <= 0) return 0;
	const count = Math.min(available, MAX_BATCH_SIZE);
	const docs: StoredTabEvent[] = [];
	for (let i = 0; i < count; i++) {
		const logical = read + i;
		const slot = logical % capacity;
		const base = slot * EVENT_SLOT_SIZE;
		const typeVal = Atomics.load(events, base + 0);
		const type = TYPE_NAMES[typeVal] ?? "TAB_CREATED";
		const tabId = Atomics.load(events, base + 1);
		const windowId = Atomics.load(events, base + 2);
		const slot3 = Atomics.load(events, base + 3);
		const tsHigh = Atomics.load(events, base + 4);
		const tsLow = Atomics.load(events, base + 5);
		const v0 = Atomics.load(events, base + 6);
		const v1 = Atomics.load(events, base + 7);
		const timestamp = tsHigh * 2 ** 32 + (tsLow >>> 0);
		latestStats.totalEvents++;
		latestStats.eventsProcessed++;
		if (type === "TAB_CREATED") latestStats.tabCreated++;
		else if (type === "TAB_ACTIVATED") latestStats.tabActivated++;
		else if (type === "TAB_UPDATED") latestStats.tabUpdated++;
		else if (type === "TAB_REMOVED") latestStats.tabRemoved++;
		else if (type === "NAVIGATION") latestStats.navigation++;
		else if (type === "PAGE_VISIBLE") latestStats.pageVisible++;
		else if (type === "PAGE_HIDDEN") latestStats.pageHidden++;
		else if (type === "SCROLL") latestStats.scroll++;
		else if (type === "CLICK") latestStats.click++;
		else if (type === "KEY_ACTIVITY") latestStats.keyActivity++;
		let metadata: StoredTabEvent["metadata"];
		if (type === "SCROLL" && v0 !== 0) metadata = { scrollY: v0 };
		else if (type === "CLICK" && (v0 !== 0 || v1 !== 0))
			metadata = { x: v0, y: v1 };
		else if (type === "SW_WINDOW_FOCUS") metadata = { previousWindowId: slot3 };
		else if (type === "SW_TRACKING_TOGGLE") metadata = { enabled: slot3 !== 0 };
		else if (type === "SW_DOWNLOAD") metadata = { state: v0 };
		else if (type === "SW_POPUP_OPEN")
			metadata = {
				source: windowId === POPUP_SOURCE.POPUP ? "popup" : "dashboard",
			};
		else if (type === "SW_LIFECYCLE") {
			const kind = LIFECYCLE_KINDS[windowId];
			if (kind) metadata = { lifecycle: kind };
		}
		docs.push({
			id: `${timestamp}-${tabId}-${logical}`,
			type,
			tabId,
			windowId,
			timestamp,
			metadata,
		});
	}
	Atomics.store(control, READ_INDEX, read + count);
	const occupancy = Math.max(
		0,
		Atomics.load(control, 0) - Atomics.load(control, 1),
	);
	latestStats.bufferOccupancy = occupancy;
	if (occupancy > latestStats.peakBufferOccupancy)
		latestStats.peakBufferOccupancy = occupancy;
	latestStats.lastProcessedAt = Date.now();
	latestStats.droppedEvents = droppedEvents;
	if (docs.length) {
		const enriched: StoredTabEvent[] = docs.map((d) => {
			const meta = getMeta(d.tabId);
			if (!meta) return d;
			const next = { ...d };
			if (meta.url) next.url = meta.url;
			if (meta.favicon) next.favicon = meta.favicon;
			return next;
		});
		getDb()
			.then((db) => bulkInsertEvents(db, enriched))
			.catch((err) => logger.warn("bulkInsert failed", { error: err }));
	}
	return count;
};

const scheduleDrain = () => {
	if (drainScheduled) return;
	drainScheduled = true;
	const run = () => {
		drainScheduled = false;
		const n = processBatch();
		// keep draining synchronously if more remains, otherwise poll
		if (
			Atomics.load(control, PUBLISHED_INDEX) > Atomics.load(control, READ_INDEX)
		) {
			scheduleDrain();
		} else if (n > 0) {
			// one more poll shortly after a batch in case of burst
			setTimeout(scheduleDrain, 50);
		}
	};
	// microtask then immediate — lets push() finish before draining
	queueMicrotask(run);
};

// fallback poll for burst safety (service workers can't Atomics.wait — polling is the wakeup)
setInterval(() => {
	if (
		Atomics.load(control, PUBLISHED_INDEX) > Atomics.load(control, READ_INDEX)
	)
		scheduleDrain();
}, 200);

// --- Single producer (spec §5, §9) ---
const push = async (
	type: TabEventType,
	tabId: number,
	windowId: number,
	metadata?: TabEventMetadata,
	timestamp = Date.now(),
) => {
	await trackingReady;
	if (!trackingEnabled) return false;
	if (
		[
			"TAB_ACTIVATED",
			"NAVIGATION",
			"PAGE_VISIBLE",
			"SCROLL",
			"CLICK",
			"KEY_ACTIVITY",
		].includes(type) &&
		!(await isForegroundTab(tabId))
	)
		return false;
	const ok = pushEvent(control, events, capacity, {
		type,
		tabId,
		windowId,
		timestamp,
		metadata,
	});
	if (!ok) {
		droppedEvents++;
		latestStats.droppedEvents = droppedEvents;
	} else {
		scheduleDrain();
	}
	return ok;
};

// --- Chrome tab lifecycle ---
chrome.tabs.onCreated.addListener((tab) => {
	if (tab.id == null || tab.windowId == null) return;
	push("TAB_CREATED", tab.id, tab.windowId);
	if (tab.url) updateMeta(tab.id, { url: tab.url });
	if (tab.title) updateMeta(tab.id, { title: tab.title });
	if (tab.favIconUrl) updateMeta(tab.id, { favicon: tab.favIconUrl });
});

chrome.tabs.onActivated.addListener((info) => {
	void (async () => {
		if (!(await isForegroundTab(info.tabId))) return;
		lastFocusedWindow = info.windowId;
		const tab = await chrome.tabs.get(info.tabId);
		updateMeta(info.tabId, { url: tab.url, favicon: tab.favIconUrl });
		await push("TAB_ACTIVATED", info.tabId, info.windowId);
	})().catch((error) => logger.warn("tab activation failed", { error }));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (tab.windowId == null) return;
	// avoid spamming on every property change — only when tab actually updated
	push("TAB_UPDATED", tabId, tab.windowId);
	if (changeInfo.url) updateMeta(tabId, { url: changeInfo.url });
	if (changeInfo.title) updateMeta(tabId, { title: changeInfo.title });
	if (changeInfo.favIconUrl)
		updateMeta(tabId, { favicon: changeInfo.favIconUrl });
});

chrome.tabs.onRemoved.addListener((tabId) => {
	// TAB_REMOVED has no windowId in the Chrome API — use 0 as sentinel, sidecar owns cleanup
	push("TAB_REMOVED", tabId, 0);
	removeMeta(tabId);
});

// --- Navigation (spec: chrome.webNavigation) ---
if (chrome.webNavigation?.onCommitted) {
	chrome.webNavigation.onCommitted.addListener((details) => {
		if (details.frameId !== 0) return;
		push("NAVIGATION", details.tabId, 0);
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
	return push(type, state.tabId, state.windowId, undefined, state.timestamp);
});

// --- retired SW signals: NO producers. Historical rows still decode ---
// (SW_POPUP_OPEN, SW_TRACKING_TOGGLE, SW_DOWNLOAD, SW_LIFECYCLE were removed
// from the production telemetry path. The tracking state still lives in
// chrome.storage.local via SET_TRACKING — just no longer persisted as a
// behavioral event. See packages/shared/src/activities/sw-semantics.ts.)

const getMergedStats = (): StatsSnapshot => {
	const occupancy = Math.max(
		0,
		Atomics.load(control, 0) - Atomics.load(control, 1),
	);
	return {
		...latestStats,
		droppedEvents,
		bufferCapacity: capacity,
		bufferOccupancy: occupancy,
		peakBufferOccupancy: Math.max(latestStats.peakBufferOccupancy, occupancy),
	};
};

const respondAssistantConnection = (
	sendResponse: (response: unknown) => void,
) => {
	void (async () => {
		try {
			sendResponse(await getAssistantConnection());
		} catch {
			sendResponse(null); // Unknown is not disconnected.
		}
	})();
};

// --- Content-script page events (spec §5: never write SAB directly, background is single producer) ---
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
		const tabId = sender.tab?.id ?? 0;
		const windowId = sender.tab?.windowId ?? 0;
		const t = message.type as TabEventType;
		if (
			[
				"PAGE_VISIBLE",
				"PAGE_HIDDEN",
				"SCROLL",
				"CLICK",
				"KEY_ACTIVITY",
			].includes(t)
		) {
			push(t, tabId, windowId, message.metadata);
		}
		return false;
	}

	if (message?.type === "GET_ASSISTANT_CONNECTION") {
		respondAssistantConnection(sendResponse);
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
					sendResponse({ dexieCount: 0, rxdbCount: 0 });
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
					sendResponse([]);
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

			if (message?.type === "GET_ASSISTANT_CONNECTION") {
				respondAssistantConnection(sendResponse);
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
							sendResponse({ dexieCount: 0, rxdbCount: 0 });
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
							sendResponse([]);
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

if (process.env.NODE_ENV === "development") {
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
		const connected = await getAssistantConnection()
			.then((result) => result.connected)
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
	if (alarm.name === PREVIEW_ALARM && process.env.NODE_ENV === "development") {
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
				return chrome.tabs.create({ url: CHATGPT_URL });
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
