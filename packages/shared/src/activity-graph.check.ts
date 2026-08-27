// packages/shared/src/activity-graph.check.ts
// V6 — Activity Graph regression tests (docs/tabot-graph-activity-plan.md §22).
// Run: node --import ./resolve-hook.mjs src/activity-graph.check.ts

import assert from "node:assert/strict";
import {
	buildActivityAnchors,
	buildActivityGraph,
	extractActivityEpisodes,
} from "./activity-graph.ts";
import { buildContexts, CONTEXT_THRESHOLDS } from "./contexts.ts";
import type { StoredTabEvent } from "./db.ts";
import { logger } from "./logger.ts";
import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "./meaningful-events.ts";
import { sessionize } from "./sessions.ts";

const MIN = 60_000;
const T0 = 1_700_000_000_000;
let id = 0;

const ev = (
	ts: number,
	type: StoredTabEvent["type"],
	tabId: number,
	url?: string,
): StoredTabEvent => ({
	id: `${++id}`,
	type,
	tabId,
	windowId: 1,
	timestamp: ts,
	url,
});

// walk: NAVIGATION + SCROLL pairs, 30s apart — dense enough to stay one session
const walk = (seq: Array<[string, number]>): StoredTabEvent[] => {
	const out: StoredTabEvent[] = [];
	for (const [url, m] of seq) {
		out.push(ev(T0 + m * MIN, "NAVIGATION", 1, url));
		out.push(ev(T0 + m * MIN + 30_000, "SCROLL", 1));
	}
	return out;
};

const derive = (events: StoredTabEvent[]) => {
	const sessions = sessionize(events);
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	const contexts = buildContexts(sessions, transitions);
	return { sessions, contexts };
};

// graph-cross-domain-research: DeepSeek → Google → Amboras → LinkedIn is ONE
// coherent episode/context with the ordered sequence retained.
{
	const events = walk([
		["https://deepseek.ai/harness", 0],
		["https://www.google.com/search?q=amboras", 3],
		["https://amboras.ai", 6],
		["https://linkedin.com", 9],
	]);
	const { sessions, contexts } = derive(events);
	const anchors = buildActivityAnchors(sessions);
	const graph = buildActivityGraph(anchors);
	const episodes = extractActivityEpisodes(anchors, graph);
	assert.equal(episodes.length, 1, "graph-cross-domain-research: one episode");
	assert.equal(contexts.length, 1, "graph-cross-domain-research: one context");
	const seq = (contexts[0]?.sequence ?? []).map((s) =>
		s.split("://")[1]?.replace(/\/.*$/, ""),
	);
	assert.deepEqual(
		seq,
		["deepseek.ai", "www.google.com", "amboras.ai", "linkedin.com"],
		"graph-cross-domain-research: ordered sequence",
	);
}

// graph-same-origin-navigation: a 40-minute run across an app stays one episode
// (same-origin edges keep it coherent), but the same-origin alone is NOT
// transitive context membership.
{
	const events = walk([
		["http://localhost:3000/payments", 0],
		["http://localhost:3000/reports", 2],
		["http://localhost:3000/litigation", 4],
		["http://localhost:3000/analytics", 6],
	]);
	const { contexts } = derive(events);
	assert.equal(contexts.length, 1, "graph-same-origin-navigation: one context");
	assert.equal(
		contexts[0]?.domains.length,
		1,
		"graph-same-origin-navigation: single origin",
	);
}

// graph-same-tab-does-not-merge: same tab across a long gap / unrelated task is
// NOT one episode.
{
	const events: StoredTabEvent[] = [
		ev(T0, "NAVIGATION", 1, "https://task-a.com/work"),
		ev(T0 + 30_000, "SCROLL", 1),
		ev(T0 + 45 * MIN, "NAVIGATION", 1, "https://task-b.com/work"),
		ev(T0 + 45 * MIN + 30_000, "SCROLL", 1),
	];
	const { contexts } = derive(events);
	assert.equal(
		contexts.length,
		2,
		"graph-same-tab-does-not-merge: long gap splits",
	);
}

// graph-short-return: A → B → A within the excursion window is one context with
// a bounded excursion.
{
	const events = walk([
		["https://app.example.com", 0],
		["https://www.google.com", 1],
		["https://github.com", 2],
		["https://app.example.com", 3],
	]);
	const { contexts } = derive(events);
	assert.equal(contexts.length, 1, "graph-short-return: one context");
	for (const c of contexts) {
		for (const ex of c.excursions ?? []) {
			assert.ok(
				ex.end - ex.start <= CONTEXT_THRESHOLDS.EXCURSION_RETURN_WINDOW_MS,
				"graph-excursion-window: excursion obeys the hard window",
			);
		}
	}
}

// graph-long-return: A → unrelated activity → A after the window is a
// recurrence, not an excursion, and not one fused context.
{
	const events = walk([
		["https://app.example.com", 0],
		["https://www.google.com", 5],
		["https://pints.ai", 10],
		["https://chatgpt.com", 15],
		["https://github.com", 20],
		["https://app.example.com", 30],
	]);
	const { contexts } = derive(events);
	assert.ok(
		contexts.length > 1,
		"graph-long-return: recurrence splits (not one giant context)",
	);
	for (const c of contexts) {
		for (const ex of c.excursions ?? []) {
			assert.ok(
				ex.end - ex.start <= CONTEXT_THRESHOLDS.EXCURSION_RETURN_WINDOW_MS,
				"graph-excursion-window: no long excursion",
			);
		}
	}
}

// graph-local-context-boundary: localhost monster (legal → LinkedIn → research
// → ChatGPT → legal) decomposes into multiple episodes/contexts, not one atomic
// activity.
{
	const events = walk([
		["http://localhost:3000/payments", 0],
		["http://localhost:3000/reports", 2],
		["http://localhost:3000/litigation", 4],
		["https://linkedin.com/in/xyz", 6],
		["https://pints.ai", 8],
		["https://www.google.com/search?q=amboras", 10],
		["https://amboras.ai", 12],
		["https://chatgpt.com", 14],
		["http://localhost:3000/advocates", 18],
		["http://localhost:3000/analytics", 20],
	]);
	const { contexts } = derive(events);
	assert.ok(
		contexts.length >= 3,
		"graph-local-context-boundary: monster decomposes",
	);
	const legal = contexts.filter(
		(c) => c.primaryDomain === "http://localhost:3000",
	);
	assert.ok(
		legal.length >= 2,
		"graph-local-context-boundary: legal work recurs as its own episodes",
	);
}

// graph-no-transitive-overmerge: a weak chain A→B→C→D→E never fuses into one
// giant context even when each hop is a same-tab transition.
{
	const events: StoredTabEvent[] = [];
	const chain: Array<[string, number]> = [
		["https://a.com", 0],
		["https://b.com", 6],
		["https://c.com", 12],
		["https://d.com", 18],
		["https://e.com", 24],
	];
	for (const [url, m] of chain) {
		events.push(ev(T0 + m * MIN, "NAVIGATION", 1, url));
		events.push(ev(T0 + m * MIN + 30_000, "SCROLL", 1));
	}
	const { sessions, contexts } = derive(events);
	// 6m-apart navigations keep sessions apart (5m inactivity threshold)
	assert.ok(
		sessions.length >= 3,
		"graph-no-transitive-overmerge: sessions split",
	);
	assert.ok(
		contexts.length >= 3,
		"graph-no-transitive-overmerge: no giant fused context",
	);
	assert.ok(
		contexts.every((c) => c.duration <= CONTEXT_THRESHOLDS.MAX_CONTEXT_SPAN_MS),
		"graph-no-transitive-overmerge: span bound holds",
	);
}

// graph-context-local-sequence: a context's sequence contains only context-owned
// activity.
{
	const events: StoredTabEvent[] = [
		// pre-context: youtube
		ev(T0 - 30 * MIN, "NAVIGATION", 2, "https://youtube.com/watch"),
		ev(T0 - 30 * MIN + 30_000, "SCROLL", 2),
		// the context: github proj-a → proj-b (short gap)
		ev(T0, "NAVIGATION", 1, "https://github.com/proj-a"),
		ev(T0 + 30_000, "SCROLL", 1),
		ev(T0 + 2 * MIN, "NAVIGATION", 1, "https://github.com/proj-b"),
		ev(T0 + 2 * MIN + 30_000, "SCROLL", 1),
		// post-context: google
		ev(T0 + 30 * MIN, "NAVIGATION", 2, "https://www.google.com/search"),
		ev(T0 + 30 * MIN + 30_000, "SCROLL", 2),
	];
	const { contexts } = derive(events);
	const middle = contexts.find((c) => c.primaryDomain === "https://github.com");
	assert.ok(middle, "graph-context-local-sequence: middle context found");
	assert.ok(
		middle?.sequence?.every((k) => k.includes("github.com")),
		"graph-context-local-sequence: sequence contains ONLY context activity",
	);
	assert.ok(
		!middle?.sequence?.some(
			(k) => k.includes("youtube") || k.includes("google"),
		),
		"graph-context-local-sequence: no leaked global transitions",
	);
}

// determinism: same input → identical output (rebuild §12/§27)
{
	const events = walk([
		["https://deepseek.ai/harness", 0],
		["https://www.google.com/search?q=amboras", 3],
		["https://amboras.ai", 6],
		["https://linkedin.com", 9],
	]);
	const a = JSON.stringify(derive(events));
	const b = JSON.stringify(derive(events));
	assert.equal(a, b, "graph-rebuild: deterministic");
}

logger.info("activity-graph.check: all assertions passed ✔");
