// packages/shared/src/checks/sw-semantics.check.ts
// Phase 2 — FINAL: meaningful-event semantics for SW telemetry.
//
// Proves the final reduced-taxonomy invariants:
//  1. SW_WINDOW_FOCUS is the ONLY contextual SW signal (continuity evidence).
//  2. Every retired SW type (popup/toggle/download/lifecycle) is classified
//     `diagnostic` — invisible to sessions, anchors, graph, episodes,
//     contexts, memories. Historical rows of these types are harmless.
//  3. No SW signal creates session boundaries; a focus-only burst yields
//     zero sessions.
//
// Also: SW events carry no url → they form no transition in deriveTransitions,
// and diagnostic events never reach the meaningful stream.
//
// Run: node --import ./resolve-hook.mjs src/checks/sw-semantics.check.ts

import assert from "node:assert/strict";
import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events";
import { classifySemantic, isBehavioral } from "../activities/sw-semantics";
import type { StoredTabEvent } from "../events/db";
import type { TabEventType } from "../events/events";
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

// A representative trace: one session split by a 6-min internal gap, with
// windows 100 → 101 (so window-switch and window-focus logic both exercise).
const trace = (): StoredTabEvent[] => [
	ev(T0, "NAVIGATION", 1, 100, "https://docs.google.com/document"),
	ev(T0 + 4 * MIN, "SCROLL", 1, 100, "https://docs.google.com/document", {
		scrollY: 1200,
	}),
	ev(T0 + 12 * MIN, "NAVIGATION", 2, 101, "https://github.com/org/repo"),
	ev(T0 + 16 * MIN, "SCROLL", 2, 101, "https://github.com/org/repo", {
		scrollY: 400,
	}),
];

// A dense burst of SW_LIFECYCLE noise of every kind + windowId, as the real
// extension would emit (installed/startup/suspend/suspendCanceled map to
// windowId 0/1/2/3 — small numbers that collide with nothing but DO create
// window-switch boundaries when left in the raw stream).
const lifecycleNoise = (): StoredTabEvent[] => [
	ev(T0 + 1 * MIN, "SW_LIFECYCLE", 0, 0, undefined, { lifecycle: "installed" }),
	ev(T0 + 2 * MIN, "SW_LIFECYCLE", 0, 1, undefined, { lifecycle: "startup" }),
	ev(T0 + 3 * MIN, "SW_LIFECYCLE", 0, 2, undefined, { lifecycle: "suspend" }),
	ev(T0 + 5 * MIN, "SW_LIFECYCLE", 0, 3, undefined, {
		lifecycle: "suspendCanceled",
	}),
	ev(T0 + 8 * MIN, "SW_LIFECYCLE", 0, 2, undefined, { lifecycle: "suspend" }),
	ev(T0 + 14 * MIN, "SW_LIFECYCLE", 0, 1, undefined, { lifecycle: "startup" }),
];

// A realistic drip of SW_WINDOW_FOCUS across windows (previousWindowId set),
// interleaved close in time like real capture (5s silence gate).
const focusDrip = (): StoredTabEvent[] => [
	ev(T0 + 7 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 11 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
];

const countSessions = (events: StoredTabEvent[]) => sessionize(events).length;

// ---- 1. classification is fixed and exhaustive over the SW vocabulary ----
{
	const swTypes: TabEventType[] = [
		"SW_WINDOW_FOCUS",
		"SW_POPUP_OPEN",
		"SW_TRACKING_TOGGLE",
		"SW_DOWNLOAD",
		"SW_LIFECYCLE",
	];
	const expect: Partial<Record<TabEventType, string>> = {
		SW_WINDOW_FOCUS: "contextual",
		SW_POPUP_OPEN: "diagnostic",
		SW_TRACKING_TOGGLE: "diagnostic",
		SW_DOWNLOAD: "diagnostic",
		SW_LIFECYCLE: "diagnostic",
	};
	for (const t of swTypes) {
		assert.equal(
			classifySemantic(t),
			expect[t],
			`${t} classified as ${expect[t]}`,
		);
	}
	// behavioral guard used by downstream
	assert.equal(isBehavioral("SW_TRACKING_TOGGLE"), false);
	assert.equal(isBehavioral("SW_WINDOW_FOCUS"), false);
}

// ---- 2. THE Step 7 invariant: lifecycle noise must NOT fragment sessions ----
{
	const base = countSessions(trace());
	const withNoise = countSessions([...trace(), ...lifecycleNoise()]);
	assert.equal(base, 2, "baseline trace has 2 sessions (one internal gap)");
	assert.equal(
		withNoise,
		base,
		"SW_LIFECYCLE noise does not add sessions (diagnostic = invisible)",
	);
	// and the boundaries themselves are identical (same start/end timestamps)
	const baseIds = sessionize(trace()).map((s) => s.id);
	const noisyIds = sessionize([...trace(), ...lifecycleNoise()]).map(
		(s) => s.id,
	);
	assert.deepEqual(
		noisyIds,
		baseIds,
		"session identity/boundaries unchanged under lifecycle noise",
	);
}

// ---- 3. contextual continuity (SW_WINDOW_FOCUS) is NOT session authority -------
// Step 10 correction (real-trace observer): a focus regain after long silence
// is browser focus state, not proof the same task resumed. Focus is CONTEXT,
// never session authority — it cannot reset the inactivity timer, bridge a
// gap, open a session, or merge two sessions. Session continuity belongs to
// behavioral telemetry only. Focus causality survives as GRAPH edge evidence
// (applyFocusContinuity), never as a session decision.
{
	const base = countSessions(trace());
	const withFocus = countSessions([...trace(), ...focusDrip()]);
	assert.equal(
		withFocus,
		base,
		"SW_WINDOW_FOCUS changes NO session boundary (no bridge, no split)",
	);
	assert.equal(
		countSessions(focusDrip()),
		0,
		"focus-only burst creates no session (focus is not activity)",
	);
}

// ---- 4. diagnostic events never enter the meaningful stream ----
{
	const rows = [...trace(), ...lifecycleNoise()];
	const meaningful = deriveMeaningfulEvents(rows);
	const got = meaningful.map((m) => m.type);
	assert.ok(
		!got.includes("SW_LIFECYCLE"),
		"SW_LIFECYCLE excluded from meaningful events",
	);
	// SW_WINDOW_FOCUS passes through the meaningful stream (contextual), but
	// carries no url → deriveTransitions forms NO transition from it.
	const transitions = deriveTransitions(meaningful);
	assert.ok(
		!transitions.some((t) => t.fromTabId === 0 || t.toTabId === 0),
		"no transition originates from a tabId-0 SW event",
	);
}

// ---- 5. retired SW signals NEVER reach the meaningful stream ----
// Test B + D: popup polling, tracking toggles, downloads, and lifecycle rows
// (including HISTORICAL persisted ones) produce zero behavioral events and
// zero sessions — they are diagnostic, invisible to derivation.
{
	const retired = [
		ev(T0 + 20 * MIN, "SW_TRACKING_TOGGLE", 0, 1),
		ev(T0 + 21 * MIN, "SW_POPUP_OPEN", 0, 0, undefined, {
			source: "popup",
		}),
		ev(T0 + 22 * MIN, "SW_DOWNLOAD", 1, 0, undefined, { state: 2 }),
		ev(T0 + 23 * MIN, "SW_LIFECYCLE", 0, 2, undefined, {
			lifecycle: "suspend",
		}),
	];
	const meaningful = deriveMeaningfulEvents(retired);
	assert.equal(meaningful.length, 0, "retired SW types: 0 meaningful events");
	assert.equal(
		countSessions(retired),
		0,
		"retired SW types: 0 sessions (popup polling creates no session)",
	);
	// and interleaved with a real trace they change nothing
	const withRetired = countSessions([...trace(), ...retired]);
	assert.equal(withRetired, 2, "retired SW rows leave real sessions unchanged");
}

logger.info("sw-semantics.check: all assertions passed ✔");
