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

		// Sessions without event sequences (trimmed by sessionize at 1000 events,
		// or hand-built in check fixtures) still contribute one anchor so the
		// graph layer degrades gracefully: one anchor per session, carrying the
		// session's full domain summary in domainEvents.
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
			const pageChanged =
				event.ref !== undefined &&
				(current === null || current.pageKey !== pageKey);
			const inactivityBoundary = gap > GRAPH_THRESHOLDS.EPISODE_GAP_MS;

			if (!current || pageChanged || inactivityBoundary) {
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
// NOT connectedComponents. Walk anchors chronologically; a boundary appears
// when the graph relationship between consecutive anchors is weak OR there is
// a strong temporal gap OR the local activity pattern changes materially.
//
// Home-origin tracking: a session often has a DOMINANT origin (the task
// cluster, e.g. localhost legal work). Leaving that home is an episode
// boundary (departure); returning to it after being away is also a boundary
// (the away-run is a separate episode). Monotonic cross-domain runs with no
// dominant origin (DeepSeek → Google → Amboras → LinkedIn) stay coherent —
// there is no home to leave, so the research chain is one episode.
//
// The graph supplies the evidence (same-page/same-origin edges keep an episode
// together); chronological order supplies the segmentation constraint.
const sessionDominantOrigin = (anchors: ActivityAnchor[]): string => {
	const byOrigin = new Map<string, ActivityAnchor[]>();
	for (const a of anchors) {
		if (a.origin === "") continue;
		const list = byOrigin.get(a.origin);
		if (list) list.push(a);
		else byOrigin.set(a.origin, [a]);
	}
	const entries = [...byOrigin.entries()];
	if (entries.length === 0) return "";
	const sorted = entries.sort(
		(a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
	);
	const [home, homeAnchors] = sorted[0];
	// require a genuine cluster: >= 2 anchors AND strictly more than any other
	// origin — a balanced chain has no dominant and stays one episode
	if (homeAnchors.length < 2) return "";
	if (sorted[1] && homeAnchors.length <= sorted[1][1].length) return "";
	return home;
};

export const extractActivityEpisodes = (
	anchors: ActivityAnchor[],
	graph: Graph<ActivityAnchor, RelationshipEdge>,
): ActivityEpisode[] => {
	const sorted = [...anchors].sort((a, b) => a.startAt - b.startAt);
	const episodes: ActivityEpisode[] = [];
	let current: ActivityAnchor[] = [];
	let epSeq = 0;

	const flush = () => {
		if (current.length === 0) return;
		const first = current[0];
		const last = current[current.length - 1];
		const sessionIds = [...new Set(current.map((a) => a.sessionId))];
		const domains = [...new Set(current.map((a) => a.origin).filter(Boolean))];
		const domainEvents: Record<string, number> = {};
		for (const a of current) {
			if (a.domainEvents) {
				for (const [origin, count] of Object.entries(a.domainEvents)) {
					domainEvents[origin] = (domainEvents[origin] ?? 0) + count;
				}
			}
			if (a.origin === "") continue;
			domainEvents[a.origin] = (domainEvents[a.origin] ?? 0) + a.eventCount;
		}
		const primaryDomain = current
			.filter((a) => a.origin !== "")
			.sort((a, b) => b.eventCount - a.eventCount)[0]?.origin;
		episodes.push({
			id: `ep-${++epSeq}`,
			anchorIds: current.map((a) => a.id),
			startTimestamp: first.startAt,
			endTimestamp: last.endAt,
			duration: last.endAt - first.startAt,
			sessionIds,
			domains,
			totalEventCount: current.reduce((s, a) => s + a.eventCount, 0),
			totalInteractionCount: current.reduce(
				(s, a) => s + a.interactionCount,
				0,
			),
			totalNavigationCount: current.reduce((s, a) => s + a.navigationCount, 0),
			primaryDomain: primaryDomain ?? "",
			boundaryType: "internal",
			homeOrigin,
			domainEvents,
		});
		current = [];
	};

	// home origin: the DOMINANT origin across the whole anchor stream (a session
	// often has a task cluster; a long session can span multiple sessions but
	// still revolve around one home). Recompute once — stable across the stream.
	const homeOrigin = sessionDominantOrigin(sorted);

	for (const anchor of sorted) {
		if (current.length === 0) {
			current.push(anchor);
			continue;
		}
		const prev = current[current.length - 1];

		// hard temporal gap
		if (anchor.startAt - prev.endAt > GRAPH_THRESHOLDS.EPISODE_GAP_MS) {
			flush();
			current.push(anchor);
			continue;
		}

		// cross-session boundary with no graph edge → split (disjoint activity)
		const sameSession = anchor.sessionId === prev.sessionId;
		const hasEdge = graph.hasEdge(prev.id, anchor.id);
		if (!sameSession && !hasEdge) {
			flush();
			current.push(anchor);
			continue;
		}

		// strong same-page/same-origin continuity → stay (application navigation)
		if (graph.hasEdge(prev.id, anchor.id)) {
			const attrs = graph.getEdgeAttributes(
				graph.edge(prev.id, anchor.id),
			) as RelationshipEdge;
			if (
				(attrs.type === "same-page" || attrs.type === "same-origin") &&
				attrs.weight >= GRAPH_THRESHOLDS.STRONG_WEIGHT
			) {
				current.push(anchor);
				continue;
			}
		}

		// home-origin departure/return → episode boundary
		if (homeOrigin !== "" && anchor.origin !== "") {
			const leavingHome =
				prev.origin === homeOrigin && anchor.origin !== homeOrigin;
			const returningHome =
				prev.origin !== homeOrigin && anchor.origin === homeOrigin;
			if (leavingHome || returningHome) {
				flush();
				current.push(anchor);
				continue;
			}
		}

		current.push(anchor);
	}
	flush();

	for (let i = 0; i < episodes.length; i++) {
		const ep = episodes[i];
		ep.boundaryType =
			i === 0 ? "start" : i === episodes.length - 1 ? "end" : "internal";
	}
	return episodes;
};
