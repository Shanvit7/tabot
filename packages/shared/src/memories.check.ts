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

// Fixture J (step 10) — memory preserves ordered sequence, first-occurrence, deduped
{
	const contexts2 = [
		{
			...ctx({
				start: NOW - 2 * day,
				domains: [
					{ domain: "deepseek.ai", eventCount: 300 },
					{ domain: "google.com", eventCount: 200 },
					{ domain: "amboras.ai", eventCount: 150 },
				],
			}),
			sequence: ["https://deepseek.ai/harness", "https://google.com/search"],
		},
		{
			...ctx({
				start: NOW - 1 * day,
				domains: [
					{ domain: "deepseek.ai", eventCount: 300 },
					{ domain: "google.com", eventCount: 200 },
					{ domain: "amboras.ai", eventCount: 150 },
				],
			}),
			sequence: ["https://google.com/search", "https://amboras.ai"],
		},
	];
	const m2 = buildMemories(contexts2, NOW);
	assert.equal(m2.length, 1, "fixture J: one consolidated memory");
	const seq = m2[0].sequence;
	assert.deepEqual(
		seq,
		[
			"https://deepseek.ai/harness",
			"https://google.com/search",
			"https://amboras.ai",
		],
		"fixture J: merged sequence first-occurrence, deduped",
	);
	assert.ok(
		(m2[0].observation ?? "").includes("→"),
		"fixture J: observation is sequence-aware",
	);
}

// Fixture J2 (step 10) — no sequence evidence → field omitted, domain-set observation
{
	const memories = buildMemories(
		[
			ctx({
				start: NOW - 2 * day,
				domains: [{ domain: "github.com", eventCount: 300 }],
			}),
			ctx({
				start: NOW - 1 * day,
				domains: [{ domain: "github.com", eventCount: 200 }],
			}),
		],
		NOW,
	);
	assert.equal(memories.length, 1, "fixture J2: one memory");
	assert.equal(
		memories[0].sequence,
		undefined,
		"fixture J2: sequence omitted when no evidence",
	);
	assert.ok(
		(memories[0].observation ?? "").includes("Observed in"),
		"fixture J2: observation is an evidence summary (V7 §25)",
	);
	assert.ok(
		!/stalk|intent|want|think|stalked/.test(memories[0].observation),
		"fixture J2: no intent vocabulary",
	);
}

// Fixture I (step 9) — inference always null, evidence never intent
{
	const memories = buildMemories(
		[
			ctx({
				start: NOW - 2 * day,
				domains: [{ domain: "github.com", eventCount: 300 }],
			}),
			ctx({
				start: NOW - 1 * day,
				domains: [{ domain: "github.com", eventCount: 200 }],
			}),
		],
		NOW,
	);
	for (const m of memories) {
		assert.equal(m.inference, null, "fixture I: inference is null");
		assert.ok(
			!/stalk|intent|want|think|stalked/.test(m.observation),
			"fixture I: no intent vocabulary in observation",
		);
	}
}

// --- V7 fixtures (Downloads/prompt.md §13, §20-25) ---

// V7-1 — same discovery trail in a different ORDER consolidates (§13):
// LinkedIn→Google→GitHub→YC→Amboras vs Google→YC→Amboras→LinkedIn→GitHub.
{
	const mk = (start: number, sequence: string[]): BrowserContext => ({
		...ctx({
			start,
			domains: [
				{ domain: "linkedin.com", eventCount: 100 },
				{ domain: "google.com", eventCount: 100 },
				{ domain: "github.com", eventCount: 100 },
				{ domain: "ycombinator.com", eventCount: 100 },
				{ domain: "amboras.ai", eventCount: 100 },
			],
		}),
		sequence,
	});
	const c1 = mk(NOW - 6 * day, [
		"https://linkedin.com/feed",
		"https://google.com/search",
		"https://github.com/x",
		"https://ycombinator.com",
		"https://amboras.ai",
	]);
	const c2 = mk(NOW - 2 * day, [
		"https://google.com/search",
		"https://ycombinator.com",
		"https://amboras.ai",
		"https://linkedin.com/feed",
		"https://github.com/x",
	]);
	const memories = buildMemories([c1, c2], NOW);
	assert.equal(
		memories.length,
		1,
		"V7-1: reordered same trail consolidates (behavioral, not signature)",
	);
	assert.equal(memories[0].contextCount, 2, "V7-1: both occurrences");
	assert.ok(
		memories[0].confidence > 0.5,
		"V7-1: confidence reflects repeated pattern",
	);
}

// V7-2 — different behavior sharing common domains does NOT consolidate (§31):
// github+slack (dev work) vs github+slack+jira (different task mix) stay separate.
{
	const c1 = ctx({
		start: NOW - 5 * day,
		domains: [
			{ domain: "github.com", eventCount: 400 },
			{ domain: "slack.com", eventCount: 100 },
		],
	});
	const c2 = ctx({
		start: NOW - 1 * day,
		domains: [
			{ domain: "github.com", eventCount: 300 },
			{ domain: "slack.com", eventCount: 80 },
			{ domain: "jira.com", eventCount: 200 },
		],
	});
	const memories = buildMemories([c1, c2], NOW);
	assert.equal(
		memories.length,
		2,
		"V7-2: strict-superset domain set does not auto-consolidate",
	);
}

// V7-3 — empty/identity-less fingerprints create no memory (§21 hard invariant)
{
	const empty = ctx({ start: NOW - 2 * day, domains: [] });
	const memories = buildMemories([empty], NOW);
	assert.equal(memories.length, 0, "V7-3: no behavioral identity → no memory");
}

// V7-4 — occurrences preserved individually, not flattened (§22)
{
	const c1 = ctx({
		start: NOW - 3 * day,
		domains: [
			{ domain: "google.com", eventCount: 300 },
			{ domain: "amboras.ai", eventCount: 200 },
		],
	});
	const c2 = ctx({
		start: NOW - 1 * day,
		domains: [
			{ domain: "google.com", eventCount: 250 },
			{ domain: "amboras.ai", eventCount: 150 },
		],
	});
	const memories = buildMemories([c1, c2], NOW);
	assert.equal(memories.length, 1, "V7-4: one memory");
	assert.equal(
		memories[0].occurrences.length,
		2,
		"V7-4: occurrences preserved individually",
	);
	assert.ok(
		memories[0].evidence.occurrenceCount === 2 &&
			memories[0].evidence.temporalSpreadMs > 0,
		"V7-4: evidence exposed",
	);
}

// V7-5 — strength is evidence-derived, not raw event count (§23): a repeated
// 3-minute high-confidence pattern beats a one-off 10k-event blob.
{
	const thinRecurrent = [
		ctx({
			start: NOW - 4 * day,
			totalEventCount: 50,
			domains: [
				{ domain: "google.com", eventCount: 25 },
				{ domain: "amboras.ai", eventCount: 25 },
			],
		}),
		ctx({
			start: NOW - 2 * day,
			totalEventCount: 50,
			domains: [
				{ domain: "google.com", eventCount: 25 },
				{ domain: "amboras.ai", eventCount: 25 },
			],
		}),
	];
	const bigSingle = ctx({
		start: NOW - 1 * day,
		totalEventCount: 10_000,
		domains: [{ domain: "noisy.com", eventCount: 10_000 }],
	});
	const memories = buildMemories([...thinRecurrent, bigSingle], NOW);
	assert.equal(memories.length, 2, "V7-5: two memories");
	assert.ok(
		memories[0].strength > memories[1].strength,
		"V7-5: recurrent pattern outranks one-off event blob",
	);
}

logger.info("memories.check — all scenarios pass");
