// packages/shared/src/events.ts

export const EVENT_TYPES = {
	TAB_CREATED: 0,
	TAB_ACTIVATED: 1,
	TAB_UPDATED: 2,
	TAB_REMOVED: 3,
	NAVIGATION: 4,
	PAGE_VISIBLE: 5,
	PAGE_HIDDEN: 6,
	SCROLL: 7,
	CLICK: 8,
	KEY_ACTIVITY: 9,
	// --- SW telemetry (Phase 2) — strict extension, indices 10–14 ---
	SW_WINDOW_FOCUS: 10,
	SW_POPUP_OPEN: 11,
	SW_TRACKING_TOGGLE: 12,
	SW_DOWNLOAD: 13,
	SW_LIFECYCLE: 14,
} as const;

export type TabEventType = keyof typeof EVENT_TYPES;

// SW_LIFECYCLE `kind` codes → persisted lifecycle label (slot2 of SAB / windowId)
export const LIFECYCLE_KINDS = [
	"installed",
	"startup",
	"suspend",
	"suspendCanceled",
] as const;
export type LifecycleKind = (typeof LIFECYCLE_KINDS)[number];

// SW_POPUP_OPEN `source` codes (slot2 of SAB / windowId)
export const POPUP_SOURCE = { POPUP: 0, DASHBOARD: 1 } as const;

export interface TabEventMetadata {
	x?: number;
	y?: number;
	scrollY?: number;
	// SW_WINDOW_FOCUS → slot3
	previousWindowId?: number;
	// SW_TRACKING_TOGGLE → slot3
	enabled?: boolean;
	// SW_DOWNLOAD → slot6 (raw chrome.downloads.onChanged delta.state)
	state?: number;
	// SW_POPUP_OPEN → decoded from windowId code (0 popup / 1 dashboard)
	source?: "popup" | "dashboard";
	// SW_LIFECYCLE → decoded from windowId kind code
	lifecycle?: LifecycleKind;
}

export interface TabEvent {
	type: TabEventType;
	tabId: number;
	windowId: number;
	timestamp: number;
	metadata?: TabEventMetadata;
}

export const ValueToEventType: Record<number, TabEventType> =
	Object.fromEntries(
		Object.entries(EVENT_TYPES).map(([key, value]) => [value, key]),
	) as Record<number, TabEventType>;
