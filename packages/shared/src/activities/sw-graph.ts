// packages/shared/src/activities/sw-graph.ts
// Phase 2 — Step 10: SW-derived evidence into the activity graph.
//
// Step 9 selected SW_WINDOW_FOCUS as the first high-value signal: it carries a
// focus timeline (which window is frontmost + the CAUSAL predecessor) that
// Phase 1 telemetry cannot express. Step 10's job is to get that evidence ONTO
// the graph — without letting SW events become graph nodes and without letting
// them fabricate relationships.
//
// The rule, per spec §10 (as corrected by the Step-10 real-trace observer):
//   - SW events NEVER become nodes. The graph keeps representing activity
//     trajectories; SW evidence only decorates edges BETWEEN real anchors.
//   - ONLY SW_WINDOW_FOCUS produces graph evidence (focus-continuity). The
//     other four signals carry no structure (Step 9 audit) — no edges.
//   - focus-continuity evidence is attached ONLY to an EXISTING same-session,
//     same-window edge. It can never create an edge (a relationship the
//     trajectory did not earn stays absent) and never creates an episode (the
//     episode layer has no consumer for it until Step 11).
//   - The evidence is a CAUSAL focus sandwich: the focus stream shows the user
//     left window w (departure to a different real window) and returned to w
//     (previousWindowId chains back to the departure) while the same window's
//     trajectory continued across the excursion. Phase 1 sees only the tab
//     events on either side — it does not know the gap between two anchors
//     was a glance at another window, not lost attention.
//   - Corroboration is REQUIRED: the anchors on both sides of the sandwich
//     are real behavioral activity (activity before + focus + activity after),
//     and the excursion must be between two DIFFERENT real windows — a
//     w -> -1 -> w chain (browser focus loss/regain) is never evidence.
//
// Weight/decay of the evidence are inherited from the host edge by design:
// focus-continuity strengthens an EXISTING relationship, it does not create a
// new temporal object. Step 11 consumes it at the episode layer.
//
// Pure derivation: graph + raw events in, evidence decorated in place. No
// persistence, no new telemetry.

import type Graph from "graphology";
import type { StoredTabEvent } from "../events/db";
import type { ActivityAnchor, RelationshipEdge } from "./activity-graph";

// Evidence string appended to an edge's evidence[] when the focus stream shows
// a closed excursion inside the anchor span (see applyFocusContinuity).
export const FOCUS_CONTINUITY_EVIDENCE = "focus-continuity";

export interface FocusObservation {
	ts: number;
	windowId: number; // window the user is now looking at
	previousWindowId: number; // window departed — the causal predecessor
}

// SW_WINDOW_FOCUS rows -> sorted focus timeline. -1 = no predecessor (first
// observation of this capture). Sidecar only; the raw event stays the source
// of truth.
export const focusStream = (events: StoredTabEvent[]): FocusObservation[] =>
	events
		.filter((e) => e.type === "SW_WINDOW_FOCUS")
		.map((e) => ({
			ts: e.timestamp,
			windowId: e.windowId,
			previousWindowId: e.metadata?.previousWindowId ?? -1,
		}))
		.sort((a, b) => a.ts - b.ts);

// Decorate existing edges with focus-continuity evidence. Returns the number
// of edges strengthened. Node set and edge set are NEVER modified.
//
// For every pair of consecutive anchors (chronological) in the SAME session
// and SAME window w, find the last focus RETURN to w before the second anchor
// starts: a focus event on w whose previousWindowId is a different window.
// The return is a closed excursion only when the focus event immediately
// before it chains back (previousWindowId === its windowId — the causal chain
// Step 9 verified survives the real transport) and that departure happened
// no earlier than the first anchor started. Then the trajectory A -> B on
// window w continued THROUGH a glance at another window — browser-state
// continuity Phase 1 cannot see.
export const applyFocusContinuity = (
	graph: Graph<ActivityAnchor, RelationshipEdge>,
	events: StoredTabEvent[],
): number => {
	const focus = focusStream(events);
	if (focus.length === 0) return 0;

	const anchors: ActivityAnchor[] = [];
	graph.forEachNode((_id, attr) => {
		anchors.push(attr as ActivityAnchor);
	});
	anchors.sort((a, b) => a.startAt - b.startAt);

	// ponytail: single backward pass over the sorted focus timeline per pair;
	// anchor pairs are O(N) and the focus scan is O(F) — bounded, no index
	// structure needed at protected volume (F ~ 1k/step-6 trace).
	let strengthened = 0;
	for (let i = 0; i < anchors.length - 1; i++) {
		const a = anchors[i];
		const b = anchors[i + 1];
		// evidence strengthens only an EXISTING same-session, same-window
		// trajectory edge; it never creates or rescues one (spec §10).
		if (a.sessionId !== b.sessionId) continue;
		if (a.windowId === 0 || a.windowId !== b.windowId) continue;
		if (!graph.hasEdge(a.id, b.id)) continue;
		const w = a.windowId;

		// last focus return to w at or before the second anchor's start — a
		// REAL cross-window excursion only: previousWindowId must be a
		// different real window, never -1 (WINDOW_ID_NONE). A w -> -1 -> w
		// chain is the browser losing and regaining OS/app focus, not the user
		// leaving w for another window — focus state, not user intent (Step 10
		// correction).
		let r = -1;
		for (let k = focus.length - 1; k >= 0; k--) {
			const f = focus[k];
			if (f.ts > b.startAt) continue;
			if (f.ts < a.startAt) break; // nothing newer matches — stop scanning
			if (
				f.windowId === w &&
				f.previousWindowId !== w &&
				f.previousWindowId !== -1
			) {
				r = k;
				break;
			}
		}
		if (r < 1) continue;
		const departure = focus[r - 1];
		if (departure.ts < a.startAt) continue; // excursion predates the pair
		if (departure.windowId !== focus[r].previousWindowId) continue; // broken chain
		// departure on the SAME window would mean no excursion; implied by the
		// chain check (previousWindowId !== w) but asserted for clarity.
		if (departure.windowId === w) continue;

		const edge = graph.edge(a.id, b.id);
		const attrs = graph.getEdgeAttributes(edge) as RelationshipEdge;
		if (attrs.evidence.includes(FOCUS_CONTINUITY_EVIDENCE)) continue;
		attrs.evidence.push(FOCUS_CONTINUITY_EVIDENCE);
		graph.setEdgeAttribute(edge, "evidence", attrs.evidence);
		strengthened++;
	}
	return strengthened;
};
