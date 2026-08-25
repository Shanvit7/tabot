// packages/shared/src/contexts.ts
// Phase 3 — Sessions → Contexts (docs/tech.md)
// Pure derivation layer: Session[] in, BrowserContext[] out. No persistence, no LLM.

import type { TabotDatabase } from "./db";
import { getRecentSessions, getSessions, type Session } from "./sessions";

export interface BrowserContext {
	id: string; // `${firstSessionId}-${lastSessionId}`
	startTimestamp: number;
	endTimestamp: number;
	duration: number; // wall clock, includes gaps
	sessionIds: string[];
	sessionCount: number;
	domains: ContextDomain[];
	totalEventCount: number;
	totalInteractionCount: number;
	totalNavigationCount: number;
	totalTabSwitchCount: number;
	recurrenceCount: number; // sessions containing the top domain
	primaryDomain: string; // highest total eventCount domain (display-only label)
}

export interface ContextDomain {
	domain: string;
	eventCount: number;
	sessionCount: number; // sessions this domain appeared in
	sessionIds: string[]; // evidence
	firstSeen: number;
	lastSeen: number;
}

export const CONTEXT_THRESHOLDS = {
	CONTEXT_GAP_THRESHOLD: 30 * 60 * 1000, // 30 minutes
	CONTEXT_OVERLAP_THRESHOLD: 1, // min shared domains
} as const;

const contextId = (firstSessionId: string, lastSessionId: string): string =>
	`${firstSessionId}-${lastSessionId}`;

const sharedDomains = (a: Session, b: Session): string[] => {
	const bDomains = new Set(b.domains.map((d) => d.domain));
	return a.domains.filter((d) => bDomains.has(d.domain)).map((d) => d.domain);
};

// tech.md §5.2 — pure, deterministic, rebuildable
export const buildContexts = (sessions: Session[]): BrowserContext[] => {
	if (sessions.length === 0) return [];

	const sorted = [...sessions].sort(
		(a, b) => a.startTimestamp - b.startTimestamp,
	);

	const contexts: BrowserContext[] = [];
	let current: { sessions: Session[] } | null = null;

	for (const session of sorted) {
		const prev = current ? current.sessions[current.sessions.length - 1] : null;

		let shouldStartNew = false;
		if (!prev) {
			shouldStartNew = true;
		} else {
			const gap = session.startTimestamp - prev.endTimestamp;
			const overlap = sharedDomains(prev, session).length;
			if (gap > CONTEXT_THRESHOLDS.CONTEXT_GAP_THRESHOLD) {
				shouldStartNew = true;
			} else if (overlap < CONTEXT_THRESHOLDS.CONTEXT_OVERLAP_THRESHOLD) {
				shouldStartNew = true;
			}
		}

		if (shouldStartNew && current) {
			contexts.push(finalizeContext(current.sessions));
			current = null;
		}
		if (!current) current = { sessions: [] };
		current.sessions.push(session);
	}

	if (current) contexts.push(finalizeContext(current.sessions));
	return contexts;
};

const finalizeContext = (sessions: Session[]): BrowserContext => {
	const first = sessions[0];
	const last = sessions[sessions.length - 1];

	const domains = new Map<string, ContextDomain>();
	for (const session of sessions) {
		for (const d of session.domains) {
			let cd = domains.get(d.domain);
			if (!cd) {
				cd = {
					domain: d.domain,
					eventCount: 0,
					sessionCount: 0,
					sessionIds: [],
					firstSeen: d.firstSeen,
					lastSeen: d.lastSeen,
				};
				domains.set(d.domain, cd);
			}
			cd.eventCount += d.eventCount;
			cd.sessionCount++;
			cd.sessionIds.push(session.id);
			cd.firstSeen = Math.min(cd.firstSeen, d.firstSeen);
			cd.lastSeen = Math.max(cd.lastSeen, d.lastSeen);
		}
	}

	const domainList = Array.from(domains.values()).sort(
		(a, b) => b.eventCount - a.eventCount || a.firstSeen - b.firstSeen,
	);

	return {
		id: contextId(first.id, last.id),
		startTimestamp: first.startTimestamp,
		endTimestamp: last.endTimestamp,
		duration: last.endTimestamp - first.startTimestamp,
		sessionIds: sessions.map((s) => s.id),
		sessionCount: sessions.length,
		domains: domainList,
		totalEventCount: sessions.reduce((sum, s) => sum + s.eventCount, 0),
		totalInteractionCount: sessions.reduce(
			(sum, s) => sum + s.interactionCount,
			0,
		),
		totalNavigationCount: sessions.reduce(
			(sum, s) => sum + s.navigationCount,
			0,
		),
		totalTabSwitchCount: sessions.reduce((sum, s) => sum + s.tabSwitchCount, 0),
		recurrenceCount: domainList.length > 0 ? domainList[0].sessionCount : 0,
		primaryDomain: domainList[0]?.domain ?? "",
	};
};

// --- APIs (tech.md §7.1, Option A: lazy derivation) ---

export const getContexts = async (
	db: TabotDatabase,
	start?: number,
	end?: number,
): Promise<BrowserContext[]> => {
	const sessions = await getSessions(db, start, end);
	return buildContexts(sessions);
};

export const getContextById = async (
	db: TabotDatabase,
	id: string,
): Promise<BrowserContext | undefined> => {
	const sessions = await getSessions(db);
	return buildContexts(sessions).find((c) => c.id === id);
};

export const getRecentContexts = async (
	db: TabotDatabase,
	limit = 10,
): Promise<BrowserContext[]> => {
	const sessions = await getRecentSessions(db, 500); // bounded read
	return buildContexts(sessions).slice(-limit);
};
