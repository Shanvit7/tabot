// packages/shared/src/sessions.ts
// Phase 2 Layer 1 — Events → Sessions (docs/tech.md)
// Pure derivation layer: raw events in, Session[] out. No persistence, no LLM.

import type { StoredTabEvent, TabotDatabase } from "./db";
import type { TabEventType } from "./events";

export interface TabParticipation {
	tabId: number;
	eventCount: number;
	firstSeen: number;
	lastSeen: number;
	isActive: boolean; // received at least one TAB_ACTIVATED
}

export interface DomainParticipation {
	domain: string;
	eventCount: number;
	tabIds: number[];
	firstSeen: number;
	lastSeen: number;
}

export interface Session {
	id: string;
	startTimestamp: number;
	endTimestamp: number;
	duration: number;
	eventCount: number;
	tabs: TabParticipation[];
	domains: DomainParticipation[];
	interactionCount: number; // CLICK + KEY_ACTIVITY + SCROLL
	navigationCount: number; // NAVIGATION
	tabSwitchCount: number; // TAB_ACTIVATED
	eventSequence: StoredTabEvent[];
	activeTabId: number;
	activeWindowId: number;
}

export const SESSION_THRESHOLDS = {
	INACTIVITY_THRESHOLD: 5 * 60 * 1000, // 5 minutes
	VISIBILITY_GAP_THRESHOLD: 2 * 60 * 1000, // 2 minutes
	TAB_ABSENCE_THRESHOLD: 10 * 60 * 1000, // 10 minutes
	WINDOW_CLOSE_THRESHOLD: 30 * 1000, // 30 seconds
} as const;

const INTERACTION_TYPES: readonly TabEventType[] = [
	"CLICK",
	"KEY_ACTIVITY",
	"SCROLL",
];

const extractDomain = (url: string): string => {
	try {
		return new URL(url).hostname;
	} catch {
		return "unknown";
	}
};

const sessionId = (start: number, end: number, activeTabId: number): string =>
	`${start}-${end}-${activeTabId}`;

const openSession = (event: StoredTabEvent): Session => ({
	id: "",
	startTimestamp: event.timestamp,
	endTimestamp: event.timestamp,
	duration: 0,
	eventCount: 0,
	tabs: [],
	domains: [],
	interactionCount: 0,
	navigationCount: 0,
	tabSwitchCount: 0,
	eventSequence: [],
	activeTabId: 0,
	activeWindowId: 0,
});

// specs-sessions.md §7.2 — pure, deterministic, rebuildable
export const sessionize = (events: StoredTabEvent[]): Session[] => {
	if (events.length === 0) return [];

	const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

	const sessions: Session[] = [];
	const tabLastEvent = new Map<number, number>();
	const windowLastEvent = new Map<number, number>();
	const tabParticipation = new Map<number, TabParticipation>();
	const domainParticipation = new Map<string, DomainParticipation>();
	const windowCounts = new Map<number, number>();

	let current: Session | null = null;
	let prevEvent: StoredTabEvent | null = null;

	for (const event of sorted) {
		let shouldStartNew = current === null;

		if (!shouldStartNew && prevEvent) {
			const inactivityGap = event.timestamp - prevEvent.timestamp;
			if (inactivityGap >= SESSION_THRESHOLDS.INACTIVITY_THRESHOLD) {
				shouldStartNew = true;
			}

			// Visibility transition: PAGE_HIDDEN → PAGE_VISIBLE with gap ≥ threshold
			if (
				!shouldStartNew &&
				event.type === "PAGE_VISIBLE" &&
				prevEvent.type === "PAGE_HIDDEN"
			) {
				const visibilityGap = event.timestamp - prevEvent.timestamp;
				if (visibilityGap >= SESSION_THRESHOLDS.VISIBILITY_GAP_THRESHOLD) {
					shouldStartNew = true;
				}
			}

			// Tab absence: this tab silent for ≥ threshold AND the event is on that
			// same tab (not an activation of a different tab). Phase 3 (5.1): an
			// activation — either leaving a long-idle tab or returning to one — is
			// a tab switch (excursion), not a session boundary. Only a same-tab
			// non-activation event after 10m of silence on that tab is genuine.
			const sameTabInactive =
				event.type !== "TAB_ACTIVATED" &&
				tabLastEvent.has(event.tabId) &&
				event.timestamp - (tabLastEvent.get(event.tabId) as number) >=
					SESSION_THRESHOLDS.TAB_ABSENCE_THRESHOLD;
			if (!shouldStartNew && sameTabInactive) {
				shouldStartNew = true;
			}

			// Window switch: previous window silent for ≥ threshold
			if (
				!shouldStartNew &&
				prevEvent.windowId !== event.windowId &&
				windowLastEvent.has(prevEvent.windowId) &&
				event.timestamp - (windowLastEvent.get(prevEvent.windowId) as number) >=
					SESSION_THRESHOLDS.WINDOW_CLOSE_THRESHOLD
			) {
				shouldStartNew = true;
			}
		}

		if (shouldStartNew && current) {
			sessions.push(
				finalizeSession(
					current,
					tabParticipation,
					domainParticipation,
					windowCounts,
				),
			);
			current = null;
			tabParticipation.clear();
			domainParticipation.clear();
			windowCounts.clear();
		}

		if (!current) {
			current = openSession(event);
		}

		current.endTimestamp = event.timestamp;
		current.eventCount++;
		current.eventSequence.push(event);

		tabLastEvent.set(event.tabId, event.timestamp);
		windowLastEvent.set(event.windowId, event.timestamp);
		windowCounts.set(
			event.windowId,
			(windowCounts.get(event.windowId) ?? 0) + 1,
		);

		let tabPart = tabParticipation.get(event.tabId);
		if (!tabPart) {
			tabPart = {
				tabId: event.tabId,
				eventCount: 0,
				firstSeen: event.timestamp,
				lastSeen: event.timestamp,
				isActive: false,
			};
			tabParticipation.set(event.tabId, tabPart);
		}
		tabPart.eventCount++;
		tabPart.lastSeen = event.timestamp;
		if (event.type === "TAB_ACTIVATED") tabPart.isActive = true;

		if (event.url) {
			const domain = extractDomain(event.url);
			let domPart = domainParticipation.get(domain);
			if (!domPart) {
				domPart = {
					domain,
					eventCount: 0,
					tabIds: [event.tabId],
					firstSeen: event.timestamp,
					lastSeen: event.timestamp,
				};
				domainParticipation.set(domain, domPart);
			}
			domPart.eventCount++;
			domPart.lastSeen = event.timestamp;
			if (!domPart.tabIds.includes(event.tabId)) {
				domPart.tabIds.push(event.tabId);
			}
		}

		if (INTERACTION_TYPES.includes(event.type)) current.interactionCount++;
		if (event.type === "NAVIGATION") current.navigationCount++;
		if (event.type === "TAB_ACTIVATED") current.tabSwitchCount++;

		prevEvent = event;
	}

	if (current) {
		sessions.push(
			finalizeSession(
				current,
				tabParticipation,
				domainParticipation,
				windowCounts,
			),
		);
	}

	return sessions;
};

const finalizeSession = (
	session: Session,
	tabParticipation: Map<number, TabParticipation>,
	domainParticipation: Map<string, DomainParticipation>,
	windowCounts: Map<number, number>,
): Session => {
	session.duration = session.endTimestamp - session.startTimestamp;
	session.tabs = Array.from(tabParticipation.values());
	session.domains = Array.from(domainParticipation.values());

	const activeTab = session.tabs
		.filter((t) => t.isActive)
		.sort((a, b) => b.eventCount - a.eventCount)[0];
	session.activeTabId = activeTab?.tabId ?? session.tabs[0]?.tabId ?? 0;

	session.activeWindowId =
		Array.from(windowCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

	session.id = sessionId(
		session.startTimestamp,
		session.endTimestamp,
		session.activeTabId,
	);

	// keep the sequence bounded — summary fields survive trimming
	if (session.eventSequence.length > 1000) {
		session.eventSequence = [];
	}

	return session;
};

// --- APIs (tech.md §8.1, Option A: lazy derivation) ---

export const getSessions = async (
	db: TabotDatabase,
	start?: number,
	end?: number,
): Promise<Session[]> => {
	const events =
		start !== undefined && end !== undefined
			? await db.events
					.where("timestamp")
					.between(start, end, true, true)
					.toArray()
			: start !== undefined
				? await db.events.where("timestamp").aboveOrEqual(start).toArray()
				: end !== undefined
					? await db.events.where("timestamp").belowOrEqual(end).toArray()
					: await db.events.toArray();
	return sessionize(events);
};

export const getSessionById = async (
	db: TabotDatabase,
	id: string,
): Promise<Session | undefined> => {
	const sessions = sessionize(await db.events.toArray());
	return sessions.find((s) => s.id === id);
};

export const getRecentSessions = async (
	db: TabotDatabase,
	limit = 10,
): Promise<Session[]> => {
	const sessions = sessionize(await db.events.toArray());
	return sessions.slice(-limit);
};
