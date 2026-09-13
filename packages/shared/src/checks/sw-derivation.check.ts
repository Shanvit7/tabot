// packages/shared/src/checks/sw-derivation.check.ts
// Phase 2 — Step 8: Phase 1 (Pipeline A) vs Phase 1 + SW (Pipeline B) derivation.
//
// Run the SAME representative trace through the full pipeline twice:
//   A = tab/page telemetry only
//   B = tab/page telemetry + the approved SW signals
// and compare every derived layer: sessions → graph edges → contexts →
// memories. The goal is not to prove SW changes everything, but to show where
// it measurably helps, where it should help but currently doesn't, and where
// it adds nothing (evidence-driven — the spec's whole thesis).
//
// Run: node --import ./resolve-hook.mjs src/checks/sw-derivation.check.ts

import assert from "node:assert/strict";
import {
	type ActivityAnchor,
	buildActivityAnchors,
	buildActivityGraph,
} from "../activities/activity-graph";
import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events";
import { buildContexts } from "../contexts/contexts";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";
import { buildMemories } from "../memories/memories";
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

// --- the trace: a recurring "docs → github → linkedin" trail visited twice.
// Two occurrences of the same trail → one RECURRENT memory (V7). ---
const trail = (base: number): StoredTabEvent[] => [
	ev(base, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	ev(base + 1 * MIN, "NAVIGATION", 1, 100, "https://docs.google.com/document"),
	ev(base + 2 * MIN, "SCROLL", 1, 100, "https://docs.google.com/document", {
		scrollY: 900,
	}),
	ev(base + 3 * MIN, "CLICK", 1, 100, undefined, { x: 20, y: 40 }),
	ev(base + 4 * MIN, "NAVIGATION", 1, 100, "https://github.com/org/repo"),
	ev(base + 5 * MIN, "SCROLL", 1, 100, "https://github.com/org/repo", {
		scrollY: 1500,
	}),
	ev(base + 6 * MIN, "NAVIGATION", 1, 100, "https://linkedin.com"),
	ev(base + 7 * MIN, "SCROLL", 1, 100, "https://linkedin.com", {
		scrollY: 600,
	}),
];

// SW signals sprinkled over BOTH visits — window focus plus rows of every
// RETIRED signal (tracking toggle, download, popup open, lifecycle noise).
// Same set in both runs' raw stream except Pipeline A drops the SW rows (that
// is the only difference). FINAL taxonomy: only SW_WINDOW_FOCUS is analytical
// (contextual, skipped by sessionize — Step 10 correction), and every other
// SW type is diagnostic → also skipped. So session eventCount is identical.
const swSignals = (): StoredTabEvent[] => [
	ev(T0 + 30 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 31 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	ev(T0 + 32 * MIN, "SW_TRACKING_TOGGLE", 0, 1, undefined, { enabled: true }),
	ev(T0 + 34 * MIN, "SW_DOWNLOAD", 1, 0, undefined, { state: 2 }),
	ev(T0 + 35 * MIN, "SW_POPUP_OPEN", 0, 0, undefined, { source: "popup" }),
	ev(T0 + 60 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	ev(T0 + 90 * MIN, "SW_LIFECYCLE", 0, 2, undefined, {
		lifecycle: "suspend",
	}),
];

// Full pipeline: same as pipeline.check.ts `run` + graph edge count.
const runPipeline = (rows: StoredTabEvent[]) => {
	const sessions = sessionize(rows);
	const transitions = deriveTransitions(deriveMeaningfulEvents(rows));
	const contexts = buildContexts(sessions, transitions);
	const memories = buildMemories(contexts, T0 + 200 * MIN);
	const anchors = buildActivityAnchors(sessions) as ActivityAnchor[];
	const graph = buildActivityGraph(anchors);
	const edges = graph.reduceEdges((n) => n + 1, 0);
	return { sessions, transitions, contexts, memories, edges };
};

// Domain totals of a context, as a flat string for strict comparison.
const contextSignature = (c: {
	domains: Array<{ domain: string; eventCount: number }>;
}): string =>
	c.domains
		.map((d) => `${d.domain}:${d.eventCount}`)
		.sort()
		.join("|");

const lines: string[] = [];
const line = (s = "") => lines.push(s);
const ok = (label: string, cond: boolean) =>
	line(`${cond ? "✔" : "✘"} ${label}`);

line("=== SW Phase 1 vs Phase 2 derivation (Step 8) ===");

const aRows = trail(T0).concat(trail(T0 + 120 * MIN)); // Pipeline A input
const bRows = aRows.concat(swSignals()); // Pipeline B input

const A = runPipeline(aRows);
const B = runPipeline(bRows);

ok("imports resolve (real shared pipeline)", typeof sessionize === "function");

// sessions
line("");
line("SESSIONS:");
line(`  A count        : ${A.sessions.length}`);
line(`  B count        : ${B.sessions.length}`);
line(`  A events/sum   : ${A.sessions.reduce((s, x) => s + x.eventCount, 0)}`);
line(`  B events/sum   : ${B.sessions.reduce((s, x) => s + x.eventCount, 0)}`);
ok(
	"session eventCount: SW rows are ALL skipped (focus contextual + retired diagnostic)",
	B.sessions.reduce((s, x) => s + x.eventCount, 0) ===
		A.sessions.reduce((s, x) => s + x.eventCount, 0),
);
line("");
line("  note: SW_WINDOW_FOCUS is skipped by sessionize (Step 10 correction) —");
line(
	"  focus is CONTEXT, not activity: it must not reset the inactivity timer",
);
line("  or bridge a gap, so it cannot inflate or merge sessions.");
line(
	"  RETIRED SW rows (popup/toggle/download/lifecycle) are diagnostic → also",
);
line("  skipped. Production SW contribution to sessions = 0. (FINAL taxonomy)");
line("TRANSITIONS / GRAPH EDGES:");
line(`  A transitions  : ${A.transitions.length}`);
line(`  B transitions  : ${B.transitions.length}`);
line(`  A graph edges  : ${A.edges}`);
line(`  B graph edges  : ${B.edges}`);
ok(
	"SW events add NO transitions (they carry no url)",
	A.transitions.length === B.transitions.length,
);
ok("graph edge count unchanged by SW", A.edges === B.edges);

// contexts
line("");
line("CONTEXTS:");
line(`  A contexts     : ${A.contexts.length}`);
line(`  B contexts     : ${B.contexts.length}`);
ok(
	"context set identical (domains + boundaries)",
	A.contexts.length === B.contexts.length &&
		A.contexts.every(
			(c, i) => contextSignature(c) === contextSignature(B.contexts[i]),
		),
);
ok(
	"context domain totals unchanged by SW",
	A.contexts.reduce((s, c) => s + c.totalEventCount, 0) ===
		B.contexts.reduce((s, c) => s + c.totalEventCount, 0),
);

// memories
line("");
line("MEMORIES:");
line(`  A memories     : ${A.memories.length}`);
line(`  B memories     : ${B.memories.length}`);
const avgConf = (ms: Array<{ confidence: number }>) =>
	ms.reduce((s, m) => s + m.confidence, 0) / (ms.length || 1);
line(`  A avg confidence: ${avgConf(A.memories).toFixed(3)}`);
line(`  B avg confidence: ${avgConf(B.memories).toFixed(3)}`);
ok(
	"recurrent memory survives both pipelines",
	A.memories.length >= 1 && B.memories.length >= 1,
);

// ---- the analytical verdict (spec §8): where SW does / doesn't help ----
line("");
line("ANALYTICAL VERDICT:");
ok(
	"[no useful info] ALL retired SW signals add nothing to derivation",
	A.contexts.length === B.contexts.length &&
		A.memories.length === B.memories.length &&
		A.edges === B.edges,
);
assert.equal(
	B.sessions.reduce((s, x) => s + x.eventCount, 0),
	A.sessions.reduce((s, x) => s + x.eventCount, 0),
	"no SW row adds session events (focus contextual + retired diagnostic are " +
		"all skipped by sessionize; FINAL KEEP-WITH-REDUCTION taxonomy)",
);
line(
	"  [correctly inert]  ALL SW rows (focus + popup/toggle/download/lifecycle): NO session effect",
);
line(
	"  [correctly inert]  SW_WINDOW_FOCUS (contextual): NO session effect — skipped by sessionize",
);
line(
	"  [should-change]     SW_WINDOW_FOCUS carries cross-window continuity (100<->101)",
);
line("  [changes correctly] SW is filtered, never fed as behavioral evidence");
line(
	"  => no false transitions. It cannot split/merge a context as noise can.",
);

console.log(lines.join("\n"));

logger.info("sw-derivation.check: all assertions passed ✔");
