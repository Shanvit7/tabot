// packages/shared/src/pipeline.check.ts
// Phase 3 fixture H — end-to-end rebuildability: raw events → sessions → contexts → memories.
// Run the whole derivation twice against identical raw events; both runs must be deep-equal.
// Run: node --import ./resolve-hook.mjs src/pipeline.check.ts

import assert from "node:assert/strict";
import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events.ts";
import {
	buildContexts,
	getContextById,
	getContexts,
	getRecentContexts,
} from "../contexts/contexts";
import type { StoredTabEvent, TabotDatabase } from "../events/db";
import { logger } from "../lib/logger.ts";
import {
	buildMemories,
	getMemories,
	getMemoriesBySignature,
	getMemoryById,
} from "../memories/memories";
import { sessionize } from "../sessions/sessions.ts";
import { derive } from "../share/export";

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

// Dashboard and database APIs must derive identical IDs and classification,
// even beyond the former 500-session/context window.
{
	const visit = (index: number, site: string): StoredTabEvent[] => {
		const start = T0 + index * 60 * MIN;
		return [
			ev(start, "TAB_ACTIVATED", 1, `https://${site}.test/start`),
			ev(start + MIN, "NAVIGATION", 1, `https://${site}-docs.test/private`),
			ev(start + 2 * MIN, "SCROLL", 1, `https://${site}-docs.test/private`),
		];
	};
	const events = Array.from({ length: 503 }, (_, index) =>
		visit(index, index < 2 ? "target" : "other"),
	).flat();
	const db = {
		events: { toArray: async () => events },
	} as unknown as TabotDatabase;
	const dashboard = derive(events);
	assert.ok(dashboard.sessions.length > 500);
	assert.ok(dashboard.contexts.length > 500);
	const target = dashboard.memories.find((memory) =>
		memory.fingerprint.orderedOrigins.includes("https://target.test"),
	);
	assert.ok(target && target.kind === "recurrent");
	assert.equal(target.evidence.occurrenceCount, 2);
	assert.ok(
		dashboard.contexts.every(
			(context) => context.endTimestamp - context.startTimestamp <= 2 * MIN,
		),
		"episode cleanup must not merge either neighbor across inactivity gaps",
	);
	assert.deepEqual(await getContexts(db), dashboard.contexts);
	assert.deepEqual(
		await getRecentContexts(db, 3),
		dashboard.contexts.slice(-3),
		"recent reads must select after derivation, preserving IDs and evidence",
	);
	const shape = (memory: (typeof dashboard.memories)[number]) => ({
		id: memory.id,
		kind: memory.kind,
		contextIds: memory.contextIds,
		fingerprint: memory.fingerprint,
		occurrences: memory.occurrences,
		evidence: memory.evidence,
	});
	assert.deepEqual(
		(await getMemories(db, Number.MAX_SAFE_INTEGER)).map(shape),
		dashboard.memories.map(shape),
		"MCP and dashboard must retain the same recurring patterns",
	);
	const retrieved = await getMemoryById(db, target.id);
	assert.ok(retrieved);
	assert.deepEqual(shape(retrieved), shape(target));
	assert.deepEqual(
		(await getMemoriesBySignature(db, target.signature)).map(shape),
		[target].map(shape),
	);
	for (const id of target.contextIds) {
		assert.deepEqual(
			await getContextById(db, id),
			dashboard.contexts.find((context) => context.id === id),
		);
	}
	// A new occurrence extends the composite ID; existing dashboard prompts
	// must still retrieve this pattern, never an unrelated substitute.
	events.push(...visit(503, "target"));
	const updated = derive(events).memories.find((memory) =>
		memory.contextIds.includes(target.firstContextId),
	);
	assert.ok(updated && updated.id !== target.id);
	assert.equal((await getMemoryById(db, target.id))?.id, updated.id);
	assert.equal(await getMemoryById(db, "missing"), undefined);
	assert.equal(
		await getMemoryById(
			db,
			`${target.firstContextId}-${updated.lastContextId}-invalid`,
		),
		undefined,
	);
}

logger.info("pipeline.check: all assertions passed ✔");
