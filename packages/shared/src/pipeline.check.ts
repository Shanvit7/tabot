// packages/shared/src/pipeline.check.ts
// Phase 3 fixture H — end-to-end rebuildability: raw events → sessions → contexts → memories.
// Run the whole derivation twice against identical raw events; both runs must be deep-equal.
// Run: node --import ./resolve-hook.mjs src/pipeline.check.ts

import assert from "node:assert/strict";
import { buildContexts } from "./contexts.ts";
import type { StoredTabEvent } from "./db.ts";
import { logger } from "./logger.ts";
import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "./meaningful-events.ts";
import { buildMemories } from "./memories.ts";
import { sessionize } from "./sessions.ts";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

const ev = (
	timestamp: number,
	type: StoredTabEvent["type"],
	tabId: number,
	url?: string,
	windowId = 1,
): StoredTabEvent => ({
	id: `${timestamp}-${tabId}`,
	type,
	tabId,
	windowId,
	timestamp,
	url,
});

const run = (events: StoredTabEvent[]) => {
	const sessions = sessionize(events);
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	const contexts = buildContexts(sessions, transitions);
	const memories = buildMemories(contexts, 1_700_000_000_000 + 48 * 60 * MIN);
	return { sessions, contexts, memories };
};

// Fixture H — identical raw events → identical derived output on repeated runs
{
	// a realistic mixed stream: research chain + tab excursions + reading
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://deepseek.ai/harness"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://deepseek.ai/harness"),
		ev(T0 + 60_000, "SCROLL", 1),
		ev(T0 + 120_000, "NAVIGATION", 1, "https://google.com/search?q=amboras"),
		ev(T0 + 180_000, "NAVIGATION", 1, "https://amboras.ai"),
		ev(T0 + 240_000, "NAVIGATION", 1, "https://linkedin.com"),
		ev(T0 + 300_000, "TAB_ACTIVATED", 2, "https://github.com"),
		ev(T0 + 360_000, "TAB_ACTIVATED", 1, "https://linkedin.com"),
		ev(T0 + 420_000, "CLICK", 1),
		ev(T0 + 600_000, "PAGE_HIDDEN", 1),
		ev(T0 + 660_000, "PAGE_VISIBLE", 1),
		ev(T0 + 720_000, "SCROLL", 1),
		ev(T0 + 12 * MIN, "TAB_ACTIVATED", 3, "https://docs.google.com"),
		ev(T0 + 13 * MIN, "KEY_ACTIVITY", 3),
		ev(T0 + 14 * MIN, "SCROLL", 3),
	];

	const a = run(events);
	const b = run(events);

	assert.deepEqual(a.sessions, b.sessions, "fixture H: sessions rebuild equal");
	assert.deepEqual(a.contexts, b.contexts, "fixture H: contexts rebuild equal");
	assert.deepEqual(a.memories, b.memories, "fixture H: memories rebuild equal");
}

// Fixture I (step 9) — evidence grounding: inference null, no intent vocabulary, sequence present
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://deepseek.ai/harness"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://deepseek.ai/harness"),
		ev(T0 + 60_000, "NAVIGATION", 1, "https://google.com/search?q=amboras"),
		ev(T0 + 120_000, "NAVIGATION", 1, "https://amboras.ai"),
	];
	const { contexts, memories } = run(events);
	for (const c of contexts) {
		// mergeEvidence/sequence must be evidence-only (V7 vocabulary)
		for (const e of c.mergeEvidence ?? []) {
			assert.ok(
				/^same-origin-navigation$/.test(e),
				`fixture I: evidence string is observable rule, got: ${e}`,
			);
		}
	}
	for (const m of memories) {
		assert.equal(m.inference, null, "fixture I: memory inference null");
		assert.ok(
			!/stalk|intent|want|think|likely|probably/.test(m.observation),
			"fixture I: no intent vocabulary",
		);
	}
}

logger.info("pipeline.check: all assertions passed ✔");
