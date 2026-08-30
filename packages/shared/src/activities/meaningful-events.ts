// packages/shared/src/meaningful-events.ts
// Phase 3 — Steps 2-4: meaningful event stream, page/domain identity, transition analysis.
// Pure derivation: StoredTabEvent[] in → DerivedEvent[] → ActivityTransition[] out.
// Raw events untouched; no new telemetry; no graph library; no new dependencies.

import type { StoredTabEvent } from "../events/db";
import type { TabEventType } from "../events/events";

export interface ActivityRef {
	origin: string; // scheme + host ("" when URL unparseable)
	pathname: string; // page identity ("" when URL unparseable)
	exactUrl: string; // authoritative raw URL
}

export interface DerivedEvent {
	id: string; // first raw event id folded into this derived event (provenance)
	type: TabEventType;
	tabId: number;
	windowId: number;
	timestamp: number; // first raw timestamp of the folded group
	url?: string;
	ref?: ActivityRef; // present when the event carries a URL
	sources: string[]; // raw event ids folded in (provenance, keeps collapsed events traceable)
}

export interface TransitionOccurrence {
	fromTs: number; // timestamp of the from-event (one occurrence)
	toTs: number; // timestamp of the to-event
	gapMs: number; // toTs - fromTs (temporal proximity evidence for THIS occurrence)
}

export interface ActivityTransition {
	from: ActivityRef;
	to: ActivityRef;
	fromTabId: number;
	toTabId: number;
	count: number; // how many times this (from,to) pair occurred
	firstAt: number;
	lastAt: number;
	gapsMs: number[]; // temporal proximity evidence, one entry per occurrence
	occurrences: TransitionOccurrence[]; // per-occurrence timing (V3 fix: retain fromTs)
	tabSwitch: boolean; // fromTabId !== toTabId
	returns: boolean; // reverse pair also present (A→B→A)
}

// Step 3 — identity for a meaningful navigation/state transition.
// Distinguishes github.com/project-a from github.com/project-b (pathname) and
// keeps the exact raw URL authoritative. Stdlib URL, no library.
export const activityRef = (url?: string): ActivityRef | undefined => {
	if (!url) return undefined;
	try {
		const u = new URL(url);
		// chrome://newtab, file://, about:blank, data: all report origin "null"
		// — that is not a real origin, treat it as empty (no identity).
		const origin = u.origin === "null" ? "" : u.origin;
		return { origin, pathname: u.pathname, exactUrl: url };
	} catch {
		return { origin: "", pathname: "", exactUrl: url };
	}
};

const identityOf = (e: StoredTabEvent): string => e.url ?? "";

// Step 2 — reduce browser-state noise while preserving behavioral signal.
// TAB_UPDATED is meaningful only when the tab's url identity changes; the
// last emitted identity for a tab comes from ANY url-bearing event, so the
// onUpdated echo of a webNavigation (same url, same tab) collapses here too.
// NAVIGATION always emits (a reload at the same url is still an action).
export const deriveMeaningfulEvents = (
	events: StoredTabEvent[],
): DerivedEvent[] => {
	if (events.length === 0) return [];

	const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
	const out: DerivedEvent[] = [];
	const lastIdentity = new Map<number, string>();

	for (const e of sorted) {
		const toDerived = (): DerivedEvent => ({
			id: e.id,
			type: e.type,
			tabId: e.tabId,
			windowId: e.windowId,
			timestamp: e.timestamp,
			url: e.url,
			ref: activityRef(e.url),
			sources: [e.id],
		});

		if (e.type === "TAB_UPDATED") {
			const identity = identityOf(e);
			if (lastIdentity.get(e.tabId) === identity) continue; // redundant state observation
			lastIdentity.set(e.tabId, identity);
			out.push(toDerived());
		} else {
			if (e.url) lastIdentity.set(e.tabId, e.url);
			out.push(toDerived());
		}
	}

	return out;
};

// Step 4 — lightweight transition analysis over the derived stream.
// Consecutive ref-bearing events form pairs; same-identity pairs are not
// transitions (kills scroll/visibility self-pairs). Aggregated by (from,to).
const PAIR_SEP = "\u0000";

export const deriveTransitions = (
	events: DerivedEvent[],
): ActivityTransition[] => {
	const withRef = events.filter(
		(e): e is DerivedEvent & { ref: ActivityRef } => e.ref !== undefined,
	);
	const pairs = new Map<string, ActivityTransition>();

	for (let i = 1; i < withRef.length; i++) {
		const from = withRef[i - 1];
		const to = withRef[i];
		if (from.ref.exactUrl === to.ref.exactUrl) continue;
		const key = `${from.ref.exactUrl}${PAIR_SEP}${to.ref.exactUrl}`;
		let t = pairs.get(key);
		if (!t) {
			t = {
				from: from.ref,
				to: to.ref,
				fromTabId: from.tabId,
				toTabId: to.tabId,
				count: 0,
				firstAt: to.timestamp,
				lastAt: to.timestamp,
				gapsMs: [],
				occurrences: [],
				tabSwitch: from.tabId !== to.tabId,
				returns: false,
			};
			pairs.set(key, t);
		}
		t.count++;
		t.lastAt = to.timestamp;
		t.gapsMs.push(to.timestamp - from.timestamp);
		t.occurrences.push({
			fromTs: from.timestamp,
			toTs: to.timestamp,
			gapMs: to.timestamp - from.timestamp,
		});
	}

	const transitions = Array.from(pairs.values());
	// ponytail: pair-level heuristic — a transition is a "return" when its
	// reverse pair also exists. Exact per-occurrence ordering would need
	// event-level tracking; add if evaluation shows the heuristic misses.
	const reverseKeys = new Set(
		transitions.map((t) => `${t.to.exactUrl}${PAIR_SEP}${t.from.exactUrl}`),
	);
	for (const t of transitions) {
		t.returns = reverseKeys.has(
			`${t.from.exactUrl}${PAIR_SEP}${t.to.exactUrl}`,
		);
	}

	return transitions.sort((a, b) => a.firstAt - b.firstAt);
};
