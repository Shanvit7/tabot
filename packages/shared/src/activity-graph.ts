// packages/shared/src/activity-graph.ts
// V6 — Activity Graph (docs/tabot-graph-activity-plan.md)
// Session[] + DerivedEvent[] → ActivityAnchor[] → Graph → ActivityEpisode[].
//
// A browser session is NOT an activity: one session can contain several loosely
// related activities (legal work → LinkedIn → research → legal work). This layer
// introduces activity anchors as graph nodes and builds a typed, weighted,
// temporally-bounded relationship graph. Contexts are later derived from
// activity episodes — the graph is an evidence substrate, never the context
// algorithm (no connected components, no community detection in this iteration).
//
// No persistence, no LLM, no new telemetry. Graphology is the graph substrate.

import Graph from "graphology";
import {
	BOUNDARY_CONFIG,
	type BoundaryDiagnostic,
	buildProfile,
	computeBoundaryEvidence,
	MIN_EPISODE_DURATION_MS,
	MIN_EPISODE_EVENTS,
	mergeTinyEpisodes,
} from "./episode-boundary";
import { deriveMeaningfulEvents } from "./meaningful-events";
import type { Session } from "./sessions";

// --- Node: ActivityAnchor (§5) ---

export interface ActivityAnchor {
	id: string;
	startAt: number;
	endAt: number;
	sessionId: string;
	tabId: number;
	windowId: number;
	origin: string;
	pathname: string;
	pageKey: string;
	eventIds: string[];
	eventCount: number;
	interactionCount: number;
	navigationCount: number;
	previousAnchorId?: string;
	nextAnchorId?: string;
	// per-origin event counts folded into this anchor (accurate activity
	// attribution even when the anchor is a session-summary fallback)
	domainEvents?: Record<string, number>;
}

// --- Edge: RelationshipEdge (§6) ---

export type RelationshipEdgeType =
	| "temporal-adjacency"
	| "same-page"
	| "same-origin"
	| "same-tab"
	| "navigation"
	| "return"
	| "interaction-continuity";

export interface RelationshipEdge {
	type: RelationshipEdgeType;
	weight: number;
	gapMs: number;
	evidence: string[];
}

// --- Episode (§11) ---

export interface ActivityEpisode {
	id: string;
	anchorIds: string[];
	startTimestamp: number;
	endTimestamp: number;
	duration: number;
	sessionIds: string[];
	domains: string[];
	totalEventCount: number;
	totalInteractionCount: number;
	totalNavigationCount: number;
	primaryDomain: string;
	boundaryType: "start" | "end" | "internal";
	// session-level dominant origin this episode belongs to ("" when the
	// session has no dominant cluster — balanced research chains)
	homeOrigin: string;
	// per-origin event counts within this episode (accurate activity attribution)
	domainEvents: Record<string, number>;
	// boundary diagnostics — why each internal boundary split/merged (§11)
	boundaries?: BoundaryDiagnostic[];
	// true when this episode was segmented from REAL event trajectories (the
	// boundary scorer ran); false for fallback session-summary anchors that have
	// no event sequence to segment. The context layer uses chain evidence (T2)
	// ONLY for fallback episodes — a trajectory-segmented episode's splits are
	// final (§12 Test 5).
	trajectorySegmented: boolean;
}

// --- Thresholds (§7, §9) ---

export const GRAPH_THRESHOLDS = {
	// Hard temporal gate: no relationship edge across inactivity beyond this.
	// Mirrors CONTEXT_THRESHOLDS.RELATIONSHIP_EVIDENCE_CUTOFF_MS.
	RELATIONSHIP_CUTOFF_MS: 15 * 60 * 1000,
	// Temporal decay constant for edge weight.
	DECAY_CONSTANT_MS: 15 * 60 * 1000,
	// Min weight for an edge to count as "strong" for episode continuity.
	STRONG_WEIGHT: 0.5,
	// Max gap between consecutive anchors within the same episode.
	EPISODE_GAP_MS: 30 * 60 * 1000,
	// Reuse excursion window as the short-gap threshold for same-tab edges.
	SHORT_GAP_MS: 5 * 60 * 1000,
} as const;

const pageKeyOf = (origin: string, pathname: string): string =>
	`${origin}${pathname}`;

const isInteraction = (e: { type: string }): boolean =>
	e.type === "SCROLL" || e.type === "CLICK" || e.type === "KEY_ACTIVITY";

// --- Anchor construction (§4, §5) ---
// Consume the deduped meaningful stream (TAB_UPDATED noise already removed),
// derived per-session from the session's own event sequence. An anchor is a
// meaningful browser state: a page (origin+pathname) the user was on for a
// span, with interaction/navigation counts. A page change or an inactivity gap
// opens a new anchor.
export const buildActivityAnchors = (sessions: Session[]): ActivityAnchor[] => {
	const anchors: ActivityAnchor[] = [];
	let anchorSeq = 0;

	for (const session of sessions) {
		const stream = deriveMeaningfulEvents(session.eventSequence);

		// V5 — sessions with NO URL-bearing activity (only TAB_CREATED /
		// PAGE_HIDDEN / TAB_REMOVED lifecycle events, chrome://newtab, etc.)
		// are not activity: skip them. They would otherwise produce empty-origin
		// anchors that pollute episodes/contexts with noise fragments.
		const hasUrlActivity = stream.some((e) => e.ref !== undefined);
		if (!hasUrlActivity && session.eventSequence.length > 0) continue;

		// Sessions without event sequences (trimmed by sessionize at 1000 events,
		// or hand-built in check fixtures) still contribute ONE anchor so the
		// session stays the temporal unit (session = time continuity; we do NOT
		// fabricate a fake intra-session trajectory from domain summaries). The
		// full domain summary travels in domainEvents so episode/context domain
		// attribution is accurate.
		if (stream.length === 0 && session.eventSequence.length === 0) {
			const primary = session.domains
				.filter((d) => d.domain !== "")
				.sort((a, b) => b.eventCount - a.eventCount)[0];
			const activeTab =
				session.tabs
					.filter((t) => t.isActive)
					.sort((a, b) => b.eventCount - a.eventCount)[0] ?? session.tabs[0];
			const origin = primary?.domain ?? "";
			const domainEvents: Record<string, number> = {};
			for (const d of session.domains) {
				if (d.domain !== "") domainEvents[d.domain] = d.eventCount;
			}
			anchors.push({
				id: `a-${++anchorSeq}`,
				startAt: session.startTimestamp,
				endAt: session.endTimestamp,
				sessionId: session.id,
				tabId: activeTab?.tabId ?? 0,
				windowId: session.activeWindowId,
				origin,
				pathname: "",
				pageKey: pageKeyOf(origin, ""),
				eventIds: [],
				eventCount: session.eventCount,
				interactionCount: session.interactionCount,
				navigationCount: session.navigationCount,
				domainEvents,
			});
			continue;
		}

		let current: ActivityAnchor | null = null;
		let lastTs = 0;

		for (const event of stream) {
			const origin = event.ref?.origin ?? "";
			const pathname = event.ref?.pathname ?? "";
			const pageKey = pageKeyOf(origin, pathname);
			const gap = lastTs > 0 ? event.timestamp - lastTs : 0;
			// url-less events (chrome://newtab, about:blank, tab state) have NO
			// origin — they do not change activity. Fold them into the current
			// anchor; never create a standalone empty-origin anchor that would
			// bridge session boundaries (an empty-origin anchor merges unrelated
			// sessions via profile similarity — the V5 regression).
			const noIdentity = origin === "";
			const pageChanged =
				event.ref !== undefined &&
				!noIdentity &&
				(current === null || current.pageKey !== pageKey);
			const inactivityBoundary = gap > GRAPH_THRESHOLDS.EPISODE_GAP_MS;

			if (!current || (pageChanged && !noIdentity) || inactivityBoundary) {
				if (current) {
					current.endAt = lastTs;
					anchors.push(current);
				}
				current = {
					id: `a-${++anchorSeq}`,
					startAt: event.timestamp,
					endAt: event.timestamp,
					sessionId: session.id,
					tabId: event.tabId,
					windowId: event.windowId,
					origin,
					pathname,
					pageKey,
					eventIds: [event.id],
					eventCount: 1,
					interactionCount: isInteraction(event) ? 1 : 0,
					navigationCount: event.type === "NAVIGATION" ? 1 : 0,
				};
			} else {
				current.eventIds.push(event.id);
				current.eventCount++;
				if (isInteraction(event)) current.interactionCount++;
				if (event.type === "NAVIGATION") current.navigationCount++;
				current.endAt = event.timestamp;
			}
			lastTs = event.timestamp;
		}

		if (current) {
			current.endAt = lastTs;
			anchors.push(current);
		}
	}

	// chronological links
	for (let i = 0; i < anchors.length; i++) {
		if (i > 0) anchors[i - 1].nextAnchorId = anchors[i].id;
		if (i < anchors.length - 1) anchors[i + 1].previousAnchorId = anchors[i].id;
	}

	return anchors;
};

// --- Edge construction (§6, §8, §9, §10) ---

const edgeWeight = (type: RelationshipEdgeType, gapMs: number): number => {
	const decay = Math.exp(-gapMs / GRAPH_THRESHOLDS.DECAY_CONSTANT_MS);
	switch (type) {
		case "same-page":
		case "navigation":
			return 1.0 * decay;
		case "return":
			return 0.9 * decay;
		case "same-origin":
			return 0.8 * decay;
		case "interaction-continuity":
			return 0.7 * decay;
		case "same-tab":
			return 0.6 * decay;
		case "temporal-adjacency":
			return 0.4 * decay;
	}
};

// Build a sparse, directed, typed graph of activity anchors.
// §10: for each anchor, inspect only nearby anchors — same session first, then
// cross-session return edges on the same page within the cutoff. Never the
// full graph. This keeps E << N².
export const buildActivityGraph = (
	anchors: ActivityAnchor[],
): Graph<ActivityAnchor, RelationshipEdge> => {
	const graph = new Graph<ActivityAnchor, RelationshipEdge>();

	for (const a of anchors) graph.addNode(a.id, a);

	// 1) chronological within-session edges
	for (let i = 0; i < anchors.length - 1; i++) {
		const a = anchors[i];
		const b = anchors[i + 1];
		if (a.sessionId !== b.sessionId) continue;
		const gapMs = b.startAt - a.endAt;
		if (gapMs > GRAPH_THRESHOLDS.RELATIONSHIP_CUTOFF_MS) continue;

		const types: RelationshipEdgeType[] = ["temporal-adjacency"];
		if (a.pageKey === b.pageKey) types.push("same-page");
		if (a.origin !== "" && a.origin === b.origin) types.push("same-origin");
		if (a.tabId === b.tabId) types.push("same-tab");
		if (b.navigationCount > 0) types.push("navigation");
		if (a.interactionCount > 0 && b.interactionCount > 0)
			types.push("interaction-continuity");

		// merge into one edge: keep the STRONGEST evidence type as the edge type
		// (same-page > same-origin > navigation > interaction > same-tab >
		// temporal-adjacency) so episode extraction can see same-origin
		// continuation even when a navigation also occurred.
		const priority: RelationshipEdgeType[] = [
			"same-page",
			"same-origin",
			"navigation",
			"interaction-continuity",
			"same-tab",
			"temporal-adjacency",
		];
		const type =
			priority.find((t) => types.includes(t)) ?? "temporal-adjacency";
		graph.addEdge(a.id, b.id, {
			type,
			weight: edgeWeight(type, gapMs),
			gapMs,
			evidence: types,
		});
	}

	// 2) cross-session return edges: same page in a later session, within the
	//    EXCURSION window (short return = excursion; longer = recurrence, which
	//    must NOT fuse disjoint sessions).
	const byPage = new Map<string, ActivityAnchor[]>();
	for (const a of anchors) {
		if (a.pageKey === "") continue;
		const list = byPage.get(a.pageKey);
		if (list) list.push(a);
		else byPage.set(a.pageKey, [a]);
	}
	for (const [, group] of byPage) {
		group.sort((a, b) => a.startAt - b.startAt);
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i];
				const b = group[j];
				if (a.sessionId === b.sessionId) continue;
				const gapMs = b.startAt - a.endAt;
				if (gapMs > GRAPH_THRESHOLDS.SHORT_GAP_MS) continue;
				if (graph.hasEdge(a.id, b.id)) continue;
				graph.addEdge(a.id, b.id, {
					type: "return",
					weight: edgeWeight("return", gapMs),
					gapMs,
					evidence: ["return"],
				});
			}
		}
	}

	return graph;
};

// --- Episode extraction (§11, §12) ---
// NOT connectedComponents, NOT home-origin heuristics. Walk anchors
// chronologically and, for every candidate boundary between adjacent anchors,
// compute a boundary score from local trajectory evidence (temporal
// continuity, graph transition continuity, navigation/interaction continuity,
// local profile similarity). Split when the score indicates a discontinuity
// (with hysteresis to suppress flicker), then merge tiny episodes into their
// better-supported neighbor.
//
// The graph supplies the evidence; chronological order supplies the
// segmentation constraint. Home-origin is NOT used as a decision signal.
export const extractActivityEpisodes = (
	anchors: ActivityAnchor[],
	graph: Graph<ActivityAnchor, RelationshipEdge>,
): ActivityEpisode[] => {
	const sorted = [...anchors].sort((a, b) => a.startAt - b.startAt);
	const episodes: ActivityEpisode[] = [];
	let current: ActivityAnchor[] = [];
	let epSeq = 0;
	let boundaryDiagnostics: BoundaryDiagnostic[] = [];
	const anchorById = new Map(sorted.map((a) => [a.id, a]));

	// build an episode from a list of anchor ids (recomputes all aggregates;
	// used both by flush and by tiny-episode cleanup)
	const buildEpisode = (
		anchorIds: string[],
		diagnostics?: BoundaryDiagnostic[],
	): ActivityEpisode => {
		const list = anchorIds
			.map((id) => anchorById.get(id))
			.filter((a): a is ActivityAnchor => a !== undefined)
			.sort((a, b) => a.startAt - b.startAt);
		const first = list[0];
		const last = list[list.length - 1];
		const sessionIds = [...new Set(list.map((a) => a.sessionId))];
		const domains = [
			...new Set([
				...list.map((a) => a.origin).filter(Boolean),
				...list.flatMap((a) => Object.keys(a.domainEvents ?? {})),
			]),
		];
		const domainEvents: Record<string, number> = {};
		for (const a of list) {
			if (a.domainEvents) {
				for (const [origin, count] of Object.entries(a.domainEvents)) {
					domainEvents[origin] = (domainEvents[origin] ?? 0) + count;
				}
			}
			if (a.origin === "") continue;
			domainEvents[a.origin] = (domainEvents[a.origin] ?? 0) + a.eventCount;
		}
		const primaryDomain = list
			.filter((a) => a.origin !== "")
			.sort((a, b) => b.eventCount - a.eventCount)[0]?.origin;
		// trajectorySegmented: ANY real anchor (has event ids from the actual
		// event stream) means this episode came from a real trajectory
		const trajectorySegmented = list.some((a) => a.eventIds.length > 0);
		return {
			id: `ep-${++epSeq}`,
			anchorIds: list.map((a) => a.id),
			startTimestamp: first.startAt,
			endTimestamp: last.endAt,
			duration: last.endAt - first.startAt,
			sessionIds,
			domains,
			totalEventCount: list.reduce((s, a) => s + a.eventCount, 0),
			totalInteractionCount: list.reduce((s, a) => s + a.interactionCount, 0),
			totalNavigationCount: list.reduce((s, a) => s + a.navigationCount, 0),
			primaryDomain: primaryDomain ?? "",
			boundaryType: "internal",
			homeOrigin: "",
			domainEvents,
			boundaries: diagnostics,
			trajectorySegmented,
		};
	};

	const flush = (withDiagnostics: boolean) => {
		if (current.length === 0) return;
		episodes.push(
			buildEpisode(
				current.map((a) => a.id),
				withDiagnostics ? boundaryDiagnostics : undefined,
			),
		);
		current = [];
		boundaryDiagnostics = [];
	};

	for (let i = 0; i < sorted.length; i++) {
		const anchor = sorted[i];

		if (current.length === 0) {
			current.push(anchor);
			continue;
		}
		const prev = current[current.length - 1];

		// hard temporal gate: inactivity beyond EPISODE_GAP_MS is always a split
		if (anchor.startAt - prev.endAt > GRAPH_THRESHOLDS.EPISODE_GAP_MS) {
			flush(false);
			current.push(anchor);
			continue;
		}

		// candidate boundary — evaluate local trajectory coherence
		const leftWindow = sorted.slice(
			Math.max(0, i - 1 - BOUNDARY_CONFIG.profileWindow),
			i,
		);
		const rightWindow = sorted.slice(
			i,
			Math.min(sorted.length, i + 1 + BOUNDARY_CONFIG.profileWindow),
		);
		const evidence = computeBoundaryEvidence(
			prev,
			anchor,
			leftWindow,
			rightWindow,
			graph,
		);

		const boundaryScore = evidence.boundaryScore;
		const shouldSplit = boundaryScore >= BOUNDARY_CONFIG.splitThreshold;

		// hysteresis: suppress single-point flicker. A split is confirmed when
		// EITHER the next candidate boundary also stays high, OR this boundary is
		// a genuine focused-cluster departure (left profile is focused on an
		// origin the right side does not continue) — a real transition even if
		// the activity that follows is itself internally coherent.
		const next = sorted[i + 1];
		let split = shouldSplit;
		if (split && next) {
			const nextWindow = sorted.slice(
				i + 1,
				Math.min(sorted.length, i + 2 + BOUNDARY_CONFIG.profileWindow),
			);
			const nextEvidence = computeBoundaryEvidence(
				anchor,
				next,
				sorted.slice(Math.max(0, i - BOUNDARY_CONFIG.profileWindow), i + 1),
				nextWindow,
				graph,
			);
			const leftWindowForFocus = buildProfile(
				sorted.slice(Math.max(0, i - 1 - BOUNDARY_CONFIG.profileWindow), i),
				graph,
			);
			const rightWindowForFocus = buildProfile(
				sorted.slice(
					i,
					Math.min(sorted.length, i + 1 + BOUNDARY_CONFIG.profileWindow),
				),
				graph,
			);
			const leftFocus =
				evidence.profileSimilarity < 0.35 &&
				(leftWindowForFocus.focusedOrigin !== "" ||
					rightWindowForFocus.focusedOrigin !== "");
			if (
				nextEvidence.boundaryScore < BOUNDARY_CONFIG.splitThreshold &&
				!leftFocus
			) {
				split = false; // single-point flicker — stay merged
			}
		}

		boundaryDiagnostics.push({
			leftAnchorId: prev.id,
			rightAnchorId: anchor.id,
			gapMs: anchor.startAt - prev.endAt,
			boundaryScore,
			decision: split ? "split" : "merge",
			reasons: evidence.reasons,
			profileSimilarity: evidence.profileSimilarity,
			graphContinuity: evidence.graphContinuity,
		});

		if (split) {
			flush(true);
		}
		current.push(anchor);
	}
	flush(true);

	// post-segmentation cleanup (§9, §12 Test 6): a tiny episode (below
	// MIN_EPISODE_*) merges ONLY when both neighbors genuinely support the same
	// activity (shared domain/origin — not a 0.5 default that would fuse
	// unrelated singleton fragments into a chain). Exception: an EMPTY-domain
	// tiny episode (lifecycle noise — TAB_CREATED/PAGE_HIDDEN bursts, no URL
	// identity) carries no activity, so it merges into whichever neighbor
	// shares its session (pure noise removal, §16: no identity → no artifact).
	const cleaned = mergeTinyEpisodes(
		episodes,
		(e) =>
			e.totalEventCount < MIN_EPISODE_EVENTS ||
			e.duration < MIN_EPISODE_DURATION_MS,
		(left, right) => {
			// an empty-domain tiny episode merges only into a TEMPORALLY-ADJACENT
			// neighbor (within EPISODE_GAP_MS) — never across a day boundary
			if (right.domains.length === 0) {
				const gap = right.startTimestamp - left.endTimestamp;
				return gap <= GRAPH_THRESHOLDS.EPISODE_GAP_MS ? 1 : 0;
			}
			const shared = right.domains.filter((d) =>
				left.domains.includes(d),
			).length;
			return shared; // 0 = no support, do not merge
		},
		(anchorIds) => buildEpisode(anchorIds),
	);

	for (let i = 0; i < cleaned.length; i++) {
		const ep = cleaned[i];
		ep.boundaryType =
			i === 0 ? "start" : i === cleaned.length - 1 ? "end" : "internal";
	}
	return cleaned;
};
