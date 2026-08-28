// packages/shared/src/episode-boundary.ts
// V7 — trajectory-coherence episode segmentation.
//
// The V6 segmentation rule asked "does this edge qualify?" (hard gap, no edge,
// home-origin departure/return, strong same-page/same-origin). That is brittle:
// "dominant origin" is a property of the observed session, not necessarily of
// the user's task, so a long mixed activity stays huge while small transitions
// get split off.
//
// This module replaces the decision with: "does the activity trajectory before
// and after this boundary look like the same activity?" For every candidate
// boundary between adjacent anchors we compute a boundary score from
// independent signals — temporal continuity, graph transition continuity,
// navigation/interaction continuity, and local trajectory profile similarity —
// then split when the combined score indicates a discontinuity.
//
// The graph remains the evidence substrate. This is NOT connected components,
// NOT community detection, NOT a statistical change-point model (PELT/BOCPD are
// explicitly deferred — we have no validated numeric observation model yet).
// The implementation is modular so a real change-point algorithm can replace
// the boundary-score rule later.

import type Graph from "graphology";
import {
	type ActivityAnchor,
	GRAPH_THRESHOLDS,
	type RelationshipEdge,
} from "./activity-graph";

// --- Configuration (§8: weights live here, not scattered) ---

export const BOUNDARY_CONFIG = {
	// temporal continuity: exp(-gapMs / temporalScale). A 3-minute gap within an
	// active research trail stays coherent (0.55); a 6-minute idle gap between
	// unrelated sites decays (0.30). Reuses the 5-minute short-gap window from
	// V4.1 — ponytail: one scale, verified against the fixtures.
	temporalScaleMs: 5 * 60 * 1000,
	// weight of each signal in the final continuity score (must sum to 1).
	// Profile similarity is the strongest signal (§5: local trajectory
	// coherence is the missing piece); time alone is weak (§4.1: a 20s gap can
	// be a task change).
	weights: {
		temporal: 0.1,
		graph: 0.2,
		navigation: 0.1,
		interaction: 0.15,
		profile: 0.45,
	},
	// continuity below this → split (boundaryScore = 1 - continuity)
	splitThreshold: 0.5,
	// profile windows: anchors looked at on each side of the boundary
	profileWindow: 2,
	// hysteresis: a boundary must stay above threshold for N consecutive
	// candidate boundaries before we actually split (suppresses flicker)
	hysteresis: 2,
} as const;

// --- Profile (§5) ---

export interface ActivityProfile {
	origins: string[]; // distinct origins (first-occurrence order)
	pageKeys: string[]; // distinct pageKeys (first-occurrence order)
	interactionRate: number; // interactions / events
	navigationRate: number; // navigations / events
	tabSet: number[]; // distinct tab ids
	transitionTypes: string[]; // edge types seen inside the window
	eventDensity: number; // events / (duration + 1s)
	// the origin the window is focused on: the origin with >= 2 anchors, or ""
	// if no origin dominates the window. A focused cluster being left (or
	// returned to) is a sharper transition than a hop between singletons — this
	// is LOCAL focus, not the session-global home-origin heuristic.
	focusedOrigin: string;
}

export const buildProfile = (
	anchors: ActivityAnchor[],
	graph: Graph<ActivityAnchor, RelationshipEdge>,
): ActivityProfile => {
	const origins: string[] = [];
	const pageKeys: string[] = [];
	const tabSet: number[] = [];
	const transitionTypes: string[] = [];
	let events = 0;
	let interactions = 0;
	let navigations = 0;

	for (let i = 0; i < anchors.length; i++) {
		const a = anchors[i];
		if (a.origin !== "" && !origins.includes(a.origin)) origins.push(a.origin);
		if (a.pageKey !== "" && !pageKeys.includes(a.pageKey))
			pageKeys.push(a.pageKey);
		if (!tabSet.includes(a.tabId)) tabSet.push(a.tabId);
		events += a.eventCount;
		interactions += a.interactionCount;
		navigations += a.navigationCount;
		if (i < anchors.length - 1 && graph.hasEdge(a.id, anchors[i + 1].id)) {
			const t = graph.getEdgeAttributes(
				graph.edge(a.id, anchors[i + 1].id),
			) as RelationshipEdge;
			if (!transitionTypes.includes(t.type)) transitionTypes.push(t.type);
		}
	}

	const durationMs = Math.max(
		1,
		(anchors[anchors.length - 1]?.endAt ?? 0) - (anchors[0]?.startAt ?? 0),
	);

	// focused origin: the origin with >= 2 anchors (local cluster)
	const originCounts = new Map<string, number>();
	for (const a of anchors) {
		if (a.origin === "") continue;
		originCounts.set(a.origin, (originCounts.get(a.origin) ?? 0) + 1);
	}
	let focusedOrigin = "";
	for (const [origin, count] of originCounts) {
		if (count >= 2) {
			focusedOrigin = origin;
			break;
		}
	}

	return {
		origins,
		pageKeys,
		tabSet,
		transitionTypes,
		interactionRate: events > 0 ? interactions / events : 0,
		navigationRate: events > 0 ? navigations / events : 0,
		eventDensity: events / (durationMs / 1000 + 1),
		focusedOrigin,
	};
};

// --- Similarity (§5, §6) ---

const jaccard = <T>(a: T[], b: T[]): number => {
	if (a.length === 0 && b.length === 0) return 1;
	const setB = new Set(b);
	const intersection = a.filter((x) => setB.has(x)).length;
	const union = new Set([...a, ...b]).size;
	return union === 0 ? 1 : intersection / union;
};

const close = (a: number, b: number): number =>
	1 - Math.min(1, Math.abs(a - b));

// Profile similarity: origins + pageKeys + tab overlap + interaction/navigation
// rates + transition-type overlap + local focused-origin continuity. 1 = same
// activity, 0 = totally different.
export const profileSimilarity = (
	left: ActivityProfile,
	right: ActivityProfile,
): number => {
	const originSim = jaccard(left.origins, right.origins);
	const pageSim = jaccard(left.pageKeys, right.pageKeys);
	const tabSim = jaccard(left.tabSet, right.tabSet);
	const transitionSim = jaccard(left.transitionTypes, right.transitionTypes);
	const interactionSim = close(left.interactionRate, right.interactionRate);
	const navigationSim = close(left.navigationRate, right.navigationRate);
	const densitySim = close(
		Math.min(1, left.eventDensity / 5),
		Math.min(1, right.eventDensity / 5),
	);

	// For a pure research trail of singleton hops, origins/pageKeys are
	// DIFFERENT by definition — zero overlap is expected, not a divergence.
	// Origin/page overlap only discriminates when there IS a shared identity
	// (same page, same origin continuation). We floor the sim at 0.5 so the
	// trail's coherence is carried by graph/time/interaction terms.
	const singletonTrail =
		left.focusedOrigin === "" && right.focusedOrigin === "";
	const originSimAdj = singletonTrail ? Math.max(0.5, originSim) : originSim;
	const pageSimAdj = singletonTrail ? Math.max(0.5, pageSim) : pageSim;

	// focused-origin continuity: leaving a focused cluster into a different one
	// (or a singleton hop) is a sharper transition. A focused cluster being
	// continued (same focused origin on both sides) is strong continuity.
	// When NEITHER side is focused (a pure research trail of singleton hops),
	// the profile is neutral — the trajectory coherence is carried by the
	// graph/time terms, not by domain overlap (the hops are all different
	// origins by definition).
	let focusSim = 0.5; // neutral
	if (left.focusedOrigin !== "" && right.focusedOrigin !== "") {
		focusSim = left.focusedOrigin === right.focusedOrigin ? 1 : 0;
	} else if (left.focusedOrigin !== "" && right.focusedOrigin === "") {
		// leaving a focused cluster into a singleton hop → discontinuity
		focusSim = right.origins.includes(left.focusedOrigin) ? 0.5 : 0.15;
	} else if (left.focusedOrigin === "" && right.focusedOrigin !== "") {
		// arriving into a focused cluster from a singleton → mild discontinuity
		focusSim = left.origins.includes(right.focusedOrigin) ? 0.5 : 0.35;
	}

	// page identity is the strongest signal, then origins, then rates
	return (
		pageSimAdj * 0.3 +
		originSimAdj * 0.2 +
		focusSim * 0.2 +
		transitionSim * 0.1 +
		tabSim * 0.05 +
		interactionSim * 0.075 +
		navigationSim * 0.05 +
		densitySim * 0.025
	);
};

// --- Boundary evidence (§8, §11) ---

export interface BoundaryEvidence {
	gapScore: number;
	graphContinuity: number;
	profileSimilarity: number;
	navigationContinuity: number;
	interactionContinuity: number;
	transitionCoherence: number;
	boundaryScore: number; // 1 - continuity
	continuity: number; // weighted sum
	reasons: string[];
}

export interface BoundaryDiagnostic {
	leftAnchorId: string;
	rightAnchorId: string;
	gapMs: number;
	boundaryScore: number;
	decision: "split" | "merge";
	reasons: string[];
	profileSimilarity: number;
	graphContinuity: number;
}

// --- Boundary scoring (§8) ---

export const computeBoundaryEvidence = (
	left: ActivityAnchor,
	right: ActivityAnchor,
	leftWindow: ActivityAnchor[],
	rightWindow: ActivityAnchor[],
	graph: Graph<ActivityAnchor, RelationshipEdge>,
): BoundaryEvidence => {
	const gapMs = Math.max(0, right.startAt - left.endAt);

	// 4.1 temporal continuity
	const gapScore = Math.exp(-gapMs / BOUNDARY_CONFIG.temporalScaleMs);

	// 4.2 graph transition continuity — typed edge evidence, bounded [0,1].
	// The edge TYPE gates the weight: same-page/same-origin edges are strong
	// continuity; a cross-origin navigation edge is informative but NOT
	// continuity (it may be a task change). A MISSING edge between different
	// origins across sessions is a discontinuity (graph says no relationship).
	let graphContinuity = 0;
	let edgeType: RelationshipEdge["type"] | null = null;
	if (graph.hasEdge(left.id, right.id)) {
		const attrs = graph.getEdgeAttributes(
			graph.edge(left.id, right.id),
		) as RelationshipEdge;
		edgeType = attrs.type;
		const sameOriginEdge =
			attrs.type === "same-page" || attrs.type === "same-origin";
		const crossOriginNav =
			attrs.type === "navigation" && left.origin !== right.origin;
		const base = sameOriginEdge
			? 1
			: attrs.type === "navigation"
				? crossOriginNav
					? 0.7
					: 0.8
				: attrs.type === "interaction-continuity"
					? 0.6
					: attrs.type === "return"
						? 0.5
						: attrs.type === "same-tab"
							? 0.35
							: 0.25; // temporal-adjacency
		graphContinuity =
			base * Math.exp(-gapMs / GRAPH_THRESHOLDS.DECAY_CONSTANT_MS);
	} else if (
		left.sessionId !== right.sessionId &&
		left.origin !== right.origin
	) {
		// no edge across a session boundary with different origins → the graph
		// explicitly has no relationship: discontinuity, not neutral
		graphContinuity = 0;
	} else if (left.origin === right.origin) {
		// same origin but no edge (e.g. gap beyond cutoff) — mild continuity
		graphContinuity = 0.3;
	}

	// navigation continuity — a deliberate navigation is continuity ONLY when it
	// stays within the same origin/page (application navigation). Cross-origin
	// navigation is a candidate task change: informative (a direct hop), but not
	// proof of the same activity (§4.2).
	const sameOriginNav =
		right.navigationCount > 0 && left.origin === right.origin;
	const navigationContinuity =
		right.navigationCount > 0 && gapMs <= BOUNDARY_CONFIG.temporalScaleMs
			? sameOriginNav
				? 1
				: 0.5
			: 0.2;

	// interaction continuity — active work on both sides
	const interactionContinuity =
		left.interactionCount > 0 && right.interactionCount > 0
			? Math.min(1, (left.interactionCount + right.interactionCount) / 4)
			: 0.2;

	// transition coherence — the edge type is meaningful
	const transitionCoherence =
		edgeType === "same-page" || edgeType === "same-origin"
			? 1
			: edgeType === "navigation" || edgeType === "interaction-continuity"
				? 0.8
				: edgeType === "return"
					? 0.6
					: edgeType === "same-tab"
						? 0.5
						: 0.3;

	// 5 — local trajectory coherence (the missing signal)
	const leftProfile = buildProfile(leftWindow, graph);
	const rightProfile = buildProfile(rightWindow, graph);
	const profileSim = profileSimilarity(leftProfile, rightProfile);

	const w = BOUNDARY_CONFIG.weights;
	const continuity =
		w.temporal * gapScore +
		w.graph * graphContinuity +
		w.navigation * navigationContinuity +
		w.interaction * interactionContinuity +
		w.profile * profileSim;

	const boundaryScore = Math.max(0, Math.min(1, 1 - continuity));

	// hard rule: no graph edge + different sessions → the graph explicitly
	// declares no relationship; profile similarity from matching rates/tabs must
	// not rescue it (fallback anchors with no event sequences produce
	// identical-looking singleton profiles). Same-origin continuation across a
	// session gap is still rescued at the CONTEXT layer via transition evidence;
	// at the episode layer a missing edge means default-split (§3).
	const hardDisconnect =
		!graph.hasEdge(left.id, right.id) &&
		left.sessionId !== right.sessionId &&
		left.origin !== "" &&
		right.origin !== "";

	const reasons: string[] = [];
	if (gapScore < 0.5) reasons.push(`temporal-gap:${Math.round(gapMs / 1000)}s`);
	if (graphContinuity < 0.5)
		reasons.push(`weak-graph-edge:${edgeType ?? "none"}`);
	if (profileSim < 0.5)
		reasons.push(`profile-divergence:${profileSim.toFixed(2)}`);
	if (navigationContinuity < 0.5) reasons.push("no-navigation");
	if (interactionContinuity < 0.5) reasons.push("no-interaction");

	return {
		gapScore,
		graphContinuity,
		profileSimilarity: profileSim,
		navigationContinuity,
		interactionContinuity,
		transitionCoherence,
		boundaryScore: hardDisconnect ? 1 : boundaryScore,
		continuity: hardDisconnect ? 0 : continuity,
		reasons: hardDisconnect ? [...reasons, "graph-disconnect"] : reasons,
	};
};

// --- Stabilization pass (§13-§16 of segmentation-stabilization spec) ---
// Narrow addition on top of the V7 trajectory scorer: instead of thresholding
// every adjacent boundary independently, we now SELECT boundaries with a
// split-vs-merge objective (a split is accepted only when it pays for its own
// boundary penalty) and we DEMAND persistence evidence from the right side.
// All building blocks are pure and deterministic; buildActivityAnchors and
// buildActivityGraph are untouched.

// --- Low-semantic-density surfaces (§11) ---
// chrome://newtab / chrome-extension:// pages have no real task identity. They
// get weaker standalone boundary evidence unless interaction+duration+navigation
// show a real activity. Generic classifier — no hard-coded URL lists.
export const isLowSemanticDensity = (origin: string): boolean =>
	origin.startsWith("chrome://") || origin.startsWith("chrome-extension://");

// --- Behavioral mass (§6, §10) ---
// A segment's "meaningfulness" is NOT anchor count alone: one long interactive
// anchor out-weights five trivial browser-state anchors. Mass is a small,
// documented composite of the existing per-anchor fields. Units are events
// (an anchor of 1 trivial event has mass 1).
export const anchorMass = (a: ActivityAnchor): number => {
	const durationMin = (a.endAt - a.startAt) / 60_000;
	// one event per 2 minutes of dwelling; interactions/navigations are heavier
	return (
		a.eventCount +
		durationMin * 0.5 +
		a.interactionCount * 3 +
		a.navigationCount * 2
	);
};

// A tiny episode must NOT survive merely because it has >= N anchors. It needs
// minimum behavioral mass (spec §10). 3 events of mass is the old
// MIN_EPISODE_EVENTS=3 threshold, now weighted: a 2-interaction anchor or a
// 6-minute dwell also qualifies.
export const MIN_EPISODE_MASS = 3;

// --- Boundary penalty (§9) ---
// The one tunable knob. A split is worthwhile only when
//   cost(merged) - (cost(left) + cost(right)) > EPISODE_BOUNDARY_PENALTY
// Higher penalty → fewer episodes; lower → more. Mirrors penalized change-point
// methods (PELT-style). This is the ONLY segmentation threshold that must be
// tuned; the rest are derived from the coherence cost.
export const EPISODE_BOUNDARY_PENALTY = 0.35;

// --- Activity coherence cost (§8) ---
// Pure function: penalizes internal heterogeneity of an anchor group using ONLY
// existing fields (origin/page diversity, transition discontinuity,
// interaction-rate variance, temporal discontinuity, graph-edge weakness).
// Normalized to [0, 1]: coherent single-activity → low cost; mixed unrelated
// activity → high cost. Raw event count is NOT the dominant term.
export const activityCoherenceCost = (
	anchors: ActivityAnchor[],
	graph: Graph<ActivityAnchor, RelationshipEdge>,
): number => {
	// a sub-minimum group is not a meaningful activity — its internal
	// heterogeneity is not evidence of mixed activity (MIN_EPISODE_MASS
	// already guards the minimum size). Cost 0 keeps single-anchor segments
	// free so the split-vs-merge decision compares purely on the merged
	// episode's cost.
	if (anchors.length === 0) return 0;
	if (anchors.reduce((s, a) => s + anchorMass(a), 0) < MIN_EPISODE_MASS)
		return 0;

	const originCounts = new Map<string, number>();
	for (const a of anchors) {
		if (a.origin === "") continue;
		originCounts.set(a.origin, (originCounts.get(a.origin) ?? 0) + 1);
	}
	const totalOrigins = anchors.filter((a) => a.origin !== "").length;
	const distinctOrigins = originCounts.size;
	// a single-origin group (or single anchor, or empty) is maximally
	// coherent: cost 0. Only multi-origin heterogeneity carries cost (§8:
	// coherent activity → low cost; mixed unrelated activity → high cost).
	if (distinctOrigins <= 1) return 0;
	// dominant-origin share: the fraction of anchors in the dominant origin.
	// A group where 2/3 anchors share one origin is mostly coherent; a group
	// where every anchor is a different origin is maximally mixed. This is the
	// right heterogeneity signal for the split-vs-merge objective: splitting
	// a real transition yields two MORE internally-coherent halves.
	const dominantShare =
		totalOrigins > 0 ? Math.max(...originCounts.values()) / totalOrigins : 0;
	// heterogeneity = 1 - dominantShare (0 = all one origin, 1 = all distinct)
	const originHeterogeneity = distinctOrigins > 1 ? 1 - dominantShare : 0;

	const pageDiversity =
		new Set(anchors.map((a) => a.pageKey).filter(Boolean)).size /
		Math.max(1, anchors.length);

	// transition discontinuity: fraction of adjacent pairs with NO graph edge or
	// a weak edge (temporal-adjacency only) — mixed chains are disjoint
	let weakTransitions = 0;
	let adjacencies = 0;
	for (let i = 0; i < anchors.length - 1; i++) {
		const a = anchors[i];
		const b = anchors[i + 1];
		if (!graph.hasEdge(a.id, b.id)) {
			weakTransitions++;
			adjacencies++;
			continue;
		}
		const t = graph.getEdgeAttributes(
			graph.edge(a.id, b.id),
		) as RelationshipEdge;
		if (t.type === "temporal-adjacency") weakTransitions++;
		adjacencies++;
	}
	const transitionDiscontinuity =
		adjacencies > 0 ? weakTransitions / adjacencies : 0;

	// interaction-rate variance: mixed activities have wildly different rates
	const rates = anchors
		.map((a) => (a.eventCount > 0 ? a.interactionCount / a.eventCount : 0))
		.filter((r) => Number.isFinite(r));
	const meanRate =
		rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
	const rateVariance =
		rates.length > 1
			? rates.reduce((s, r) => s + (r - meanRate) ** 2, 0) / rates.length
			: 0;

	// temporal discontinuity: fraction of adjacent gaps that are long (> 2x the
	// excursion window) — sparse activity inside one episode is incoherent
	let longGaps = 0;
	let gaps = 0;
	for (let i = 0; i < anchors.length - 1; i++) {
		const gap = anchors[i + 1].startAt - anchors[i].endAt;
		if (gap > GRAPH_THRESHOLDS.SHORT_GAP_MS * 2) longGaps++;
		gaps++;
	}
	const temporalDiscontinuity = gaps > 0 ? longGaps / gaps : 0;

	// normalize: origin heterogeneity dominates (strongest mixed-activity
	// signal), then transition discontinuity, then the rest. The result stays
	// in [0,1]; a fully mixed group (every anchor a different origin, weak
	// edges) approaches 1.
	const normalizedVariance = Math.min(1, rateVariance / 0.25);
	return Math.min(
		1,
		0.4 * originHeterogeneity +
			0.2 * pageDiversity +
			0.2 * transitionDiscontinuity +
			0.1 * normalizedVariance +
			0.1 * temporalDiscontinuity,
	);
};

// --- Right-side persistence (§5, §6) ---
// A candidate boundary is credible only if the behavioral difference PERSISTS
// after the boundary: the right side must carry enough activity-weighted mass
// to represent a real new activity. This is what turns "A → B → A" into an
// excursion candidate instead of two boundaries — B's right-side window is
// simply too light to pay for the split.
export const rightSidePersistence = (rightWindow: ActivityAnchor[]): number =>
	Math.min(1, rightWindow.reduce((s, a) => s + anchorMass(a), 0) / 8);

// --- Post-segmentation cleanup (§9) ---

// A tiny episode (below MIN_EPISODE_MASS) that both neighbors strongly support
// is merged into the better-supported neighbor. This is a post-segmentation
// cleanup, not a clustering algorithm. The merge is performed by the caller
// via `rebuild` (which must recompute the merged episode's aggregates from its
// anchor ids) because episode shape is owned by the caller.
export const mergeTinyEpisodes = <T>(
	episodes: T[],
	isTiny: (e: T) => boolean,
	neighborCoherence: (left: T, right: T) => number,
	rebuild: (anchorIds: string[], template: T) => T,
): T[] => {
	if (episodes.length <= 2) return episodes;
	const result: T[] = [];
	let i = 0;
	while (i < episodes.length) {
		const current = episodes[i];
		if (isTiny(current) && i > 0 && i < episodes.length - 1) {
			const left = neighborCoherence(episodes[i - 1], current);
			const right = neighborCoherence(episodes[i + 1], current);
			// §9 — merge into the adjacent episode with STRONGER evidence. Either
			// side supporting continuity is enough (a 2-event linkedin glance
			// between two research bursts belongs to whichever side it matches);
			// requiring BOTH sides leaves genuine fragments stranded. A tiny
			// episode with NO support on either side stays separate (it may be a
			// real brief visit).
			if (left > 0 || right > 0) {
				if (left >= right) {
					const leftEp = result[result.length - 1];
					result[result.length - 1] = rebuild(
						[
							...(leftEp as { anchorIds: string[] }).anchorIds,
							...(current as { anchorIds: string[] }).anchorIds,
						],
						leftEp,
					);
				} else {
					const rightEp = episodes[i + 1];
					result.push(
						rebuild(
							[
								...(current as { anchorIds: string[] }).anchorIds,
								...(rightEp as { anchorIds: string[] }).anchorIds,
							],
							current,
						),
					);
					i++; // skip the right neighbor, it was consumed
				}
			} else {
				result.push(current);
			}
		} else {
			result.push(current);
		}
		i++;
	}
	return result;
};
