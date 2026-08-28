// packages/shared/src/v5regression.check.ts
// V5 regression suite (Downloads/prompt-v5-segmentation-memory-fix.md §21).
// Replays a real export's raw events through the full derivation chain and
// asserts the invariants the V5 prompt requires:
//   §2.1  context event accounting  — sum(ctx.eventCount) <= raw events
//   §2.2  sequence locality         — no eventCount=0 + long sequence
//   §4/§9 segmentation             — no giant episode, tiny cleanup works
//   §11/§16 memory quality         — no low-info singleton memories
//   §15   recurrence requires separate occurrences
//   §22   rebuild determinism
// Usage: node --import ./resolve-hook.mjs src/v5regression.check.ts

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildContexts } from "./contexts";
import { logger } from "./logger";
import { deriveMeaningfulEvents, deriveTransitions } from "./meaningful-events";
import { buildMemories } from "./memories";
import { sessionize } from "./sessions";

const file =
	process.argv[2] ??
	"/Users/zosmaai/Downloads/tabot-export-2026-08-27 (4).jsonl";
const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
const events = [];
for (const line of lines) {
	const d = JSON.parse(line);
	if (d.record === "event") {
		events.push({
			id: d.id,
			type: d.type,
			tabId: d.tabId,
			windowId: d.windowId,
			timestamp: d.timestamp,
			url: d.url,
		});
	}
}
events.sort((a, b) => a.timestamp - b.timestamp);

const sessions = sessionize(events);
const transitions = deriveTransitions(deriveMeaningfulEvents(events));
const contexts = buildContexts(sessions, transitions);
const memories = buildMemories(contexts, events[events.length - 1].timestamp);

console.log(
	`V5 regression: ${events.length} raw → ${sessions.length} sessions → ${contexts.length} contexts → ${memories.length} memories`,
);

// §2.1 — event accounting: contexts partition activity, no double-count
const ctxEventSum = contexts.reduce((s, c) => s + c.totalEventCount, 0);
assert.ok(
	ctxEventSum <= events.length,
	`§2.1 context eventCount sum ${ctxEventSum} must be <= raw ${events.length}`,
);
console.log(`  §2.1 accounting: ${ctxEventSum} <= ${events.length} ok`);

// §2.2 — sequence locality: no context with 0 events but a long sequence
for (const c of contexts) {
	const seqLen = (c.sequence ?? []).length;
	if (c.totalEventCount === 0) {
		assert.ok(
			seqLen === 0,
			`§2.2 context ${c.id} has eventCount=0 but sequence length ${seqLen}`,
		);
	}
	assert.ok(
		seqLen <= Math.max(1, c.totalEventCount) * 2,
		`§2.2 context ${c.id} sequence (${seqLen}) > 2x eventCount (${c.totalEventCount})`,
	);
}
console.log(`  §2.2 sequence locality ok (${contexts.length} contexts)`);

// §4 — no giant episode: the largest episode must be a fraction of the stream
const episodes = contexts.flatMap((c) => c.episodes ?? []);
const largest = episodes.reduce((a, b) =>
	b.totalEventCount > a.totalEventCount ? b : a,
);
assert.ok(
	largest.totalEventCount < events.length * 0.3,
	`§4 largest episode ${largest.totalEventCount} (${Math.round((largest.totalEventCount / events.length) * 100)}%) must be < 30% of the stream`,
);
console.log(
	`  §4 largest episode: ${largest.totalEventCount} events (${Math.round((largest.totalEventCount / events.length) * 100)}% of stream) ok`,
);

// §9 — tiny episodes are the minority
const tiny = episodes.filter((e) => e.totalEventCount <= 3);
assert.ok(
	tiny.length / episodes.length < 0.3,
	`§9 tiny episodes ${tiny.length}/${episodes.length} must be < 30%`,
);
console.log(`  §9 tiny episodes: ${tiny.length}/${episodes.length} ok`);

// §11/§16 — memory quality: no low-info singleton generic memories
const GENERIC = new Set([
	"www.google.com",
	"google.com",
	"chatgpt.com",
	"www.chatgpt.com",
	"search.yahoo.com",
	"www.youtube.com",
	"newtab",
	"",
]);
const hostOf = (s: string): string => {
	try {
		return new URL(s).hostname;
	} catch {
		return s;
	}
};
const lowInfo = memories.filter((m) => {
	const origins = m.fingerprint?.orderedOrigins ?? [];
	return (
		origins.length === 1 &&
		(m.fingerprint?.orderedTransitions?.length ?? 0) === 0 &&
		GENERIC.has(hostOf(origins[0]))
	);
});
assert.equal(
	lowInfo.length,
	0,
	`§16 low-info singleton memories must be 0, got: ${lowInfo.map((m) => m.signature).join(", ")}`,
);
console.log(`  §16 low-info singleton memories: ${lowInfo.length} ok`);

// §15 — recurrence requires separate occurrences
for (const m of memories) {
	if (m.kind === "recurrent") {
		assert.ok(
			m.occurrences.length >= 2,
			`§15 memory ${m.signature} is recurrent but has ${m.occurrences.length} occurrence(s)`,
		);
	}
}
console.log("  §15 recurrence has separate occurrences ok");

// §16 — no empty-identity memories
const empty = memories.filter(
	(m) =>
		(m.fingerprint?.domains?.length ?? 0) === 0 &&
		(m.fingerprint?.orderedOrigins?.length ?? 0) === 0,
);
assert.equal(empty.length, 0, "§16 empty-identity memories must be 0");
console.log("  §16 empty-identity memories: 0 ok");

// §22 — rebuild determinism: same raw events twice → same derivation
const sessions2 = sessionize(events);
const contexts2 = buildContexts(sessions2, transitions);
const memories2 = buildMemories(contexts2, events[events.length - 1].timestamp);
assert.deepEqual(
	contexts.map((c) => c.id),
	contexts2.map((c) => c.id),
	"§22 rebuild: same contexts",
);
assert.deepEqual(
	memories.map((m) => m.id),
	memories2.map((m) => m.id),
	"§22 rebuild: same memories",
);
console.log("  §22 rebuild determinism ok");

logger.info("v5regression.check — all assertions passed");
