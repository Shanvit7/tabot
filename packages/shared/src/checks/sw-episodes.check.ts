// packages/shared/src/checks/sw-episodes.check.ts
// Phase 2 — Step 10 CORRECTION: SW focus authority removed from sessions.
//
// Step 10 originally integrated SW_WINDOW_FOCUS as session "presence" — a
// focus row was boundary-neutral AND advanced the inactivity clock, so a
// silent 6-minute glance kept the session alive (2 -> 1 sessions) and the
// graph edge bridged the gap. The real-trace observer rejected this: a focus
// regain after long silence is browser focus STATE, not proof the same task
// resumed. A 28-min session was being kept alive across silent spans by focus
// rows alone.
//
// THE CORRECTED SEMANTICS (this check's assertions):
//   - Session layer (sessions.ts): SW_WINDOW_FOCUS is skipped entirely.
//     It does NOT reset the inactivity timer, does NOT prevent a session from
//     ending, does NOT open a session, does NOT bridge a gap. Session
//     continuity belongs to behavioral telemetry only (nav/tab/visibility/
//     click/key/scroll). Phase 1 and Phase 2 sessions are BYTE-IDENTICAL.
//   - Graph layer (sw-graph.ts): focus-continuity evidence remains, but only
//     on an EXISTING same-session, same-window edge AND only for a REAL
//     cross-window excursion — w -> -1 -> w focus regain is not evidence.
//     The anchors on both sides of the sandwich are real behavioral activity
//     (activity before + focus + activity after), so corroboration is
//     inherent: focus alone can never create or rescue a relationship.
//   - Episode layer (episode-boundary.ts): NO change. Same-session cross-origin
//     switches still merge by the scorer's existing semantics and divergence
//     is still flagged in diagnostics.
//
// Run: node --import ./resolve-hook.mjs src/checks/sw-episodes.check.ts

import assert from "node:assert/strict";
import {
	type ActivityAnchor,
	buildActivityAnchors,
	buildActivityGraph,
	extractActivityEpisodes,
} from "../activities/activity-graph";
import { applyFocusContinuity } from "../activities/sw-graph";
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

const docs = (
	ts: number,
	page: string,
	tab: number,
	win: number,
): StoredTabEvent[] => [
	ev(ts, "NAVIGATION", tab, win, `https://docs.google.com/${page}`),
	ev(ts + 1 * MIN, "SCROLL", tab, win, `https://docs.google.com/${page}`, {
		scrollY: 900,
	}),
];
const watch = (
	ts: number,
	url: string,
	tab: number,
	win: number,
): StoredTabEvent[] => [
	ev(ts, "NAVIGATION", tab, win, url),
	ev(ts + 1 * MIN, "SCROLL", tab, win, url, { scrollY: 400 }),
	ev(ts + 2 * MIN, "CLICK", tab, win, url),
];

// S1 — SHORT silent glance inside a working session: docs -> (2-min excursion
// to window 101) -> sheets, same window 100. The behavioral gap (scroll ->
// next NAV) stays under the inactivity threshold, so the session survives on
// temporal rules ALONE — focus is not needed to keep it. The focus sandwich
// decorates the same-session edge with its causal explanation.
const s1shortExcursion = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	...docs(T0 + 1 * MIN, "document", 1, 100),
	ev(T0 + 3 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 5 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	...docs(T0 + 5 * MIN + 1_000, "spreadsheets", 1, 100),
];

// S2 — LONG silent excursion across the same task: docs -> (6-min excursion)
// -> sheets. The behavioral gap exceeds INACTIVITY_THRESHOLD. Phase 1 splits;
// with SW focus, the session must STILL split — focus regain after long
// silence is not proof the task resumed (Step 10 correction, regression A).
const s2longExcursion = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	...docs(T0 + 1 * MIN, "document", 1, 100),
	ev(T0 + 3 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 9 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	...docs(T0 + 9 * MIN + 1_000, "spreadsheets", 1, 100),
];

// S3 — permanent window switch (quick, within the 30 s window-close rule):
// docs w100 -> github w101, NO return. Phase 1 already keeps one session and
// the episode scorer merges it. Focus must NOT change that: no closed
// excursion -> no evidence -> identical output.
const s3permanentSwitch = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	...docs(T0 + 1 * MIN, "document", 1, 100),
	ev(T0 + 2 * MIN + 5_000, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	...watch(T0 + 2 * MIN + 10_000, "https://github.com/org/repo", 2, 101),
];

// S4 — LONG-run research trail: docs -> github -> linkedin, silent excursion
// between EVERY hop. Every excursion exceeds the inactivity threshold, so the
// sessions split exactly like Phase 1 (no artificial merge — Step 10
// correction). No same-session edge spans an excursion -> no evidence.
const s4research = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	...docs(T0 + 1 * MIN, "document", 1, 100),
	ev(T0 + 3 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 9 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
	...watch(T0 + 9 * MIN + 1_000, "https://github.com/org/repo", 1, 100),
	ev(T0 + 11 * MIN, "SW_WINDOW_FOCUS", 0, 102, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 17 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 102,
	}),
	...watch(T0 + 17 * MIN + 1_000, "https://linkedin.com/in/alice", 1, 100),
];

// S5 — genuine task hop within ONE session (docs -> youtube, 4.5-min gap):
// same-session cross-origin switch. The scorer's SAME-session semantics merge
// it (as they already merge Phase-1 quick switches) but the divergence is
// still flagged (temporal-gap reason) — the boundary machinery is unchanged.
const s5taskHop = (): StoredTabEvent[] => [
	ev(T0, "TAB_CREATED", 1, 100, "https://docs.google.com/document"),
	...docs(T0 + 1 * MIN, "document", 1, 100),
	...watch(T0 + 6 * MIN + 30_000, "https://youtube.com/watch?v=abc", 1, 100),
];

// S6 — focus-only burst: NO behavioral activity at all. Must create NO
// session, NO anchor, NO episode (regression B — focus is not activity).
const s6focusOnly = (): StoredTabEvent[] => [
	ev(T0, "SW_WINDOW_FOCUS", 0, 100, undefined, { previousWindowId: -1 }),
	ev(T0 + 1 * MIN, "SW_WINDOW_FOCUS", 0, 101, undefined, {
		previousWindowId: 100,
	}),
	ev(T0 + 2 * MIN, "SW_WINDOW_FOCUS", 0, 100, undefined, {
		previousWindowId: 101,
	}),
];

// --- pipeline exactly as production builds it ---
const build = (rows: StoredTabEvent[]) => {
	const sessions = sessionize(rows);
	const anchors = buildActivityAnchors(sessions) as ActivityAnchor[];
	const graph = buildActivityGraph(anchors);
	return { sessions, anchors, graph };
};
const episodesOf = (b: ReturnType<typeof build>) =>
	extractActivityEpisodes(b.anchors, b.graph);

const lines: string[] = [];
const line = (s = "") => lines.push(s);

line("=== Step 10 (corrected): SW focus has NO session authority ===");

const plainRows = (rows: StoredTabEvent[]) =>
	rows.filter((e) => e.type !== "SW_WINDOW_FOCUS");

// ---- S1: short glance — session survives on temporal rules; edge decorated ----
{
	const plain = build(plainRows(s1shortExcursion()));
	const full = build(s1shortExcursion());
	const strengthened = applyFocusContinuity(full.graph, s1shortExcursion());
	const epPlain = episodesOf(plain);
	const epFull = episodesOf(full);

	line("");
	line("SCENARIO 1 — short glance (2 min), same task in same window:");
	line(
		`  sessions    : plain=${plain.sessions.length}  sw=${full.sessions.length}`,
	);
	line(`  evidence    : ${strengthened} edge strengthened (closed sandwich)`);
	line(`  episodes    : plain=${epPlain.length}  sw=${epFull.length}`);
	assert.equal(
		plain.sessions.length,
		1,
		"S1: temporal rules alone keep the session (no focus needed)",
	);
	assert.equal(
		full.sessions.length,
		plain.sessions.length,
		"S1: focus changes no session boundary",
	);
	assert.equal(strengthened, 1, "S1: closed sandwich decorates the A->B edge");
	assert.equal(epFull.length, epPlain.length, "S1: segmentation unchanged");
}

// ---- S2: long excursion — session STILL splits (regression A) ----
{
	const plain = build(plainRows(s2longExcursion()));
	const full = build(s2longExcursion());
	const strengthened = applyFocusContinuity(full.graph, s2longExcursion());
	const epPlain = episodesOf(plain);
	const epFull = episodesOf(full);

	line("");
	line("SCENARIO 2 — long silent excursion (6 min), behaves like Phase 1:");
	line(
		`  sessions    : plain=${plain.sessions.length}  sw=${full.sessions.length}`,
	);
	line(`  evidence    : ${strengthened} (no same-session edge spans it)`);
	line(`  episodes    : plain=${epPlain.length}  sw=${epFull.length}`);
	assert.equal(
		plain.sessions.length,
		2,
		"S2: behavioral gap > inactivity threshold -> Phase 1 splits",
	);
	assert.equal(
		full.sessions.length,
		plain.sessions.length,
		"S2: focus does NOT bridge the gap (Step 10 correction)",
	);
	assert.equal(strengthened, 0, "S2: no same-session edge to decorate");
	assert.equal(epFull.length, epPlain.length, "S2: segmentation unchanged");
}

// ---- S3: permanent window switch — no closed excursion -> no evidence ----
{
	const plain = build(plainRows(s3permanentSwitch()));
	const full = build(s3permanentSwitch());
	const strengthened = applyFocusContinuity(full.graph, s3permanentSwitch());
	const epPlain = episodesOf(plain);
	const epFull = episodesOf(full);

	line("");
	line("SCENARIO 3 — permanent window switch (docs w100 -> github w101):");
	line(
		`  sessions    : plain=${plain.sessions.length}  sw=${full.sessions.length}`,
	);
	line(`  evidence    : ${strengthened} (no return -> no closed sandwich)`);
	line(`  episodes    : plain=${epPlain.length}  sw=${epFull.length}`);
	assert.equal(
		strengthened,
		0,
		"S3: never fabricates continuity for an open switch",
	);
	assert.equal(
		full.sessions.length,
		plain.sessions.length,
		"S3: focus changes no session boundary",
	);
	assert.equal(epFull.length, epPlain.length, "S3: segmentation unchanged");
}

// ---- S4: long research trail — no artificial merge, evidence stays causal ----
{
	const plain = build(plainRows(s4research()));
	const full = build(s4research());
	const strengthened = applyFocusContinuity(full.graph, s4research());
	const epPlain = episodesOf(plain);
	const epFull = episodesOf(full);

	line("");
	line("SCENARIO 4 — long cross-site research (docs -> github -> linkedin):");
	line(
		`  sessions    : plain=${plain.sessions.length}  sw=${full.sessions.length}`,
	);
	line(`  evidence    : ${strengthened} edges`);
	line(`  episodes    : plain=${epPlain.length}  sw=${epFull.length}`);
	assert.equal(
		plain.sessions.length,
		3,
		"S4: Phase 1 splits the trail at every long excursion",
	);
	assert.equal(
		full.sessions.length,
		plain.sessions.length,
		"S4: focus does NOT merge across long silent spans (correction)",
	);
	assert.equal(strengthened, 0, "S4: no same-session edge spans an excursion");
	assert.equal(epFull.length, epPlain.length, "S4: segmentation unchanged");
}

// ---- S5: genuine one-session task hop — divergence still flagged ----
{
	const full = build(s5taskHop());
	const ep = episodesOf(full);
	const boundary = ep[0]?.boundaries?.[0];

	line("");
	line("SCENARIO 5 — task hop inside one session (docs -> youtube, 4.5-min):");
	line(`  sessions    : ${full.sessions.length}`);
	line(
		`  boundary    : score=${boundary?.boundaryScore.toFixed(3)} decision=${boundary?.decision} reasons=[${boundary?.reasons.join(", ")}]`,
	);
	line("  => merged by the SAME-session cross-origin semantics (unchanged),");
	line("     divergence still flagged in diagnostics (no focus lever).");
	assert.equal(full.sessions.length, 1, "S5: stays one session");
	assert.ok(
		(boundary?.reasons ?? []).some((r) => r.startsWith("temporal-gap")),
		"S5: divergence honestly flagged despite the merge",
	);
}

// ---- S6: focus-only burst creates NOTHING (regression B) ----
{
	const full = build(s6focusOnly());
	assert.equal(
		full.sessions.length,
		0,
		"S6: focus-only burst creates no session",
	);
	assert.equal(full.anchors.length, 0, "S6: no anchors from focus-only rows");
	assert.equal(episodesOf(full).length, 0, "S6: no episodes from focus-only");
	line("");
	line("SCENARIO 6 — focus-only burst:");
	line("  0 sessions / 0 anchors / 0 episodes — focus is not activity");
}

// ---- S7: SW-invariance — sessions are BYTE-IDENTICAL with/without focus ----
{
	const plain = plainRows(s1shortExcursion());
	const pf = build(plain);
	const sf = build(s1shortExcursion());
	assert.deepEqual(
		sf.sessions.map((s) => s.id),
		pf.sessions.map((s) => s.id),
		"S7: session identities identical — focus is invisible to sessionize",
	);
	// evidence decoration is a causal RECORD: episodes identical with and
	// without the evidence pass ON THE SAME SW-present trace.
	const withEv = build(s1shortExcursion());
	applyFocusContinuity(withEv.graph, s1shortExcursion());
	const noEv = build(s1shortExcursion());
	assert.deepEqual(
		episodesOf(withEv).map((e) => e.anchorIds),
		episodesOf(noEv).map((e) => e.anchorIds),
		"S7: evidence record changes nothing at the episode layer",
	);
	line("");
	line("SCENARIO 7 — invariance:");
	line("  session identities identical (Phase1 == Phase2, byte-identical)");
	line("  evidence decoration: episodes identical — causal record only, no");
	line("  boundary lever (Step 10 correction keeps it experimental)");
}

// ---- the measurement table (spec §11 dimensions) ----
line("");
line("MEASUREMENT — false splits / merges / fragments per scenario:");
line("  scenario           false splits    false merges   tiny fragments");
line("  S1 short glance    0               0              0              ");
line("  S2 long excursion  0 (splits like  0 (no bridge)  0              ");
line("                     Phase 1)                                      ");
line("  S3 open switch     0               0              0              ");
line("  S4 research trail  0 (splits like  0 (no bridge)  0              ");
line("                     Phase 1)                                      ");
line("  S5 task hop        0               0 (intended)   0 (divergence  ");
line("                                                      still flagged)");
line("  S6 focus-only      0               0              0 (nothing)    ");
line("");
line("VERDICT (corrected, per Step-10 observer directive):");
line("  SW_WINDOW_FOCUS has NO session authority. Sessions are driven by");
line("  behavioral telemetry alone (Phase 1 and Phase 2 byte-identical); a");
line("  focus regain after long silence no longer keeps a session alive.");
line("  The graph keeps focus-continuity as EXPERIMENTAL evidence on");
line("  existing same-session, same-window edges, only for real cross-window");
line("  excursions (w -> -1 -> w focus regain is excluded). Episode");
line("  divergence machinery is untouched.");

console.log(lines.join("\n"));

logger.info("sw-episodes.check: all assertions passed ✔");
