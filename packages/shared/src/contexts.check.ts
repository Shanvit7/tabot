// packages/shared/src/contexts.check.ts
// Runnable self-check for buildContexts() — covers docs/tech.md §8.1 scenarios + §8.2 rebuild consistency.
// Run: node packages/shared/src/contexts.check.ts  (Node 24+ strips types natively)

import assert from "node:assert/strict";
import { type BrowserContext, buildContexts } from "./contexts.ts";
import { logger } from "./logger.ts";
import type { Session } from "./sessions.ts";

const MIN = 60_000;
const T0 = Date.now() - 24 * 60 * MIN;

// Session factory — buildContexts only consumes start/end, domains[], ids, and intensity counters
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
	tabs: [],
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

// 1. Adjacent sessions on GitHub + Slack → 1 context, sessionCount 2, 2 domains
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [
		["github.com", 50],
		["slack.com", 20],
	]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [
		["github.com", 40],
		["slack.com", 10],
	]);
	const contexts = buildContexts([s1, s2]);
	assert.equal(
		contexts.length,
		1,
		"scenario 1: adjacent overlapping → 1 context",
	);
	assert.equal(contexts[0]?.sessionCount, 2, "scenario 1: sessionCount 2");
	assert.equal(contexts[0]?.domains.length, 2, "scenario 1: 2 domains");
	assert.equal(
		contexts[0]?.recurrenceCount,
		2,
		"scenario 1: top domain recurs in 2 sessions",
	);
}

// 2. Adjacent sessions on disjoint sites → 2 contexts
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [["youtube.com", 40]]);
	const contexts = buildContexts([s1, s2]);
	assert.equal(contexts.length, 2, "scenario 2: disjoint domains → 2 contexts");
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

// 4. Same-domain sessions separated by 15 min gap → 1 context
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 25 * MIN, T0 + 40 * MIN, [["github.com", 40]]);
	assert.equal(
		buildContexts([s1, s2]).length,
		1,
		"scenario 4: 15min gap → 1 context",
	);
}

// 5. Morning GitHub work, lunch break, afternoon GitHub work → 2 contexts
{
	const s1 = session("s1", T0, T0 + 20 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 30 * MIN, T0 + 50 * MIN, [["github.com", 40]]);
	const s3 = session("s3", T0 + 4 * 60 * MIN, T0 + 4 * 60 * MIN + 20 * MIN, [
		["github.com", 30],
	]);
	const contexts = buildContexts([s1, s2, s3]);
	assert.equal(contexts.length, 2, "scenario 5: lunch gap → 2 contexts");
	assert.equal(contexts[0]?.sessionCount, 2, "scenario 5: morning grouped");
	assert.equal(contexts[1]?.sessionCount, 1, "scenario 5: afternoon separate");
}

// 6. GitHub → YouTube → GitHub continuous → no bridging: 3 contexts
{
	const s1 = session("s1", T0, T0 + 10 * MIN, [["github.com", 50]]);
	const s2 = session("s2", T0 + 15 * MIN, T0 + 25 * MIN, [["youtube.com", 40]]);
	const s3 = session("s3", T0 + 30 * MIN, T0 + 40 * MIN, [["github.com", 30]]);
	const contexts = buildContexts([s1, s2, s3]);
	// per spec §8.1 note: YouTube does NOT bridge — no transitive merging in V1
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
	const contexts = buildContexts([s1, s2, s3, s4]);
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
	// spec §8.1 table says "2 contexts (GitHub/Slack grouped)" but the §8.1 note + §5.3
	// no-bridge design means Docs between them splits the chain → 3 contexts.
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
	const a = buildContexts(sessions);
	const b = buildContexts(sessions);
	assert.deepEqual(a, b, "scenario 12: rebuild consistency");
	assert.equal(
		(a as BrowserContext[]).length,
		2,
		"scenario 12: expected split",
	);
}

logger.info("contexts.check: all assertions passed ✔");
