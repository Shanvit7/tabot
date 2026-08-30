/// <reference types="chrome" />

import {
	bulkInsertEvents,
	countEvents,
	createBuffer,
	createEmptyStats,
	createEventsDb,
	getAllEvents,
	getMeta,
	logger,
	pushEvent,
	removeMeta,
	type StatsSnapshot,
	type StoredTabEvent,
	type TabEventType,
	updateMeta,
} from "@tabot/shared";

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
];

const TRACKING_KEY = "tabot_tracking_enabled";
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
			return meta?.url ? { ...d, url: meta.url } : d;
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
	metadata?: { x?: number; y?: number; scrollY?: number },
) => {
	await trackingReady;
	if (!trackingEnabled) return false;
	const ok = pushEvent(control, events, capacity, {
		type,
		tabId,
		windowId,
		timestamp: Date.now(),
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
});

chrome.tabs.onActivated.addListener((info) => {
	push("TAB_ACTIVATED", info.tabId, info.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (tab.windowId == null) return;
	// avoid spamming on every property change — only when tab actually updated
	push("TAB_UPDATED", tabId, tab.windowId);
	if (changeInfo.url) updateMeta(tabId, { url: changeInfo.url });
	if (changeInfo.title) updateMeta(tabId, { title: changeInfo.title });
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

// --- Content-script page events (spec §5: never write SAB directly, background is single producer) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "SET_TRACKING") {
		trackingEnabled = message.enabled === true;
		chrome.storage.local
			.set({ [TRACKING_KEY]: trackingEnabled })
			.then(() => sendResponse({ enabled: trackingEnabled }))
			.catch(() => sendResponse({ enabled: trackingEnabled }));
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

// externally_connectable web dashboard (setup.md §10) — same contract, different entry point
if (chrome.runtime.onMessageExternal) {
	chrome.runtime.onMessageExternal.addListener(
		(message, _sender, sendResponse) => {
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
