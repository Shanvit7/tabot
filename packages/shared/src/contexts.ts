// packages/shared/src/contexts.ts
// Phase 3 — Sessions → Contexts (docs/tech.md)
// Pure derivation layer: Session[] in, BrowserContext[] out. No persistence, no LLM.
// Phase 3 (steps 6-8): relationship-aware merging using ActivityTransition evidence.

import {
	type ActivityEpisode,
	buildActivityAnchors,
	buildActivityGraph,
	extractActivityEpisodes,
} from "./activity-graph";
import type { TabotDatabase } from "./db";
import { getAllEvents } from "./db";
import type { ActivityRef, ActivityTransition } from "./meaningful-events";
import { deriveMeaningfulEvents, deriveTransitions } from "./meaningful-events";
import {
	getRecentSessions,
	getSessions,
	type Session,
	sessionize,
} from "./sessions";

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
	mergeEvidence?: string[]; // which relationship rule(s) merged each session pair (empty on first)
	sequence?: string[]; // ordered distinct activity identities, first-occurrence (step 8)
	transitions?: ContextTransition[]; // ordered {from,to,gapMs} links (step 8)
	excursions?: Excursion[]; // temporary external activity, main context not split (step 7)
	episodes?: ActivityEpisode[]; // V6 — activity episodes this context groups (graph layer)
}

export interface Excursion {
	type: "excursion";
	start: number; // first departure timestamp
	end: number; // return timestamp
	fromActivity: ActivityRef;
	returnActivity: ActivityRef;
	activities: ActivityRef[]; // the excursion chain (e.g. [google, github])
	evidence: string[]; // e.g. ["return-transition", "same-tab"]
}

// Step 8 — compact ordered link inside a context
interface ContextTransition {
	from: string; // activity identity (origin+pathname)
	to: string;
	gapMs: number;
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
	EXCURSION_RETURN_WINDOW_MS: 5 * 60 * 1000, // max excursion span (window-in, back-out)
	EXCURSION_ACTIVITY_MIN: 2, // min distinct domains in an excursion (exclude trivial hops)
	CONSECUTIVE_TRANSITION_COUNT: 2, // consecutive cross-domain hops that stay within the window
	RELATIONSHIP_EVIDENCE_CUTOFF_MS: 15 * 60 * 1000, // max gap for an edge to count as continuity evidence
	// V3 fix — one invariant against transitive chains: a context may not span
	// longer than this wall-clock bound even when every adjacent pair has direct
	// evidence. Keeps "A→B→C→D→E" from fusing into one giant context.
	// ponytail: single hard cap on wall-clock span; revisit only if a real
	// evaluation shows a legitimately coherent task spanning longer.
	MAX_CONTEXT_SPAN_MS: 90 * 60 * 1000,
} as const;

const contextId = (firstSessionId: string, lastSessionId: string): string =>
	`${firstSessionId}-${lastSessionId}`;

// step 8 — ordered distinct activity identities (origin+pathname) in first-occurrence order
const sequenceKey = (r: ActivityRef): string => `${r.origin}${r.pathname}`;

// tech.md §5.2 — pure, deterministic, rebuildable
// V6 — activity-episode segmentation: contexts are built from activity
// episodes (the graph layer), not directly from raw session connectivity.
//   sessions → anchors → graph → episodes → contexts
// A session can contain multiple episodes (legal work → LinkedIn → research →
// legal work); episodes group into a context when their graph relationship is
// strong enough (same-origin continuation, coherent cross-domain chain, or
// same-tab with a short boundary gap) and the context stays within
// MAX_CONTEXT_SPAN_MS. Same-tab alone never creates a context.
export const buildContexts = (
	sessions: Session[],
	transitions?: ActivityTransition[],
): BrowserContext[] => {
	if (sessions.length === 0) return [];

	// V6 graph layer: anchors → graph → episodes
	const anchors = buildActivityAnchors(sessions);
	const graph = buildActivityGraph(anchors);
	const episodes = extractActivityEpisodes(anchors, graph);

	// Group episodes into contexts: boundary detection over the chronological
	// episode stream, using episode-level evidence + hard span cap.
	const contexts: BrowserContext[] = [];
	let current: { episodes: ActivityEpisode[]; evidence: string[] } | null =
		null;

	const flush = () => {
		if (!current || current.episodes.length === 0) return;
		contexts.push(
			finalizeContextFromEpisodes(
				current.episodes,
				current.evidence,
				sessions,
				transitions,
			),
		);
		current = null;
	};

	for (const episode of episodes) {
		if (!current) {
			current = { episodes: [], evidence: [] };
			current.episodes.push(episode);
			continue;
		}
		const prev = current.episodes[current.episodes.length - 1];
		const gap = episode.startTimestamp - prev.endTimestamp;

		let merge = false;
		let evidence: string[] = [];
		if (gap <= CONTEXT_THRESHOLDS.CONTEXT_GAP_THRESHOLD) {
			const spanExceeded =
				episode.endTimestamp - current.episodes[0].startTimestamp >
				CONTEXT_THRESHOLDS.MAX_CONTEXT_SPAN_MS;
			if (!spanExceeded) {
				// V7 — episodes already encode the trajectory-coherence decision.
				// A context groups adjacent episodes only when STRONG evidence
				// supports continuity (T1 same-origin continuation, T2 coherent
				// cross-domain chain). Same-tab (T3) is NOT a merge trigger at the
				// context layer: a tab is a surface, not a task (§12 Test 3).
				evidence = episodeMergeEvidence(prev, episode, transitions);
				if (evidence.length > 0) merge = true;
			}
		}

		if (!merge) flush();
		if (!current) current = { episodes: [], evidence: [] };
		current.episodes.push(episode);
		current.evidence.push(...evidence);
	}
	flush();

	return contexts;
};

// Episode-level merge evidence: same-origin continuation across the episode
// boundary or a coherent cross-domain chain in the boundary neighborhood.
// Mirrors the V4.1 tiered evidence but at episode granularity. Same-tab
// transitions do NOT merge episodes (a tab is a surface, not a task — §12
// Test 3); the episodes already encode the trajectory decision.
const episodeMergeEvidence = (
	a: ActivityEpisode,
	b: ActivityEpisode,
	transitions?: ActivityTransition[],
): string[] => {
	const evidence: string[] = [];
	if (!transitions) return evidence;

	const aEnd = a.endTimestamp;
	const bStart = b.startTimestamp;
	const cutoff = CONTEXT_THRESHOLDS.RELATIONSHIP_EVIDENCE_CUTOFF_MS;

	// find transitions in the LOCAL NEIGHBORHOOD of the episode boundary:
	// straddling it (from in a's tail, to in b's head) OR entirely inside b's
	// head window (continuing the trajectory that crossed the boundary). This
	// mirrors the trajectory-coherence view (§5: A-2 A-1 A | B B+1 B+2) — a
	// chain that starts before the boundary and continues inside b is one
	// trajectory even if only ONE edge literally straddles.
	const straddles = (o: ActivityTransition["occurrences"][number]): boolean =>
		o.fromTs >= aEnd - cutoff &&
		o.fromTs <= aEnd &&
		o.toTs >= bStart &&
		o.toTs <= bStart + cutoff &&
		o.gapMs <= cutoff;
	const insideB = (o: ActivityTransition["occurrences"][number]): boolean =>
		o.fromTs >= bStart - cutoff &&
		o.toTs <= bStart + cutoff &&
		o.gapMs <= cutoff;
	const edges = transitions.filter((t) =>
		t.occurrences.some((o) => straddles(o) || insideB(o)),
	);
	if (edges.length === 0) return evidence;

	// T1 — same-origin navigation ACROSS the boundary. Valid ONLY for FALLBACK
	// episodes (no event sequence — the transition is the only evidence). For
	// trajectory-segmented episodes, same-origin is NOT a merge trigger: the
	// episode boundary already encoded the trajectory decision, and a
	// same-origin hop (e.g. linkedin.com → linkedin.com/feed) can bridge two
	// DIFFERENT activities (§6: same surface ≠ same task).
	if (!a.trajectorySegmented && !b.trajectorySegmented) {
		const sameOrigin = edges.find(
			(t) =>
				t.from.origin !== "" &&
				t.from.origin === t.to.origin &&
				t.occurrences.some(straddles),
		);
		if (sameOrigin) return ["same-origin-navigation"];
	}

	// T2 — coherent cross-domain chain in the boundary neighborhood. Valid ONLY
	// for FALLBACK episodes (no event sequence — the trajectory scorer could
	// not run, so the transition chain is the only evidence). For
	// trajectory-segmented episodes the split is final: re-merging with chain
	// evidence would undo the segmentation (§12 Test 5).
	if (!a.trajectorySegmented && !b.trajectorySegmented) {
		const chain = R2_chain(edges);
		if (chain.ok) return [chain.detail];
	}

	return evidence;
};

// --- boundary detection (V4.1) ---
// Context segmentation is a boundary decision, not graph merging. For each
// adjacent pair the evidence is tiered; same-tab is supporting evidence ONLY
// (a tab is an execution surface, not a task identity):
//   T1 same-origin navigation across the boundary — strong (same-site work)
//   T2 coherent cross-domain chain                — strong (research hop)
//   T3 same-tab + short boundary gap             — supporting (surface+recency)
// Time actively splits: gap > CONTEXT_GAP_THRESHOLD splits in buildContexts.

const R2_chain = (
	edges: ActivityTransition[],
): { ok: boolean; detail: string } => {
	// consecutive cross-domain edges spanning A→B with each gap within the cutoff,
	// the whole span within the excursion window.
	const chain: ActivityTransition[] = [];
	let firstTs: number | null = null;
	let lastTs: number | null = null;
	for (const edge of edges) {
		if (chain.length > 0) {
			const gap = edge.firstAt - chain[chain.length - 1].lastAt;
			if (gap > CONTEXT_THRESHOLDS.RELATIONSHIP_EVIDENCE_CUTOFF_MS) break;
		}
		chain.push(edge);
		if (firstTs === null) firstTs = edge.firstAt;
		lastTs = edge.lastAt;
	}
	if (chain.length < CONTEXT_THRESHOLDS.CONSECUTIVE_TRANSITION_COUNT) {
		return { ok: false, detail: "" };
	}
	const span = (lastTs ?? firstTs ?? 0) - (firstTs ?? 0);
	if (span > CONTEXT_THRESHOLDS.EXCURSION_RETURN_WINDOW_MS) {
		return { ok: false, detail: "" };
	}
	return { ok: true, detail: `chain:${chain.length}-transitions` };
};

// V6 — finalize a context from its episodes. Sessions are the union of the
// episodes' sessions (an episode can span one or more sessions).
const finalizeContextFromEpisodes = (
	episodes: ActivityEpisode[],
	evidence: string[],
	allSessions: Session[],
	transitions?: ActivityTransition[],
): BrowserContext => {
	const first = episodes[0];
	const last = episodes[episodes.length - 1];

	const sessionById = new Map(allSessions.map((s) => [s.id, s]));
	const sessions = episodes
		.flatMap((e) => e.sessionIds)
		.filter((id, idx, arr) => arr.indexOf(id) === idx)
		.map((id) => sessionById.get(id))
		.filter((s): s is Session => s !== undefined)
		.sort((a, b) => a.startTimestamp - b.startTimestamp);

	const domains = new Map<string, ContextDomain>();
	// V6 — aggregate domains from the EPISODES' ANCHORS (context-owned activity),
	// not the sessions: a long session can contain several episodes, and the
	// session-level domain list mixes all of them together. Episodes carry the
	// true per-origin event counts.
	const originEvents = new Map<string, number>();
	const originFirst = new Map<string, number>();
	const originLast = new Map<string, number>();
	for (const ep of episodes) {
		for (const [origin, count] of Object.entries(ep.domainEvents)) {
			originEvents.set(origin, (originEvents.get(origin) ?? 0) + count);
			originFirst.set(
				origin,
				Math.min(
					originFirst.get(origin) ?? ep.startTimestamp,
					ep.startTimestamp,
				),
			);
			originLast.set(
				origin,
				Math.max(originLast.get(origin) ?? ep.endTimestamp, ep.endTimestamp),
			);
		}
	}
	for (const [origin, eventCount] of originEvents) {
		const inSessions = sessions.filter((s) =>
			s.domains.some((d) => d.domain === origin),
		);
		const cd: ContextDomain = {
			domain: origin,
			eventCount,
			sessionCount: inSessions.length,
			sessionIds: inSessions.map((s) => s.id),
			firstSeen: originFirst.get(origin) ?? first.startTimestamp,
			lastSeen: originLast.get(origin) ?? last.endTimestamp,
		};
		domains.set(origin, cd);
	}

	const domainList = Array.from(domains.values()).sort(
		(a, b) => b.eventCount - a.eventCount || a.firstSeen - b.firstSeen,
	);

	const context: BrowserContext = {
		id: contextId(first.id, last.id),
		startTimestamp: first.startTimestamp,
		endTimestamp: last.endTimestamp,
		duration: last.endTimestamp - first.startTimestamp,
		sessionIds: sessions.map((s) => s.id),
		sessionCount: sessions.length,
		domains: domainList,
		// §2.1 — event accounting must not double-count: a session can be split
		// across multiple contexts (one session → several episodes), so the
		// context's event count is the sum of its EPISODES' counts (each anchor
		// belongs to exactly one episode → episodes partition the session's
		// events). Summing session.eventCount would over-account.
		totalEventCount: episodes.reduce((sum, ep) => sum + ep.totalEventCount, 0),
		totalInteractionCount: episodes.reduce(
			(sum, ep) => sum + ep.totalInteractionCount,
			0,
		),
		totalNavigationCount: episodes.reduce(
			(sum, ep) => sum + ep.totalNavigationCount,
			0,
		),
		totalTabSwitchCount: sessions.reduce((sum, s) => sum + s.tabSwitchCount, 0),
		recurrenceCount: domainList.length > 0 ? domainList[0].sessionCount : 0,
		primaryDomain: domainList[0]?.domain ?? "",
		mergeEvidence: evidence,
		episodes,
	};

	// sequence / transitions / excursions — context-local, from the transition
	// stream. A transition belongs to this context when both endpoints fall
	// inside one of the context's episode spans (the episodes may span multiple
	// sessions; single-session contexts can still expose a sequence).
	if (transitions) {
		const inEpisode = (ts: number): boolean =>
			episodes.some((e) => ts >= e.startTimestamp && ts <= e.endTimestamp);
		const inCtx = transitions
			.filter((t) =>
				t.occurrences.some((o) => inEpisode(o.fromTs) && inEpisode(o.toTs)),
			)
			.sort((a, b) => a.firstAt - b.firstAt);
		if (inCtx.length > 0) {
			const seq: string[] = [];
			const links: ContextTransition[] = [];
			for (const t of inCtx) {
				const fromKey = sequenceKey(t.from);
				const toKey = sequenceKey(t.to);
				if (!seq.includes(fromKey)) seq.push(fromKey);
				if (!seq.includes(toKey)) seq.push(toKey);
				links.push({
					from: fromKey,
					to: toKey,
					gapMs: t.gapsMs[0] ?? 0,
				});
			}
			context.sequence = seq;
			context.transitions = links;
			// excursions (step 7) — main → [external chain] → main within the window.
			const excursions: Excursion[] = [];
			for (let i = 0; i < inCtx.length; i++) {
				const out = inCtx[i];
				for (let j = i + 1; j < inCtx.length; j++) {
					const back = inCtx[j];
					if (sequenceKey(back.to) !== sequenceKey(out.from)) continue;
					const span = back.firstAt - out.firstAt;
					if (span > CONTEXT_THRESHOLDS.EXCURSION_RETURN_WINDOW_MS) continue;
					const chain = inCtx.slice(i, j); // departure … the edge into the return
					const activities = chain
						.map((t) => t.to)
						.filter(
							(ref, idx, arr) =>
								arr.findIndex((r) => r.exactUrl === ref.exactUrl) === idx,
						);
					if (activities.length < CONTEXT_THRESHOLDS.EXCURSION_ACTIVITY_MIN)
						continue;
					// V4.1 §12 hard invariant: excursion.end - excursion.start must be
					// <= EXCURSION_RETURN_WINDOW_MS. back.firstAt is the return edge's
					// to-event timestamp.
					excursions.push({
						type: "excursion",
						start: out.firstAt,
						end: back.firstAt,
						fromActivity: out.from,
						returnActivity: back.to,
						activities,
						evidence: ["return-transition", "same-tab"],
					});
					break;
				}
			}
			if (excursions.length > 0) context.excursions = excursions;
		}
	}

	return context;
};

// --- APIs (tech.md §7.1, Option A: lazy derivation) ---

export const getContexts = async (
	db: TabotDatabase,
	start?: number,
	end?: number,
): Promise<BrowserContext[]> => {
	const sessions = await getSessions(db, start, end);
	const events = await getAllEvents(db);
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	return buildContexts(sessions, transitions);
};

export const getContextById = async (
	db: TabotDatabase,
	id: string,
): Promise<BrowserContext | undefined> => {
	const events = await getAllEvents(db);
	const sessions = sessionize(events);
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	return buildContexts(sessions, transitions).find((c) => c.id === id);
};

export const getRecentContexts = async (
	db: TabotDatabase,
	limit = 10,
): Promise<BrowserContext[]> => {
	const sessions = await getRecentSessions(db, 500); // bounded read
	const transitions = deriveTransitions(
		deriveMeaningfulEvents(sessions.flatMap((s) => s.eventSequence)),
	);
	return buildContexts(sessions, transitions).slice(-limit);
};
