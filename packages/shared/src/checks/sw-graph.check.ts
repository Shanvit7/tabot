// packages/shared/src/checks/sw-graph.check.ts
// Phase 2 — Step 10: integrate SW evidence into the activity graph.
//
// Step 9 selected SW_WINDOW_FOCUS as the first high-value signal. Step 10
// turns it into GRAPH evidence:
//
//   SW_WINDOW_FOCUS  ->  focus-continuity evidence on an EXISTING edge
//
// and nothing else. SV-volatile rules proven here (spec §10):
//  1. SW events NEVER become graph nodes (node set unchanged by decoration).
//  2. SW evidence NEVER creates an edge (edge set unchanged; a gap the
//     trajectory did not earn stays a gap — no fabricated relationships).
//  3. focus-continuity attaches ONLY to same-session, same-window edges that
//     already exist, and only when a CAUSAL focus sandwich (departure w->x,
//     return x->w, chained via previousWindowId) lies inside the anchor span:
//     the user's attention left the window and came back while the trajectory
//     continued. Phase 1 tab telemetry cannot see that — it reads the same
//     gap as idle time.
//  4. The other four SW signals (toggle/popup/download/lifecycle) produce NO
//     graph evidence (Step 9 audit: no structure to attach).
//  5. focus-continuity evidence cannot create an episode: the episode layer
//     has no consumer for it until Step 11 (this check asserts the decorated
//     graph yields IDENTICAL episodes — evidence strengthens later, never
//     fabricates now).
//
// Run: node --import ./resolve-hook.mjs src/checks/sw-graph.check.ts

import assert from "node:assert/strict";
import {
	type ActivityAnchor,
	buildActivityAnchors,
	buildActivityGraph,
	extractActivityEpisodes,
} from "../activities/activity-graph";
import {
	applyFocusContinuity,
	FOCUS_CONTINUITY_EVIDENCE,
} from "../activities/sw-graph";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";
import { sessionize } from "../sessions/sessions";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

const ev = (
	timestamp: number,
	type: StoredTabEvent["type"],
	tabId: number,
	windowId = 1,
	url?: string,
	metadata?: StoredTabEvent["metadata"],
): StoredTabEvent => ({
	id: `${timestamp}-${tabId}-${type}`,
	type,
	tabId,
	windowId,
	timestamp,
	url,
	metadata,
});

// --- scenario 1 (the win): a closed focus excursion inside one window's
// trajectory. User works in window 100 (docs), glances at window 101 for 25
// seconds, returns, and continues in window 100 (github). Phase 1 sees only
// the tab events on each side; the graph cannot explain the gap. The focus
// stream CAN: it is a departure->return sandwich on window 100. ---
const closedExcursion = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	ev(T0 + 1 * MIN, "NAVIGATION", 1, 100, "https://docs.google.com/document"),
	ev(T0 + 2 * MIN, "SCROLL", 1, 100, "https://docs.google.com/document", {
		scrollY: 900,
	}),
	// excursion: depart window 100 -> 101 ...
	ev(T0 + 2 * MIN + 5_000, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	// ... return 101 -> 100 (chains to the departure)
	ev(T0 + 2 * MIN + 30_000, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	ev(T0 + 3 * MIN, "NAVIGATION", 1, 100, "https://github.com/org/repo"),
	ev(T0 + 3 * MIN + 30_000, "SCROLL", 1, 100, "https://github.com/org/repo", {
		scrollY: 1500,
	}),
];

// --- the graph pipeline exactly as production builds it (sessions -> anchors
// -> graph), then the Step 10 evidence pass. ---
const build = (rows: StoredTabEvent[]) => {
	const sessions = sessionize(rows);
	const anchors = buildActivityAnchors(sessions) as ActivityAnchor[];
	const graph = buildActivityGraph(anchors);
	return { sessions, anchors, graph };
};

const nodeCount = (g: ReturnType<typeof buildActivityGraph>) =>
	g.reduceNodes((n) => n + 1, 0);
const edgeCount = (g: ReturnType<typeof buildActivityGraph>) =>
	g.reduceEdges((n) => n + 1, 0);
const edgeEvidence = (
	g: ReturnType<typeof buildActivityGraph>,
	from: string,
	to: string,
): string[] => {
	const edge = g.edge(from, to);
	return (g.getEdgeAttributes(edge) as { evidence: string[] }).evidence;
};

const lines: string[] = [];
const line = (s = "") => lines.push(s);

line("=== Step 10: SW evidence in the activity graph ===");

// ---- 1. closed excursion -> focus-continuity on the EXISTING edge ----
const { anchors, graph } = build(closedExcursion());
assert.equal(anchors.length, 2, "docs + github anchors");
assert.equal(anchors[0].windowId, 100, "anchor A in window 100");
assert.equal(anchors[1].windowId, 100, "anchor B in window 100");
const edgeId = graph.edge(anchors[0].id, anchors[1].id);
assert.ok(
	edgeId !== undefined,
	"A->B edge exists (same session, under cutoff)",
);
const beforeNodes = nodeCount(graph);
const beforeEdges = edgeCount(graph);
assert.equal(beforeNodes, 2, "graph has exactly the two anchor nodes");
assert.equal(beforeEdges, 1, "graph has exactly the one trajectory edge");

const strengthened = applyFocusContinuity(graph, closedExcursion());
assert.equal(strengthened, 1, "one edge strengthened by focus-continuity");

line("");
line(
	"SCENARIO 1 — closed excursion (100 -> 101 -> 100) inside the trajectory:",
);
line(`  strengthened edges : ${strengthened}`);
line(
	`  A->B evidence       : [${edgeEvidence(graph, anchors[0].id, anchors[1].id).join(", ")}]`,
);
assert.ok(
	edgeEvidence(graph, anchors[0].id, anchors[1].id).includes(
		FOCUS_CONTINUITY_EVIDENCE,
	),
	"A->B edge carries focus-continuity evidence",
);
assert.equal(nodeCount(graph), beforeNodes, "SW adds NO nodes");
assert.equal(edgeCount(graph), beforeEdges, "SW adds NO edges");

// ---- 2. no SW focus events -> no-op ----
const plain = closedExcursion().filter((e) => e.type !== "SW_WINDOW_FOCUS");
const { graph: plainGraph } = build(plain);
assert.equal(
	applyFocusContinuity(plainGraph, plain),
	0,
	"no SW -> no evidence",
);

line("");
line("SCENARIO 2 — no SW telemetry:");
line("  strengthened edges : 0 (no-op — Phase 1 pipeline byte-identical)");

// ---- 3. broken causal chain / same-window focus -> NO evidence ----
const broken = closedExcursion().map((e) =>
	e.type === "SW_WINDOW_FOCUS" && e.windowId === 100
		? { ...e, metadata: { previousWindowId: 999 } } // return does NOT chain
		: e,
);
const { graph: brokenGraph } = build(broken);
assert.equal(
	applyFocusContinuity(brokenGraph, broken),
	0,
	"unchained return -> no evidence (false positives impossible)",
);

const stay = closedExcursion().map((e) =>
	e.type === "SW_WINDOW_FOCUS" && e.windowId === 100
		? { ...e, metadata: { previousWindowId: 100 } } // focus "stay", no excursion
		: e,
);
const { graph: stayGraph } = build(stay);
assert.equal(
	applyFocusContinuity(stayGraph, stay),
	0,
	"same-window re-focus is not an excursion",
);

// Step 10 correction — browser focus loss/regain (windowId -1 / previousWindowId
// -1) is focus STATE, not user intent: w -> WINDOW_ID_NONE -> w must NOT be
// read as a cross-window excursion. The focus stream these events would form is
// a regain whose previousWindowId is -1 — excluded by the guard below.
const regain = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	ev(T0 + 1 * MIN, "NAVIGATION", 1, 100, "https://docs.google.com/document"),
	ev(T0 + 2 * MIN, "SCROLL", 1, 100, "https://docs.google.com/document", {
		scrollY: 900,
	}),
	// OS/app focus lost ...
	ev(T0 + 2 * MIN + 5_000, "SW_WINDOW_FOCUS", 0, -1, undefined, {
		previousWindowId: -1,
	}),
	// ... and regained — same window, but NOT via another real window
	ev(T0 + 2 * MIN + 30_000, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: -1,
	}),
	ev(T0 + 3 * MIN, "NAVIGATION", 1, 100, "https://github.com/org/repo"),
	ev(T0 + 3 * MIN + 30_000, "SCROLL", 1, 100, "https://github.com/org/repo", {
		scrollY: 1500,
	}),
];
const { graph: regainGraph } = build(regain());
assert.equal(
	applyFocusContinuity(regainGraph, regain()),
	0,
	"w -> -1 -> w focus regain is not excursion evidence (focus state != intent)",
);

line("");
line("SCENARIO 3 — invalid sandwiches:");
line("  0 evidence when previousWindowId does not chain (broken causality)");
line("  0 evidence when the focus is a same-window 'stay' (no excursion)");
line(
	"  0 evidence for w -> -1 -> w focus regain (browser focus state, Step 10",
);
line("  correction — not user intent)");

// ---- 4. cross-window anchor pair -> no evidence (per-window trajectory) ----
const crossWindow = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	ev(T0 + 30_000, "SCROLL", 1, 100, "https://docs.google.com/document", {
		scrollY: 900,
	}),
	ev(T0 + 35_000, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 50_000, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	ev(T0 + 65_000, "NAVIGATION", 2, 101, "https://github.com/org/repo"),
];
const { anchors: cwAnchors, graph: cwGraph } = build(crossWindow());
assert.ok(
	cwAnchors.some((a) => a.windowId === 100) &&
		cwAnchors.some((a) => a.windowId === 101),
	"fixture has anchors in two windows",
);
assert.equal(
	applyFocusContinuity(cwGraph, crossWindow()),
	0,
	"evidence is per-window trajectory — cross-window pair gets none",
);

// ---- 5. retired SW signals -> zero graph evidence (historical rows harmless) ----
// popup/toggle/download/lifecycle are diagnostic; even when present in
// HISTORICAL persisted streams they contribute no graph evidence.
const otherSignals = closedExcursion().concat([
	ev(T0 + 4 * MIN, "SW_TRACKING_TOGGLE", 0, 1, undefined, { enabled: true }),
	ev(T0 + 5 * MIN, "SW_POPUP_OPEN", 0, 0, undefined, { source: "popup" }),
	ev(T0 + 6 * MIN, "SW_DOWNLOAD", 1, 0, undefined, { state: 2 }),
	ev(T0 + 7 * MIN, "SW_LIFECYCLE", 0, 2, undefined, { lifecycle: "suspend" }),
]);
const { graph: otherGraph } = build(otherSignals);
assert.equal(
	applyFocusContinuity(otherGraph, otherSignals),
	1,
	"focus evidence survives in a mixed stream",
);
// same stream WITHOUT the focus events: zero across every other SW signal
const noFocus = otherSignals.filter((e) => e.type !== "SW_WINDOW_FOCUS");
const { graph: noFocusGraph } = build(noFocus);
assert.equal(
	applyFocusContinuity(noFocusGraph, noFocus),
	0,
	"toggle/popup/download/lifecycle contribute NO graph evidence",
);

line("");
line("SCENARIO 4+5 — structural guards:");
line(
	"  cross-window anchor pair: 0 (evidence never jumps windows — it belongs",
);
line("  to the WINDOW's own trajectory)");
line("  toggle/popup/download/lifecycle: 0 evidence in a mixed stream — only");
line("  SW_WINDOW_FOCUS produces graph evidence (Step 9 audit)");

// ---- 6. focus-continuity cannot create an episode ----
const episodesBefore = extractActivityEpisodes(
	build(plain).anchors,
	build(plain).graph,
);
const decorated = build(closedExcursion());
applyFocusContinuity(decorated.graph, closedExcursion());
const episodesAfter = extractActivityEpisodes(
	decorated.anchors,
	decorated.graph,
);
assert.equal(
	episodesAfter.length,
	episodesBefore.length,
	"evidence does not change episode count",
);
assert.deepEqual(
	episodesAfter.map((e) => e.anchorIds),
	episodesBefore.map((e) => e.anchorIds),
	"episode segmentation identical — evidence cannot create/split an episode",
);

line("");
line("SCENARIO 6 — episode layer:");
line(
	"  episodes identical before/after decoration: focus-continuity is stored",
);
line(
	"  graph evidence, consumed by the episode boundary scorer only in Step 11.",
);

// ---- documentation: signal -> graph evidence mapping ----
line("");
line("EDGE EVIDENCE FROM SW SIGNALS (Step 10 deliverable):");
line(
	"  SIGNAL               EVIDENCE           EDGE SET   EPISODE        STRENGTHENS",
);
line(
	"  SW_WINDOW_FOCUS      focus-continuity   UNCHANGED  NEVER          existing same-session/same-window edge only",
);
line("  SW_TRACKING_TOGGLE   — none            —          —              —");
line("  SW_POPUP_OPEN        — none            —          —              —");
line("  SW_DOWNLOAD          — none            —          —              —");
line("  SW_LIFECYCLE         — none            —          —              —");
line("");
line(
	"  edge type      : focus-continuity (evidence string on the host edge; the",
);
line(
	"                   host edge TYPE — same-page/same-origin/... — is untouched,",
);
line("                   so Phase 1 reading of the graph is unchanged)");
line(
	"  weight/decay   : inherited from the host edge. The evidence is a causal",
);
line(
	"                   explanation of the gap the edge already spans; it does not",
);
line("                   create a new temporal object with its own decay");
line(
	"  can create ep. : no — an episode requires trajectory edges; focus evidence",
);
line(
	"                   is attached only where a trajectory edge already exists",
);
line("  strengthens    : yes — Step 11 evaluates it in boundary scoring");

console.log(lines.join("\n"));

logger.info("sw-graph.check: all assertions passed ✔");
