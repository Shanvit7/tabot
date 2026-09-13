// packages/shared/src/checks/sw-first-signal.check.ts
// Phase 2 — Step 9: identify the FIRST high-value SW signal.
//
// Step 8 showed the current pipeline is SW-invariant (transitions, graph
// edges, contexts, memories identical). Step 9 therefore cannot fake a
// derivation delta — it must do the real selection work: connect each
// retained signal to a DECISION it could improve, and prove the one signal
// that carries genuinely NEW information Phase 1 telemetry cannot express.
//
// The +N find after Steps 6-8:
//   SW_TRACKING_TOGGLE  user decision about Tabot itself — meta, not behavior
//   SW_WINDOW_FOCUS     browser-state: which window is frontmost + the CAUSAL
//                       predecessor. *Previous focus window is not derivable
//                       from any Phase 1 event* -> the only NEW information.
//   SW_POPUP_OPEN       extension interaction — no payload, no structure
//   SW_DOWNLOAD         browser-state — no payload, no structure
//   SW_LIFECYCLE        diagnostic — Step 7 already proved it INVISIBLE
//
// Selection: SW_WINDOW_FOCUS is the first high-value signal. It carries a
// focus timeline (windowId + previousWindowId) that tab telemetry cannot
// reconstruct — Phase 1 has no event that records "which window is the user
// looking at". That is the decision input: browser-state continuity for
// boundary/causation evidence (evaluated at the graph layer in Step 10).
//
// This check asserts the PROVABLE facts:
//   1. A focus timeline can be reconstructed from SW_WINDOW_FOCUS rows.
//   2. The reconstructed timeline is causally consistent (previousWindowId
//      matches the immediately preceding focus when no other focus intervenes).
//   3. Phase 1 telemetry expresses NO "current focused window" — tab events
//      carry windowId only as the event origin, never focus state. The info
//      is new, not duplicated (Phase 2 principle #4).
//   4. Per-signal decision audit: each signal is connected to a decision, or
//      honestly marked as carrying no decision input.
//
// Run: node --import ./resolve-hook.mjs src/checks/sw-first-signal.check.ts

import assert from "node:assert/strict";
import { classifySemantic } from "../activities/sw-semantics";
import type { StoredTabEvent } from "../events/db";
import type { TabEventType } from "../events/events";
import { logger } from "../lib/logger";

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

// --- the focus timeline a real capture would see: user bounces between
// window 100 and window 101, ending focused on 100. ---
const focusTimeline = (): StoredTabEvent[] => [
	ev(T0, "SW_WINDOW_FOCUS", 0, 100, undefined, { previousWindowId: -1 }),
	ev(T0 + 3 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 7 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
];

const lines: string[] = [];
const line = (s = "") => lines.push(s);

line("=== Step 9: first high-value SW signal ===");

// ---- 1. focus timeline reconstruction ----
const timeline = focusTimeline()
	.filter((e) => e.type === "SW_WINDOW_FOCUS")
	.map((e) => ({
		ts: e.timestamp,
		windowId: e.windowId,
		previous: e.metadata?.previousWindowId ?? -1,
	}));
assert.equal(timeline.length, 3, "3 focus events in the trace");
assert.deepEqual(
	timeline.map((t) => t.windowId),
	[100, 101, 100],
	"focus timeline: 100 -> 101 -> 100",
);

// ---- 2. causal consistency: consecutive focus events chain via previous ----
const chain = timeline.map(
	(t, i) => i === 0 || t.previous === timeline[i - 1].windowId,
);
assert.ok(
	chain.every(Boolean),
	"previousWindowId of each focus = window just departed (causal chain)",
);

// ---- 3. Phase 1 telemetry cannot express focus state ----
// Prove it against the REAL transport: run every Phase 1 type through
// encodeEvent -> decodeEvent (the same path background.ts drains). The
// normalizer decodes previousWindowId ONLY for SW_WINDOW_FOCUS (buffer.ts),
// so no Phase 1 event can survive the transport with a focus/predecessor
// field — the info is new, not duplicated (Phase 2 principle #4).
import { decodeEvent, encodeEvent } from "../events/buffer";

const PHASE1_TYPES: TabEventType[] = [
	"TAB_CREATED",
	"TAB_ACTIVATED",
	"TAB_UPDATED",
	"TAB_REMOVED",
	"NAVIGATION",
	"PAGE_VISIBLE",
	"PAGE_HIDDEN",
	"SCROLL",
	"CLICK",
	"KEY_ACTIVITY",
];
const FOCUSLIKE_KEYS = ["previousWindowId", "focus", "focusedWindowId"];
for (const t of PHASE1_TYPES) {
	const probe = new Int32Array(8 * 2); // room for 2 slots
	const before = {
		type: t,
		tabId: 1,
		windowId: 100,
		timestamp: T0,
		metadata: {
			previousWindowId: 7,
		} as StoredTabEvent["metadata"],
	};
	const slot = 0;
	encodeEvent(probe, slot, before);
	const after = decodeEvent(probe, slot);
	const metaKeys = Object.keys(after.metadata ?? {});
	assert.ok(
		!FOCUSLIKE_KEYS.some((k) => metaKeys.includes(k)),
		`${t} round-trips WITHOUT a focus/predecessor field`,
	);
}

// ---- 4. per-signal decision audit ----
line("");
line("DECISION AUDIT (what becomes better if this signal exists):");
const audits: Array<[string, string, string]> = [
	[
		"SW_WINDOW_FOCUS",
		"contextual",
		"browser-state continuity: focus timeline (window + causal predecessor) — input for boundary/causation evidence at the graph layer (Step 10)",
	],
	[
		"SW_TRACKING_TOGGLE",
		"diagnostic",
		"RETIRED: meta telemetry about Tabot itself, not browsing; no derived-layer consumer; tracking state still held internally, never persisted as behavior",
	],
	[
		"SW_POPUP_OPEN",
		"diagnostic",
		"RETIRED: extension UI activity; polling must not inflate event counts",
	],
	["SW_DOWNLOAD", "diagnostic", "RETIRED: no demonstrated behavioral value"],
	[
		"SW_LIFECYCLE",
		"diagnostic",
		"diagnostic: engineering-only, invisible to derivation",
	],
];
for (const [name, semantic, decision] of audits) {
	assert.equal(
		classifySemantic(name as TabEventType),
		semantic,
		`${name} stays ${semantic}`,
	);
	line(`  ${name.padEnd(20)} ${semantic.padEnd(11)} ${decision}`);
}

line("");
line("SELECTION: SW_WINDOW_FOCUS = first high-value signal.");
line(
	"  It is the ONLY signal whose payload (focus window + causal predecessor)",
);
line("  is new information Phase 1 cannot express. Its derivation consumer");
line("  (boundary/causation evidence) is the graph layer — Step 10.");
line("  Honest boundary: the current pipeline is SW-invariant (Step 8); this");
line("  check proves the INFORMATION GAP, not a current delta. The gap is the");
line("  prerequisite — a signal with no new info can never add value.");

console.log(lines.join("\n"));

logger.info("sw-first-signal.check: all assertions passed ✔");
