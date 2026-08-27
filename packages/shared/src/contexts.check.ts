// packages/shared/src/contexts.check.ts
// Runnable self-check for buildContexts() — covers docs/tech.md §8.1 scenarios,
// phase 3 relationship-aware merging (steps 6-8), and rebuild consistency.
// Run: node packages/shared/src/contexts.check.ts  (Node 24+ strips types natively)

import assert from "node:assert/strict";
import {
	type BrowserContext,
	buildContexts,
	CONTEXT_THRESHOLDS,
} from "./contexts.ts";
import { logger } from "./logger.ts";
import type { ActivityRef, ActivityTransition } from "./meaningful-events.ts";
import type { Session } from "./sessions.ts";

const MIN = 60_000;
const T0 = Date.now() - 24 * 60 * MIN;

// Session factory — buildContexts consumes start/end, domains[], ids, tabs[], intensity counters
const session = (
	id: string,
	start: number,
	end: number,
	domainEvents: Array<[string, number]>,
	overrides: Partial<Session> = {},
): Session => ({
	id,
	startTimestamp: start,
	endTimestamp: end,
	duration: end - start,
	eventCount: 10,
	tabs: [
		{
			tabId: 1,
			eventCount: 10,
			firstSeen: start,
			lastSeen: end,
			isActive: true,
		},
	],
	domains: domainEvents.map(([domain, eventCount], i) => ({
		domain,
		eventCount,
		sessionCount: 1,
		sessionIds: [id],
		tabIds: [],
		firstSeen: start + i,
		lastSeen: end,
	})),
	interactionCount: 3,
	navigationCount: 1,
	tabSwitchCount: 1,
	eventSequence: [],
	activeTabId: 1,
	activeWindowId: 1,
	...overrides,
});

// Transition factory — phase 3 evidence. toTs is the timestamp of the to-event
// (inside session b), fromTs the from-event (inside session a, at its tail).
const ref = (url: string): ActivityRef => {
	const u = new URL(url);
	return { origin: u.origin, pathname: u.pathname, exactUrl: url };
};
const trans = (
	from: string,
	to: string,
	toTs: number,
	fromTs = toTs - 1000,
	fromTabId = 1,
	toTabId = 1,
): ActivityTransition => ({
	from: ref(from),
	to: ref(to),
	fromTabId,
	toTabId,
	count: 1,
	firstAt: toTs,
	lastAt: toTs,
	gapsMs: [toTs - fromTs],
	occurrences: [{ fromTs, toTs, gapMs: toTs - fromTs }],
	tabSwitch: fromTabId !== toTabId,
	returns: false,
});

// 1. Adjacent sessions on GitHub + Slack, same-tab continuity → 1 context
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [
		["github.com", 50],
		["slack.com", 20],
	]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [
		["github.com", 40],
		["slack.com", 10],
	]);
	// same-tab transition github → slack crosses the s1→s2 boundary
	const t = [
		trans(
			"https://github.com/x",
			"https://slack.com/x",
			T0 + 15 * MIN, // to-event at s2 start
			T0 + 10 * MIN, // from-event at s1 end
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		1,
		"scenario 1: adjacent overlapping + same-tab transition → 1 context",
	);
	assert.equal(contexts[0]?.sessionCount, 2, "scenario 1: sessionCount 2");
	assert.equal(contexts[0]?.domains.length, 2, "scenario 1: 2 domains");
	assert.equal(
		contexts[0]?.recurrenceCount,
		2,
		"scenario 1: top domain recurs in 2 sessions",
	);
}

// 2. Adjacent disjoint sessions, no relationship evidence → 2 contexts
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [["youtube.com", 40]]);
	const contexts = buildContexts([s1, s2]);
	assert.equal(contexts.length, 2, "scenario 2: no evidence → 2 contexts");
}

// 3. Same-domain sessions separated by 45 min gap → 2 contexts
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 55 * MIN, T0 + 70 * MIN, [["github.com", 40]]);
	assert.equal(
		buildContexts([s1, s2]).length,
		2,
		"scenario 3: 45min gap → 2 contexts",
	);
}

// 4. Same-domain sessions separated by 15 min gap, same-tab continuity → 1 context
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 25 * MIN, T0 + 40 * MIN, [["github.com", 40]]);
	const t = [
		trans(
			"https://github.com/a",
			"https://github.com/b",
			T0 + 25 * MIN,
			T0 + 10 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		1,
		"scenario 4: same-tab continuity → 1 context",
	);
}

// 5. Morning GitHub work, lunch break, afternoon GitHub work → 2 contexts
{
	const s1 = session("s1", T0, T0 + 20 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 30 * MIN, T0 + 50 * MIN, [["github.com", 40]]);
	const s3 = session("s3", T0 + 4 * 60 * MIN, T0 + 4 * 60 * MIN + 20 * MIN, [
		["github.com", 30],
	]);
	// same-tab continuity merges s1+s2; the lunch gap (>30m) splits s3
	const t = [
		trans(
			"https://github.com/a",
			"https://github.com/b",
			T0 + 30 * MIN,
			T0 + 20 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2, s3], t);
	assert.equal(contexts.length, 2, "scenario 5: lunch gap → 2 contexts");
	assert.equal(contexts[0]?.sessionCount, 2, "scenario 5: morning grouped");
	assert.equal(contexts[1]?.sessionCount, 1, "scenario 5: afternoon separate");
}

// 6. GitHub → YouTube → GitHub continuous, no bridging → 3 contexts
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [["youtube.com", 40]]);
	const s3 = session("s3", T0 + 30 * MIN, T0 + 40 * MIN, [["github.com", 30]]);
	const contexts = buildContexts([s1, s2, s3]);
	// phase 3 §6.2: YouTube does NOT bridge — no transitive merging in V1
	assert.equal(contexts.length, 3, "scenario 6: no bridging → 3 contexts");
	assert.equal(
		contexts[1]?.primaryDomain,
		"youtube.com",
		"scenario 6: middle is YouTube",
	);
}

// 7. Same site across a day, separated by gaps → multiple contexts
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [["github.com", 40]]);
	const s3 = session("s3", T0 + 5 * 60 * MIN, T0 + 5 * 60 * MIN + 10 * MIN, [
		["github.com", 30],
	]);
	const s4 = session(
		"s4",
		T0 + 5 * 60 * MIN + 15 * MIN,
		T0 + 5 * 60 * MIN + 30 * MIN,
		[["github.com", 20]],
	);
	// same-tab continuity merges s1+s2 and s3+s4; the 4h gap splits morning/afternoon
	const t = [
		trans(
			"https://github.com/a",
			"https://github.com/b",
			T0 + 15 * MIN,
			T0 + 10 * MIN,
		),
		trans(
			"https://github.com/c",
			"https://github.com/d",
			T0 + 5 * 60 * MIN + 15 * MIN,
			T0 + 5 * 60 * MIN + 10 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2, s3, s4], t);
	assert.equal(
		contexts.length,
		2,
		"scenario 7: day split by gaps → 2 contexts",
	);
}

// 8. Interleaved: GitHub/Slack, Docs, GitHub/Slack → 3 contexts (no bridging)
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [
		["github.com", 50],
		["slack.com", 20],
	]);
	const s2 = session("s2", T0 + 20 * MIN, T0 + 30 * MIN, [
		["docs.google.com", 40],
	]);
	const s3 = session("s3", T0 + 40 * MIN, T0 + 50 * MIN, [
		["github.com", 30],
		["slack.com", 10],
	]);
	const contexts = buildContexts([s1, s2, s3]);
	// §8.1 note + §5.3 no-bridge design → 3 contexts
	assert.equal(
		contexts.length,
		3,
		"scenario 8: interleaved → 3 contexts (no bridging)",
	);
}

// 9. Session with only 2 active domains → context reflects exactly those
{
	const s = session("s1", T0, T0 + 10 * MIN, [
		["github.com", 50],
		["slack.com", 20],
	]);
	const contexts = buildContexts([s]);
	assert.equal(contexts[0]?.domains.length, 2, "scenario 9: 2 domains only");
	assert.equal(
		contexts[0]?.primaryDomain,
		"github.com",
		"scenario 9: top domain first",
	);
}

// 10. Empty session stream → []
assert.deepEqual(buildContexts([]), [], "scenario 10: empty → []");

// 11. Single session → 1 context
{
	const s = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const contexts = buildContexts([s]);
	assert.equal(contexts.length, 1, "scenario 11: single session → 1 context");
	assert.equal(contexts[0]?.sessionCount, 1, "scenario 11: sessionCount 1");
}

// 12. Rebuild consistency (§8.2): identical output on repeated runs
{
	const sessions = [
		session("s1", T0, T0 + 10 * MIN, [
			["github.com", 50],
			["slack.com", 20],
		]),
		session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [["github.com", 40]]),
		session("s3", T0 + 4 * 60 * MIN, T0 + 4 * 60 * MIN + 10 * MIN, [
			["youtube.com", 30],
		]),
	];
	// same-tab continuity merges s1+s2; s3 split by the 4h gap
	const t = [
		trans(
			"https://github.com/a",
			"https://github.com/b",
			T0 + 15 * MIN,
			T0 + 10 * MIN,
		),
	];
	const a = buildContexts(sessions, t);
	const b = buildContexts(sessions, t);
	assert.deepEqual(a, b, "scenario 12: rebuild consistency");
	assert.equal(
		(a as BrowserContext[]).length,
		2,
		"scenario 12: expected split",
	);
}

// --- Phase 3 fixtures (steps 6-8) ---

// Fixture A — cross-domain research: Topic → Google → Company → LinkedIn
// Chain of same-tab transitions within the excursion window → 1 related context
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["topic.com", 50]]);
	const s2 = session("s2", T0 + 12 * MIN, T0 + 25 * MIN, [
		["google.com", 40],
		["company.com", 30],
	]);
	const t = [
		trans(
			"https://topic.com/post",
			"https://google.com/search",
			T0 + 12 * MIN, // to-event at s2 start
			T0 + 10 * MIN, // from-event at s1 end
		),
		trans(
			"https://google.com/search",
			"https://company.com",
			T0 + 13 * MIN,
			T0 + 12 * MIN + 30_000,
		),
		trans(
			"https://company.com",
			"https://linkedin.com",
			T0 + 14 * MIN,
			T0 + 13 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		1,
		"fixture A: cross-domain research chain → 1 related context",
	);
	assert.equal(
		contexts[0]?.mergeEvidence?.some((e) => e.includes("same-tab-transition")),
		true,
		"fixture A: same-tab-transition evidence present",
	);
	assert.ok(
		(contexts[0]?.sequence?.length ?? 0) > 0,
		"fixture A: sequence present",
	);
}

// Fixture B — Amboras-style chain: DeepSeek Harness → Google → Amboras → LinkedIn
// Same-tab consecutive chain → 1 context with ordered sequence retained
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["deepseek.ai", 50]]);
	const s2 = session("s2", T0 + 11 * MIN, T0 + 25 * MIN, [
		["google.com", 40],
		["amboras.ai", 30],
		["linkedin.com", 20],
	]);
	const t = [
		trans(
			"https://deepseek.ai/harness",
			"https://google.com/search",
			T0 + 11 * MIN, // to-event at s2 start
			T0 + 10 * MIN, // from-event at s1 end
		),
		trans(
			"https://google.com/search",
			"https://amboras.ai",
			T0 + 11 * MIN + 30_000,
			T0 + 11 * MIN,
		),
		trans(
			"https://amboras.ai",
			"https://linkedin.com",
			T0 + 12 * MIN,
			T0 + 11 * MIN + 30_000,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		1,
		"fixture B: Amboras chain → 1 related context",
	);
	const seq = contexts[0]?.sequence ?? [];
	assert.deepEqual(
		seq.map((k) => k.split("://")[1].replace(/\/.*$/, "")),
		["deepseek.ai", "google.com", "amboras.ai", "linkedin.com"],
		"fixture B: ordered sequence retained",
	);
	assert.ok(
		(contexts[0]?.transitions?.length ?? 0) >= 2,
		"fixture B: transition links retained",
	);
}

// Fixture C — Main App → Google → GitHub → Main App: 1 main context + excursion
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["localhost:3000", 50]]);
	const s2 = session("s2", T0 + 11 * MIN, T0 + 15 * MIN, [
		["google.com", 40],
		["github.com", 30],
	]);
	const t = [
		trans(
			"http://localhost:3000/app",
			"https://google.com",
			T0 + 11 * MIN, // to-event at s2 start
			T0 + 10 * MIN, // from-event at s1 end
		),
		trans(
			"https://google.com",
			"https://github.com",
			T0 + 12 * MIN,
			T0 + 11 * MIN + 30_000,
		),
		trans(
			"https://github.com",
			"http://localhost:3000/app",
			T0 + 13 * MIN,
			T0 + 12 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	// same-tab return → main context not split; excursion attached
	assert.equal(
		contexts.length,
		1,
		"fixture C: excursion does not split main context",
	);
	assert.ok(
		contexts[0]?.mergeEvidence?.some((e) => e.includes("same-tab-transition")),
		"fixture C: merge evidence present",
	);
	assert.equal(
		contexts[0]?.excursions?.length,
		1,
		"fixture C: excursion detected",
	);
	assert.equal(
		contexts[0]?.excursions?.[0]?.activities.length ?? 0,
		2,
		"fixture C: excursion chain has 2 activities",
	);
}

// Fixture D — Same domain, different work: GitHub Project A … GitHub Project B
// Surrounding evidence differs → separate contexts (no domain-equality-as-proof)
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 20 * MIN, T0 + 30 * MIN, [["github.com", 40]]);
	// different tab, no transition connecting them
	const contexts = buildContexts([s1, s2], []);
	assert.equal(
		contexts.length,
		2,
		"fixture D: same-domain different work → 2 contexts",
	);
}

// --- V3 regression fixtures (fix prompt §19) ---

// Fixture 2 — weak transitive chain: A→B→C→D→E, every adjacent pair has a
// boundary transition whose gap exceeds the evidence cutoff → each edge is too
// weak to count → NOT one giant context.
{
	const mk = (id: string, start: number, domain: string): Session =>
		session(id, start, start + 10 * MIN, [[domain, 40]]);
	const sessions = [
		mk("s1", T0, "a.com"),
		mk("s2", T0 + 30 * MIN, "b.com"),
		mk("s3", T0 + 60 * MIN, "c.com"),
		mk("s4", T0 + 90 * MIN, "d.com"),
		mk("s5", T0 + 120 * MIN, "e.com"),
	];
	// each adjacent pair has a 20m-gap transition → >15m cutoff → weak
	const t = [
		trans("https://a.com/x", "https://b.com/x", T0 + 30 * MIN, T0 + 10 * MIN),
		trans("https://b.com/x", "https://c.com/x", T0 + 60 * MIN, T0 + 40 * MIN),
		trans("https://c.com/x", "https://d.com/x", T0 + 90 * MIN, T0 + 70 * MIN),
		trans("https://d.com/x", "https://e.com/x", T0 + 120 * MIN, T0 + 100 * MIN),
	];
	const contexts = buildContexts(sessions, t);
	assert.equal(
		contexts.length,
		5,
		"fixture 2: weak edges do NOT fuse into one context",
	);
	assert.ok(
		contexts.every((c) => c.sessionCount === 1),
		"fixture 2: every weak pair stays separate",
	);
}

// Fixture 4 — long excursion / eventual return must not fuse hours of activity:
// every adjacent pair HAS direct same-tab evidence with a SHORT boundary gap
// (would merge greedily), but the total span exceeds MAX_CONTEXT_SPAN_MS →
// splits into bounded contexts.
{
	const mk = (id: string, start: number, domain: string): Session =>
		session(id, start, start + 15 * MIN, [[domain, 40]]);
	const sessions = [
		mk("s1", T0, "main.com"),
		mk("s2", T0 + 20 * MIN, "google.com"),
		mk("s3", T0 + 40 * MIN, "github.com"),
		mk("s4", T0 + 60 * MIN, "youtube.com"),
		mk("s5", T0 + 80 * MIN, "main.com"), // eventual return, 80m later
	];
	// every boundary has a 5m-gap same-tab transition → all pairs have evidence
	const t = [
		trans(
			"https://main.com/x",
			"https://google.com/x",
			T0 + 20 * MIN,
			T0 + 15 * MIN,
		),
		trans(
			"https://google.com/x",
			"https://github.com/x",
			T0 + 40 * MIN,
			T0 + 35 * MIN,
		),
		trans(
			"https://github.com/x",
			"https://youtube.com/x",
			T0 + 60 * MIN,
			T0 + 55 * MIN,
		),
		trans(
			"https://youtube.com/x",
			"https://main.com/x",
			T0 + 80 * MIN,
			T0 + 75 * MIN,
		),
	];
	const contexts = buildContexts(sessions, t);
	assert.equal(
		contexts.length,
		3,
		"fixture 4: departure/return chain splits at home boundaries, not one giant context",
	);
	assert.equal(
		contexts[0]?.primaryDomain,
		"main.com",
		"fixture 4: first context is the main home cluster",
	);
	assert.equal(
		contexts[1]?.sessionCount,
		3,
		"fixture 4: away-run (google+github+youtube) is one bounded context",
	);
	assert.equal(
		contexts[2]?.primaryDomain,
		"main.com",
		"fixture 4: eventual return is a recurrence context",
	);
	assert.ok(
		contexts.every((c) => c.duration <= CONTEXT_THRESHOLDS.MAX_CONTEXT_SPAN_MS),
		"fixture 4: no context exceeds the span bound",
	);
}

// Fixture 7 — context-local sequence: a small context surrounded by unrelated
// global transitions must expose ONLY its own activity (no leakage).
{
	const s_before = session("sb", T0 - 30 * MIN, T0 - 20 * MIN, [
		["youtube.com", 30],
	]);
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 20]]);
	const s2 = session("s2", T0 + 12 * MIN, T0 + 20 * MIN, [["github.com", 25]]);
	const s_after = session("sa", T0 + 30 * MIN, T0 + 40 * MIN, [
		["google.com", 30],
	]);
	// global stream: a youtube→google transition that spans ACROSS the middle
	// context's window, plus the real github/a→github/b merge edge
	const t = [
		trans(
			"https://youtube.com/watch",
			"https://google.com/search",
			T0 + 35 * MIN,
			T0 - 25 * MIN, // from long before the context
		),
		trans(
			"https://github.com/proj-a",
			"https://github.com/proj-b",
			T0 + 12 * MIN,
			T0 + 10 * MIN,
		),
	];
	const contexts = buildContexts([s_before, s1, s2, s_after], t);
	assert.equal(
		contexts.length,
		3,
		"fixture 7: before / middle / after contexts",
	);
	const middle = contexts[1] ?? ({} as BrowserContext);
	assert.deepEqual(
		middle.sequence,
		["https://github.com/proj-a", "https://github.com/proj-b"],
		"fixture 7: sequence contains ONLY context activity",
	);
	assert.ok(
		!middle.sequence?.some(
			(k) => k.includes("youtube") || k.includes("google"),
		),
		"fixture 7: no leaked global transitions in sequence",
	);
}

// Fixture 8 — many tabs, one active: shared background tabs do NOT merge two
// sessions; primaryDomain reflects the active/high-activity work.
{
	const s1 = session(
		"s1",
		T0,
		T0 + 10 * MIN,
		[
			["github.com", 50],
			["youtube.com", 5],
			["facebook.com", 3],
		],
		{
			tabs: [
				{
					tabId: 1,
					eventCount: 50,
					firstSeen: T0,
					lastSeen: T0 + 10 * MIN,
					isActive: true,
				},
				{
					tabId: 2,
					eventCount: 5,
					firstSeen: T0,
					lastSeen: T0 + 10 * MIN,
					isActive: false,
				},
				{
					tabId: 3,
					eventCount: 3,
					firstSeen: T0,
					lastSeen: T0 + 10 * MIN,
					isActive: false,
				},
			],
			activeTabId: 1,
		},
	);
	const s2 = session(
		"s2",
		T0 + 15 * MIN,
		T0 + 25 * MIN,
		[
			["slack.com", 40],
			["youtube.com", 8],
			["facebook.com", 2],
		],
		{
			tabs: [
				{
					tabId: 4,
					eventCount: 40,
					firstSeen: T0 + 15 * MIN,
					lastSeen: T0 + 25 * MIN,
					isActive: true,
				},
				{
					tabId: 2,
					eventCount: 8,
					firstSeen: T0 + 15 * MIN,
					lastSeen: T0 + 25 * MIN,
					isActive: false,
				},
				{
					tabId: 3,
					eventCount: 2,
					firstSeen: T0 + 15 * MIN,
					lastSeen: T0 + 25 * MIN,
					isActive: false,
				},
			],
			activeTabId: 4,
		},
	);
	// no transition evidence → shared background tabs must NOT merge
	const contexts = buildContexts([s1, s2]);
	assert.equal(
		contexts.length,
		2,
		"fixture 8: background-tab overlap does not merge sessions",
	);
	assert.equal(
		contexts[0]?.primaryDomain,
		"github.com",
		"fixture 8: active work dominates classification",
	);
	assert.equal(
		contexts[1]?.primaryDomain,
		"slack.com",
		"fixture 8: second session classified by its own active work",
	);
}

// --- V4.1 regression fixtures (§17) ---

// Case 2 — Same tab, task switch: Tab 1 / Task A → long unrelated activity →
// Tab 1 / Task B. Same-tab transition exists but the boundary gap is long
// (15m > short-gap window) → 2 contexts.
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["task-a.com", 50]]);
	const s2 = session("s2", T0 + 25 * MIN, T0 + 35 * MIN, [["task-b.com", 40]]);
	// same-tab transition, but 15m boundary gap → supporting evidence too weak
	const t = [
		trans(
			"https://task-a.com/work",
			"https://task-b.com/work",
			T0 + 25 * MIN,
			T0 + 10 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		2,
		"case 2: same-tab + long gap → 2 contexts (surface ≠ task)",
	);
}

// Case 3 — Same tab, continuation: Tab 1 / Page A → Tab 1 / related navigation,
// short boundary gap → same context (T3 supporting evidence suffices).
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 12 * MIN, T0 + 22 * MIN, [["github.com", 40]]);
	const t = [
		trans(
			"https://github.com/repo-a/issues/17",
			"https://github.com/repo-a/pulls/22",
			T0 + 12 * MIN,
			T0 + 10 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		1,
		"case 3: same-tab continuation with short gap → 1 context",
	);
}

// Case 5 — Long return: A → unrelated activity → A after the excursion window.
// Must NOT be one excursion, and must not fuse into one context.
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["main.com", 50]]);
	const s2 = session("s2", T0 + 12 * MIN, T0 + 22 * MIN, [["google.com", 40]]);
	const s3 = session("s3", T0 + 45 * MIN, T0 + 55 * MIN, [["main.com", 30]]);
	// short depart (2m gap → T3), long return (23m gap → too weak)
	const t = [
		trans(
			"https://main.com/x",
			"https://google.com/x",
			T0 + 12 * MIN,
			T0 + 10 * MIN,
		),
		trans(
			"https://google.com/x",
			"https://main.com/x",
			T0 + 45 * MIN,
			T0 + 22 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2, s3], t);
	assert.equal(
		contexts.length,
		3,
		"case 5: departure from home + long return → 3 contexts (recurrence, not excursion)",
	);
	assert.equal(
		contexts[2]?.primaryDomain,
		"main.com",
		"case 5: recurrence context is main.com",
	);
	assert.equal(
		contexts[0]?.excursions?.length ?? 0,
		0,
		"case 5: no excursion beyond the window",
	);
}

// Case 6 — Weak chain A→B→C→D→E with 15m boundary gaps (same-tab transitions
// exist but exceed the short-gap window) → no giant context.
{
	const mk = (id: string, start: number, domain: string): Session =>
		session(id, start, start + 10 * MIN, [[domain, 40]]);
	const sessions = [
		mk("s1", T0, "a.com"),
		mk("s2", T0 + 25 * MIN, "b.com"),
		mk("s3", T0 + 50 * MIN, "c.com"),
		mk("s4", T0 + 75 * MIN, "d.com"),
		mk("s5", T0 + 100 * MIN, "e.com"),
	];
	const t = [
		trans("https://a.com/x", "https://b.com/x", T0 + 25 * MIN, T0 + 10 * MIN),
		trans("https://b.com/x", "https://c.com/x", T0 + 50 * MIN, T0 + 35 * MIN),
		trans("https://c.com/x", "https://d.com/x", T0 + 75 * MIN, T0 + 60 * MIN),
		trans("https://d.com/x", "https://e.com/x", T0 + 100 * MIN, T0 + 85 * MIN),
	];
	const contexts = buildContexts(sessions, t);
	assert.equal(
		contexts.length,
		5,
		"case 6: weak chain does NOT fuse into one giant context",
	);
}

// Case 7 — Same-domain different tasks: GitHub /project-A → GitHub /project-B
// with a long gap → separate contexts (domain equality is not proof).
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 30 * MIN, T0 + 40 * MIN, [["github.com", 40]]);
	// same domain, same tab, but 20m boundary gap → same-tab too weak to merge
	const t = [
		trans(
			"https://github.com/project-a",
			"https://github.com/project-b",
			T0 + 30 * MIN,
			T0 + 10 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	assert.equal(
		contexts.length,
		2,
		"case 7: same-domain long gap → 2 contexts (different tasks)",
	);
}

// §12 hard excursion invariant — every excursion obeys the return window.
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["main.com", 50]]);
	const s2 = session("s2", T0 + 11 * MIN, T0 + 15 * MIN, [
		["google.com", 40],
		["github.com", 30],
	]);
	const t = [
		trans(
			"http://localhost:3000/app",
			"https://google.com",
			T0 + 11 * MIN,
			T0 + 10 * MIN,
		),
		trans(
			"https://google.com",
			"https://github.com",
			T0 + 12 * MIN,
			T0 + 11 * MIN + 30_000,
		),
		trans(
			"https://github.com",
			"http://localhost:3000/app",
			T0 + 13 * MIN,
			T0 + 12 * MIN,
		),
	];
	const contexts = buildContexts([s1, s2], t);
	for (const c of contexts) {
		for (const ex of c.excursions ?? []) {
			assert.ok(
				ex.end - ex.start <= CONTEXT_THRESHOLDS.EXCURSION_RETURN_WINDOW_MS,
				`§12: excursion span ${ex.end - ex.start}ms exceeds return window`,
			);
		}
	}
}

logger.info("contexts.check: all assertions passed ✔");
