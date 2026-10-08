import type { TabEventType } from "@tabot/shared";

const STATE_KEY = "tabot_foreground";
const ALARM = "tabot-foreground-sample";
const IDLE_SECONDS = 60;
const MAX_SAMPLE_GAP_MS = 90_000;

interface ForegroundState {
	tabId: number;
	windowId: number;
	url?: string;
	favicon?: string;
	timestamp: number;
}

type Emit = (type: TabEventType, state: ForegroundState) => Promise<unknown>;

export const isForegroundTab = async (tabId: number): Promise<boolean> => {
	try {
		const tab = await chrome.tabs.get(tabId);
		if (!tab.active || tab.incognito) return false;
		const window = await chrome.windows.get(tab.windowId);
		return (
			window.focused === true &&
			window.state !== "minimized" &&
			(await chrome.idle.queryState(IDLE_SECONDS)) === "active"
		);
	} catch {
		return false; // Closed tab/window, or unavailable browser state.
	}
};

// Persist only the last observed foreground sample, never an open-ended timer.
// The queue orders overlapping Chrome events; semantic state survives SW restarts.
export const startForegroundTracking = (emit: Emit) => {
	let queue = Promise.resolve();
	const sample = (enabled = true) => {
		const timestamp = Date.now();
		queue = queue
			.then(async () => {
				const stored = await chrome.storage.session.get(STATE_KEY);
				const previous = stored[STATE_KEY] as ForegroundState | undefined;
				const windows = enabled
					? await chrome.windows.getAll({ populate: true })
					: [];
				const window = windows.find(
					(window) => window.focused && window.state !== "minimized",
				);
				const tab = window?.tabs?.find((tab) => tab.active);
				const active =
					enabled &&
					tab?.id !== undefined &&
					!tab.incognito &&
					(await chrome.idle.queryState(IDLE_SECONDS)) === "active";
				const next: ForegroundState | undefined =
					active && tab
						? {
								tabId: tab.id as number,
								windowId: tab.windowId,
								url: tab.url,
								favicon: tab.favIconUrl,
								timestamp,
							}
						: undefined;
				const stale =
					previous !== undefined &&
					timestamp - previous.timestamp > MAX_SAMPLE_GAP_MS;
				if (
					previous &&
					(stale ||
						!next ||
						previous.tabId !== next.tabId ||
						previous.windowId !== next.windowId)
				) {
					// A delayed alarm after sleep/restart proves no intervening activity.
					await emit("PAGE_HIDDEN", {
						...previous,
						timestamp: stale ? previous.timestamp : timestamp,
					});
				}
				if (next) await emit("PAGE_VISIBLE", next);
				if (next) await chrome.storage.session.set({ [STATE_KEY]: next });
				else await chrome.storage.session.remove(STATE_KEY);
			})
			.catch((error) =>
				console.warn("[Tabot] foreground sample failed", error),
			);
		return queue;
	};

	chrome.tabs.onActivated.addListener(() => {
		void sample();
	});
	chrome.windows.onFocusChanged.addListener(() => {
		void sample();
	});
	chrome.idle.onStateChanged.addListener(() => {
		void sample();
	});
	chrome.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === ALARM) void sample();
	});
	chrome.idle.setDetectionInterval(IDLE_SECONDS);
	void chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
	void sample();
	return sample;
};
