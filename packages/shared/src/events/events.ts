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
} as const;

export type TabEventType = keyof typeof EVENT_TYPES;

export const ValueToEventType: Record<number, TabEventType> =
	Object.fromEntries(
		Object.entries(EVENT_TYPES).map(([key, value]) => [value, key]),
	) as Record<number, TabEventType>;

export interface TabEvent {
	type: TabEventType;
	tabId: number;
	windowId: number;
	timestamp: number;
	metadata?: {
		x?: number;
		y?: number;
		scrollY?: number;
	};
}
