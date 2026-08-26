// packages/shared/src/memories.check.ts
// Validation for docs/tech.md §9.1 (test scenarios) + §9.2 (rebuild consistency).
// Run: node --import ./resolve-hook.mjs src/memories.check.ts

import assert from "node:assert/strict";
import type { BrowserContext, ContextDomain } from "./contexts";
import { logger } from "./logger";
import { buildMemories, MEMORY_THRESHOLDS } from "./memories";

// --- helpers ---

const NOW = 1_700_000_000_000; // fixed reference for deterministic staleness

let ctxSeq = 0;
let sessSeq = 0;

interface CtxOpts {
	start: number;
	end?: number;
	totalEventCount?: number;
	sessionCount?: number;
	domains: { domain: string; eventCount: number }[];
}

// buildContexts consumes only start/end timestamps, domains[], ids, and counters.
// Each context gets a fresh id so memory ids are unique per scenario.
const ctx = (opts: CtxOpts): BrowserContext => {
	const id = `ctx-${++ctxSeq}`;
	const domainList: ContextDomain[] = opts.domains.map((d) => ({
		domain: d.domain,
		eventCount: d.eventCount,
		sessionCount: opts.sessionCount ?? 1,
		sessionIds: [`s-${++sessSeq}`],
		firstSeen: opts.start,
		lastSeen: opts.end ?? opts.start,
	}));
	const totalEventCount =
		opts.totalEventCount ?? opts.domains.reduce((s, d) => s + d.eventCount, 0);
	return {
		id,
		startTimestamp: opts.start,
		endTimestamp: opts.end ?? opts.start,
		duration: (opts.end ?? opts.start) - opts.start,
		sessionIds: domainList.map((d) => d.sessionIds[0]),
		sessionCount: opts.sessionCount ?? 1,
		domains: domainList,
		totalEventCount,
		totalInteractionCount: 0,
		totalNavigationCount: 0,
		totalTabSwitchCount: 0,
		recurrenceCount: opts.sessionCount ?? 1,
		primaryDomain: domainList[0]?.domain ?? "",
	};
};

const day = 24 * 60 * 60 * 1000;
// --- scenarios ---

// S1: GitHub+Slack appears in 3 contexts (separate days) → 1 recurrent memory, contextCount 3
{
	const contexts = [
		ctx({
			start: NOW - 6 * day,
			domains: [
				{ domain: "github.com", eventCount: 400 },
				{ domain: "slack.com", eventCount: 100 },
			],
		}),
		ctx({
			start: NOW - 4 * day,
			domains: [
				{ domain: "github.com", eventCount: 300 },
				{ domain: "slack.com", eventCount: 80 },
			],
		}),
		ctx({
			start: NOW - 2 * day,
			domains: [
				{ domain: "github.com", eventCount: 500 },
				{ domain: "slack.com", eventCount: 120 },
			],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 1, "S1: one memory");
	assert.equal(memories[0].kind, "recurrent", "S1: recurrent");
	assert.equal(memories[0].contextCount, 3, "S1: 3 contexts");
	assert.equal(memories[0].signature, "github.com+slack.com", "S1: signature");
	assert.equal(memories[0].inference, null, "S1: no inference");
}

// S2: GitHub+Slack once, low event count → no memory
{
	const contexts = [
		ctx({
			start: NOW - 3 * day,
			domains: [
				{ domain: "github.com", eventCount: 30 },
				{ domain: "slack.com", eventCount: 20 },
			],
		}),
	];
	assert.equal(
		buildMemories(contexts, NOW).length,
		0,
		"S2: below density, no memory",
	);
}

// S3: GitHub+Slack once, 800 events → 1 single memory
{
	const contexts = [
		ctx({
			start: NOW - 3 * day,
			totalEventCount: 800,
			domains: [
				{ domain: "github.com", eventCount: 500 },
				{ domain: "slack.com", eventCount: 300 },
			],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 1, "S3: one memory");
	assert.equal(memories[0].kind, "single", "S3: single");
	assert.equal(memories[0].contextCount, 1, "S3: 1 context");
}

// S4: GitHub+Slack (day 1) + GitHub+Slack+Jira (day 2) → 2 memories, no partial merge
{
	const contexts = [
		ctx({
			start: NOW - 5 * day,
			domains: [
				{ domain: "github.com", eventCount: 400 },
				{ domain: "slack.com", eventCount: 100 },
			],
		}),
		ctx({
			start: NOW - 1 * day,
			domains: [
				{ domain: "github.com", eventCount: 300 },
				{ domain: "slack.com", eventCount: 80 },
				{ domain: "jira.com", eventCount: 200 },
			],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 2, "S4: two memories, no over-merge");
	assert.deepEqual(
		memories.map((m) => m.signature).sort(),
		["github.com+jira.com+slack.com", "github.com+slack.com"],
		"S4: signatures",
	);
}

// S5: same signature day 1 and day 8 (both more than 7 days before now) → 1 memory, stale (not deleted)
{
	const contexts = [
		ctx({
			start: NOW - 15 * day,
			end: NOW - 15 * day + 60 * 60 * 1000,
			domains: [
				{ domain: "github.com", eventCount: 300 },
				{ domain: "slack.com", eventCount: 100 },
			],
		}),
		ctx({
			start: NOW - 8 * day,
			end: NOW - 8 * day + 60 * 60 * 1000,
			domains: [
				{ domain: "github.com", eventCount: 400 },
				{ domain: "slack.com", eventCount: 120 },
			],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 1, "S5: one memory");
	assert.ok(
		memories[0].staleness > MEMORY_THRESHOLDS.MEMORY_STALE_MS,
		"S5: stale (> 7 days)",
	);
	assert.equal(memories[0].kind, "recurrent", "S5: recurrent");
}

// S6: context with > 6 domains → signature capped at top-6 by eventCount
{
	const domains = [
		{ domain: "a.com", eventCount: 600 },
		{ domain: "b.com", eventCount: 500 },
		{ domain: "c.com", eventCount: 400 },
		{ domain: "d.com", eventCount: 300 },
		{ domain: "e.com", eventCount: 200 },
		{ domain: "f.com", eventCount: 100 },
		{ domain: "g.com", eventCount: 50 }, // 7th — excluded
	];
	const contexts = [
		ctx({ start: NOW - 2 * day, domains }),
		ctx({ start: NOW - 1 * day, domains }),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 1, "S6: one memory");
	const sigParts = memories[0].signature.split("+");
	assert.equal(sigParts.length, 6, "S6: capped at 6 domains");
	assert.ok(!sigParts.includes("g.com"), "S6: 7th domain excluded");
}

// S7: interleaved signatures (GitHub+Slack, Docs, GitHub+Slack) → 2 memories, each 2 contexts
{
	const contexts = [
		ctx({
			start: NOW - 10 * day,
			domains: [
				{ domain: "github.com", eventCount: 400 },
				{ domain: "slack.com", eventCount: 100 },
			],
		}),
		ctx({
			start: NOW - 9 * day,
			domains: [{ domain: "docs.com", eventCount: 600 }],
		}),
		ctx({
			start: NOW - 8 * day,
			domains: [
				{ domain: "github.com", eventCount: 350 },
				{ domain: "slack.com", eventCount: 90 },
			],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 2, "S7: two memories");
	const ghSlack = memories.filter(
		(m) => m.signature === "github.com+slack.com",
	);
	assert.equal(ghSlack.length, 1, "S7: GitHub+Slack memory");
	assert.equal(
		ghSlack[0].contextCount,
		2,
		"S7: both GitHub+Slack contexts consolidated",
	);
}

// S8: empty context stream → []
assert.deepEqual(buildMemories([], NOW), [], "S8: empty stream");

// S9: single dense (800) + thin (100, same sig) → 1 memory, both contribute evidence
{
	const contexts = [
		ctx({
			start: NOW - 4 * day,
			totalEventCount: 800,
			domains: [
				{ domain: "github.com", eventCount: 500 },
				{ domain: "slack.com", eventCount: 300 },
			],
		}),
		ctx({
			start: NOW - 3 * day,
			totalEventCount: 100,
			domains: [
				{ domain: "github.com", eventCount: 60 },
				{ domain: "slack.com", eventCount: 40 },
			],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 1, "S9: one memory");
	assert.equal(memories[0].contextCount, 2, "S9: both contexts");
	assert.equal(memories[0].totalEventCount, 900, "S9: events summed");
}

// S10: rebuild consistency — identical output on repeated runs (§9.2)
{
	const contexts = [
		ctx({
			start: NOW - 6 * day,
			domains: [
				{ domain: "github.com", eventCount: 400 },
				{ domain: "slack.com", eventCount: 100 },
			],
		}),
		ctx({
			start: NOW - 4 * day,
			domains: [
				{ domain: "github.com", eventCount: 300 },
				{ domain: "slack.com", eventCount: 80 },
			],
		}),
		ctx({
			start: NOW - 2 * day,
			domains: [{ domain: "docs.com", eventCount: 700 }],
		}),
	];
	const a = buildMemories(contexts, NOW);
	const b = buildMemories(contexts, NOW);
	assert.deepEqual(a, b, "S10: rebuild consistency");
}

// S11: strength ordering — stronger memories sort first
{
	const contexts = [
		// recurrent: github+slack+jira in 2 contexts → strength 2*3 = 6
		ctx({
			start: NOW - 6 * day,
			domains: [
				{ domain: "github.com", eventCount: 300 },
				{ domain: "slack.com", eventCount: 100 },
				{ domain: "jira.com", eventCount: 100 },
			],
		}),
		ctx({
			start: NOW - 3 * day,
			domains: [
				{ domain: "github.com", eventCount: 300 },
				{ domain: "slack.com", eventCount: 100 },
				{ domain: "jira.com", eventCount: 100 },
			],
		}),
		// single dense: docs.com in 1 context → strength 1*1 = 1
		ctx({
			start: NOW - 1 * day,
			domains: [{ domain: "docs.com", eventCount: 600 }],
		}),
	];
	const memories = buildMemories(contexts, NOW);
	assert.equal(memories.length, 2, "S11: two memories");
	assert.equal(
		memories[0].signature,
		"github.com+jira.com+slack.com",
		"S11: recurrent (strength 6) sorts first",
	);
	assert.equal(
		memories[1].signature,
		"docs.com",
		"S11: single (strength 1) sorts second",
	);
	assert.ok(
		memories[0].strength > memories[1].strength,
		"S11: strength ordering",
	);
}

logger.info("memories.check — all scenarios pass");
