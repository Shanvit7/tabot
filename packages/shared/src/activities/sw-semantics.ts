// packages/shared/src/activities/sw-semantics.ts
// Phase 2 — FINAL: semantic classification of Service Worker events.
//
// A SW event's raw type is a Chrome signal, not a behavioral label. Before a
// SW event touches behavioral derivation (sessions, transitions, contexts,
// memories) it must be classified so diagnostic/noise events can't masquerade
// as behavior. One classifier, shared by sessionize and deriveMeaningfulEvents
// so both agree on the same boundary.
//
// FINAL production taxonomy (KEEP WITH REDUCTION): SW_WINDOW_FOCUS is the
// ONLY analytically relevant SW signal. Every other Phase 2 SW type
// (SW_POPUP_OPEN, SW_TRACKING_TOGGLE, SW_DOWNLOAD, SW_LIFECYCLE) is retired:
// classified `diagnostic` so it is invisible to every behavioral layer
// (sessions, anchors, graph, episodes, contexts, memories). Historical rows of
// these types in persisted data remain deterministic — they decode, then are
// ignored by derivation.
//
//   contextual   browser/extension state that may inform CONTINUITY evidence
//                at the graph layer, never a session boundary or a
//                behavioral transition (SW_WINDOW_FOCUS only)
//   diagnostic   excluded from behavioral derivation entirely (every other
//                SW type — popup UI noise, meta telemetry, downloads,
//                worker lifecycle)

import type { TabEventType } from "../events/events";

export type SwSemantic = "behavioral" | "contextual" | "diagnostic";

// ponytail: the classification is a fixed lookup, not a policy engine. It is
// deliberately small and reviewable — each SW type is one labeled row. Extend
// here only, never with per-event branching downstream.
const SEMANTICS: Record<TabEventType, SwSemantic> = {
	TAB_CREATED: "contextual",
	TAB_ACTIVATED: "contextual",
	TAB_UPDATED: "contextual",
	TAB_REMOVED: "contextual",
	NAVIGATION: "behavioral",
	PAGE_VISIBLE: "contextual",
	PAGE_HIDDEN: "contextual",
	SCROLL: "contextual",
	CLICK: "behavioral",
	KEY_ACTIVITY: "behavioral",
	// --- SW telemetry (Phase 2, FINAL) ---
	SW_WINDOW_FOCUS: "contextual", // ONLY analytical SW signal: cross-window
	// continuity evidence at the graph layer. Never a session boundary.
	// --- retired Phase 2 signals: diagnostic = invisible to all derivation ---
	SW_POPUP_OPEN: "diagnostic", // extension UI activity (popup polling), not browsing
	SW_TRACKING_TOGGLE: "diagnostic", // meta telemetry about Tabot itself
	SW_DOWNLOAD: "diagnostic", // no demonstrated behavioral value
	SW_LIFECYCLE: "diagnostic", // worker lifecycle — engineering only
};

// ponytail: non-SW types carry no Phase-2 semantics; callers that only care
// about SW events don't need to special-case the rest.
export const classifySemantic = (type: TabEventType): SwSemantic =>
	SEMANTICS[type] ?? "contextual";

// A diagnostic SW event is invisible to behavioral derivation: it must not
// create a session boundary, a transition, or a context. This is the guard
// that stops SW_LIFECYCLE noise from fragmenting sessions (Step 7).
export const isDiagnostic = (type: TabEventType): boolean =>
	classifySemantic(type) === "diagnostic";

export const isBehavioral = (type: TabEventType): boolean =>
	classifySemantic(type) === "behavioral";
