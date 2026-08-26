// packages/shared/src/retrieval.check.ts
// Runnable self-check for the retrieval layer — covers docs/tech.md §9.1 scenarios + §9.2 rebuild consistency.
// Tests the pure cores (jaccardIndex, similarity ranking, annotation, summary) against constructed contexts/memories.
// Run: node --import ./resolve-hook.mjs src/retrieval.check.ts

import assert from "node:assert/strict";
import type { BrowserContext, ContextDomain } from "./contexts.ts";
import { logger } from "./logger.ts";
import { buildMemories } from "./memories.ts";
import {
	annotateTimelineCore,
	contextSignature,
	findSimilarContextsCore,
	findSimilarMemoriesCore,
	jaccardIndex,
	summarizeContextCore,
} from "./retrieval.ts";

const NOW = 1_700_000_000_000; // fixed reference
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;

const ctx = (
	domains: string[],
	startOffsetDay: number,
	eventCounts?: number[],
): BrowserContext => {
	const start = NOW - startOffsetDay * DAY;
	const end = start + 60 * 60 * 1000; // 1h duration
	const domainList: ContextDomain[] = domains.map((d, i) => ({
		domain: d,
		eventCount: eventCounts?.[i] ?? 100,
		sessionCount: 1,
		sessionIds: [`s-${++seq}`],
		firstSeen: start,
		lastSeen: end,
	}));
	return {
		id: `ctx-${++seq}`,
		startTimestamp: start,
		endTimestamp: end,
		duration: end - start,
		sessionIds: domainList.map((d) => d.sessionIds[0]),
		sessionCount: 1,
		domains: domainList,
		totalEventCount: domainList.reduce((s, d) => s + d.eventCount, 0),
		totalInteractionCount: 10,
		totalNavigationCount: 2,
		totalTabSwitchCount: 1,
		recurrenceCount: 1,
		primaryDomain: domainList[0]?.domain ?? "",
	};
};

// --- jaccardIndex (§8.3) ---

// 1. Identical sets → 1.0
assert.equal(
	jaccardIndex(new Set(["a", "b"]), new Set(["a", "b"])),
	1,
	"scenario 1: identical → 1",
);

// 2. Disjoint sets → 0
assert.equal(
	jaccardIndex(new Set(["a", "b"]), new Set(["c", "d"])),
	0,
	"scenario 2: disjoint → 0",
);

// 3. Partial overlap → |A∩B|/|A∪B|
assert.equal(
	jaccardIndex(new Set(["a", "b"]), new Set(["b", "c"])),
	1 / 3,
	"scenario 3: partial overlap → 1/3",
);

// 4. Both empty → 0 (not NaN)
assert.equal(
	jaccardIndex(new Set(), new Set()),
	0,
	"scenario 4: both empty → 0",
);

// --- contextSignature ---

// 5. Signature is sorted +-joined domain set
assert.equal(
	contextSignature(ctx(["slack.com", "github.com"], 2)),
	"github.com+slack.com",
	"scenario 5: canonical signature",
);

// --- findSimilarContextsCore (§4.3) ---

// 6. Similar contexts to github+slack → github/slack contexts, sorted by Jaccard
{
	const target = ctx(["github.com", "slack.com"], 1);
	const similar = [
		ctx(["github.com", "slack.com", "jira.com"], 3), // jaccard 2/3
		ctx(["github.com"], 4), // jaccard 1/2
		ctx(["docs.com"], 5), // jaccard 0 (excluded)
	];
	const results = findSimilarContextsCore(target, [target, ...similar], 5);
	assert.equal(results.length, 2, "scenario 6: 2 results (docs excluded)");
	assert.equal(
		results[0].similarity,
		2 / 3,
		"scenario 6: highest similarity first",
	);
	assert.equal(
		results[0].sharedDomains.join("+"),
		"github.com+slack.com",
		"scenario 6: shared domains",
	);
}

// 7. Single context → no similar (excludes self)
{
	const target = ctx(["github.com", "slack.com"], 1);
	const results = findSimilarContextsCore(target, [target], 5);
	assert.equal(results.length, 0, "scenario 7: self excluded, no results");
}

// 8. limit caps results
{
	const target = ctx(["github.com"], 1);
	const candidates = [
		ctx(["github.com", "a.com"], 2),
		ctx(["github.com", "b.com"], 3),
		ctx(["github.com", "c.com"], 4),
	];
	const results = findSimilarContextsCore(target, candidates, 2);
	assert.equal(results.length, 2, "scenario 8: limited to 2");
}

// --- findSimilarMemoriesCore (§4.3) ---

// 9. Memories with overlapping signatures returned, sorted by Jaccard
{
	const target = ctx(["github.com", "slack.com"], 1);
	const memories = buildMemories(
		[ctx(["github.com", "slack.com"], 10), ctx(["github.com", "slack.com"], 8)],
		NOW,
	); // recurrent memory: github.com+slack.com
	// partial overlap: github.com + docs.com (dense enough to qualify as single)
	const partialMemory = buildMemories(
		[ctx(["github.com", "docs.com"], 6, [700, 100])],
		NOW,
	)[0];
	const results = findSimilarMemoriesCore(
		target,
		[...memories, partialMemory],
		5,
	);
	assert.equal(results.length, 2, "scenario 9: exact + partial overlap");
	assert.equal(results[0].similarity, 1, "scenario 9: exact match first");
	assert.equal(
		results[1].similarity,
		1 / 3,
		"scenario 9: partial overlap (github.com shared, docs.com/slack.com not)",
	);
}

// --- summarizeContextCore (§5.1) ---

// 10. Summary has sorted domains, observation, density
{
	const c = ctx(["github.com", "slack.com"], 1, [400, 100]);
	const summary = summarizeContextCore(c);
	assert.equal(
		summary.domainList.join("+"),
		"github.com+slack.com",
		"scenario 10: sorted by eventCount",
	);
	assert.ok(
		summary.observation.includes("visited github.com, slack.com"),
		"scenario 10: observation text",
	);
	assert.ok(
		summary.observation.includes("1 session"),
		"scenario 10: session count in observation",
	);
	assert.ok(summary.eventDensity > 0, "scenario 10: density computed");
}

// --- annotateTimelineCore (§5.3) ---

// 11. Timeline annotations: recurrent vs not
{
	const recurrentCtx = ctx(["github.com", "slack.com"], 1, [400, 100]);
	const singleCtx = ctx(["docs.com"], 2, [800]);
	const memories = buildMemories(
		[ctx(["github.com", "slack.com"], 10), ctx(["github.com", "slack.com"], 5)],
		NOW,
	);
	const timeline = annotateTimelineCore([recurrentCtx, singleCtx], memories);
	assert.equal(timeline.length, 2, "scenario 11: 2 entries");
	const recEntry = timeline.find((e) => e.context.id === recurrentCtx.id);
	assert.equal(recEntry?.isRecurrent, true, "scenario 11: recurrent annotated");
	assert.ok(recEntry?.memoryId, "scenario 11: memoryId set");
	const singleEntry = timeline.find((e) => e.context.id === singleCtx.id);
	assert.equal(
		singleEntry?.isRecurrent,
		false,
		"scenario 11: single not recurrent",
	);
	assert.equal(singleEntry?.memoryId, undefined, "scenario 11: no memoryId");
}

// --- Rebuild consistency (§9.2) ---

// 12. Deterministic output on repeated runs
{
	const contexts = [
		ctx(["github.com", "slack.com"], 1),
		ctx(["github.com", "slack.com", "jira.com"], 2),
		ctx(["docs.com"], 3),
	];
	const target = contexts[0];
	const candidates = contexts.slice(1);

	const a = findSimilarContextsCore(target, candidates);
	const b = findSimilarContextsCore(target, candidates);
	assert.deepEqual(a, b, "scenario 12: similarity rebuild consistency");

	const timelineA = annotateTimelineCore(
		contexts,
		buildMemories(contexts, NOW),
	);
	const timelineB = annotateTimelineCore(
		contexts,
		buildMemories(contexts, NOW),
	);
	assert.deepEqual(
		timelineA,
		timelineB,
		"scenario 12: timeline rebuild consistency",
	);
}

logger.info("retrieval.check: all assertions passed ✔");
