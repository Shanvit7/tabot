import type { StoredTabEvent } from "../events/db";
import { isDiagnostic } from "./sw-semantics";

export interface ActiveSpan {
	start: number;
	end: number;
}

export const ACTIVITY_GAP_MS = 5 * 60_000;

// Tab lifecycle/state changes are not evidence that someone viewed a page.
// Legacy traces without activation/visibility still use navigation/interactions.
export const foregroundEvents = (
	events: StoredTabEvent[],
): StoredTabEvent[] => {
	const out: StoredTabEvent[] = [];
	let activeTab: number | undefined;
	let activeWindow: number | undefined;
	let lastViewedTab: number | undefined;
	let focusedWindow: number | undefined;
	let visible = true;
	const urls = new Map<number, string>();
	for (const event of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
		if (isDiagnostic(event.type)) continue;
		if (event.type === "SW_WINDOW_FOCUS") {
			focusedWindow = event.windowId;
			if (focusedWindow !== activeWindow) activeTab = undefined; // New window's selected tab is not known yet.
			visible = focusedWindow !== -1;
			out.push(event);
			continue;
		}
		if (event.type === "TAB_CREATED" || event.type === "TAB_REMOVED") continue;
		if (
			event.type === "TAB_UPDATED" &&
			(activeTab !== event.tabId ||
				!event.url ||
				urls.get(event.tabId) === event.url)
		)
			continue;
		if (event.type === "PAGE_HIDDEN") {
			if (event.tabId === (activeTab ?? lastViewedTab)) {
				out.push(event);
				if (
					focusedWindow === undefined ||
					focusedWindow === -1 ||
					focusedWindow === event.windowId
				)
					visible = false;
			}
			continue;
		}
		if (focusedWindow === -1) continue;
		if (
			focusedWindow !== undefined &&
			event.windowId > 0 &&
			event.windowId !== focusedWindow
		)
			continue;
		if (event.type === "TAB_ACTIVATED" || event.type === "PAGE_VISIBLE") {
			activeTab = event.tabId;
			activeWindow = event.windowId;
			visible = true;
		} else if (activeTab !== undefined && event.tabId !== activeTab) {
			continue;
		}
		if (!visible) continue;
		if (activeTab === undefined && focusedWindow !== undefined) {
			activeTab = event.tabId;
			activeWindow = event.windowId;
		}
		out.push(event);
		lastViewedTab = event.tabId;
		if (event.url) urls.set(event.tabId, event.url);
	}
	return out;
};

// No extrapolation to now, across idle gaps, or after hide/focus loss. New
// capture supplies 30s foreground samples; old traces remain conservative.
export const activeSpans = (events: StoredTabEvent[]): ActiveSpan[] => {
	const spans: ActiveSpan[] = [];
	let previous: number | undefined;
	for (const event of foregroundEvents(events)) {
		if (
			previous !== undefined &&
			event.timestamp > previous &&
			event.timestamp - previous < ACTIVITY_GAP_MS
		) {
			const last = spans[spans.length - 1];
			if (last?.end === previous) last.end = event.timestamp;
			else spans.push({ start: previous, end: event.timestamp });
		}
		previous =
			event.type === "PAGE_HIDDEN" || event.type === "SW_WINDOW_FOCUS"
				? undefined
				: event.timestamp;
	}
	return spans;
};

export const activeDuration = (
	spans: ActiveSpan[],
	start: number,
	end: number,
): number =>
	spans.reduce(
		(sum, span) =>
			sum + Math.max(0, Math.min(end, span.end) - Math.max(start, span.start)),
		0,
	);
