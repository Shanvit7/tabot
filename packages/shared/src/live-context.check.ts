// packages/shared/src/live-context.check.ts
// Runnable self-check for the live context layer — covers docs/tech.md §8.1 scenarios + §8.2 rebuild consistency.
// Tests the pure core (buildLiveContext) against constructed contexts/events.
// Run: node --import ./resolve-hook.mjs src/live-context.check.ts

import assert from "node:assert/strict";
import type { BrowserContext, ContextDomain } from "./contexts.ts";
import type { StoredTabEvent } from "./db.ts";
import { buildLiveContext } from "./live-context.ts";
import { logger } from "./logger.ts";

const NOW = 1_700_000_000_000; // fixed reference
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

let seq = 0;

const ev = (
	timestamp: number,
	type: StoredTabEvent["type"],
	tabId: number,
	windowId = 1,
	url?: string,
): StoredTabEvent => ({
	id: `${timestamp}-${tabId}-${windowId}`,
	type,
	tabId,
	windowId,
	timestamp,
	url,
});

const ctx = (
	domains: string[],
	startOffsetDay: number,
	durationMs: number,
	interactions: number,
	eventCount: number,
): BrowserContext => {
	const start = NOW - startOffsetDay * DAY;
	const end = start + durationMs;
	const domainList: ContextDomain[] = domains.map((d) => ({
		domain: d,
		eventCount: 100,
		sessionCount: 1,
		sessionIds: [`s-${++seq}`],
		firstSeen: start,
		lastSeen: end,
	}));
	return {
		id: `ctx-${++seq}`,
		startTimestamp: start,
		endTimestamp: end,
		duration: durationMs,
		sessionIds: domainList.map((d) => d.sessionIds[0]),
		sessionCount: 1,
		domains: domainList,
		totalEventCount: eventCount,
		totalInteractionCount: interactions,
		totalNavigationCount: 2,
		totalTabSwitchCount: 1,
		recurrenceCount: 1,
		primaryDomain: domainList[0]?.domain ?? "",
	};
};

// --- 1. Continuous browsing (1 context, high interaction) ---
{
	const c = ctx(["github.com", "slack.com"], 0, 30 * MIN, 60, 500);
	const events = [
		ev(NOW - 10 * MIN, "TAB_ACTIVATED", 5, 2, "https://github.com"),
		ev(NOW - 5 * MIN, "NAVIGATION", 5, 2, "https://github.com/pulls"),
		ev(NOW - 1 * MIN, "SCROLL", 5, 2),
	];
	const live = buildLiveContext({
		currentContext: c,
		events,
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(
		live.currentContext?.id,
		c.id,
		"scenario 1: current context set",
	);
	assert.equal(live.activeTabId, 5, "scenario 1: last activated tab");
	assert.equal(live.activeWindowId, 2, "scenario 1: last activated window");
	assert.equal(
		live.currentUrl,
		"https://github.com/pulls",
		"scenario 1: last navigation URL",
	);
	assert.equal(
		live.interactionIntensity,
		60 / ((30 * MIN) / 60000), // 60 interactions / 30 min = 2/min
		"scenario 1: high interaction intensity",
	);
	assert.deepEqual(
		live.recentNavigations,
		["https://github.com/pulls"],
		"scenario 1: recent navigations",
	);
	assert.equal(live.evidence.eventCount, 500, "scenario 1: event count");
	assert.equal(
		live.evidence.staleness,
		NOW - (NOW + 30 * MIN),
		"scenario 1: staleness = now - endTimestamp",
	);
}

// --- 2. No events yet ---
{
	const live = buildLiveContext({
		currentContext: undefined,
		events: [],
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(
		live.currentContext,
		undefined,
		"scenario 2: no current context",
	);
	assert.equal(live.activeTabId, 0, "scenario 2: no active tab");
	assert.equal(live.activeWindowId, 0, "scenario 2: no active window");
	assert.equal(live.currentUrl, undefined, "scenario 2: no current URL");
	assert.equal(live.interactionIntensity, 0, "scenario 2: no intensity");
	assert.deepEqual(live.recentNavigations, [], "scenario 2: no navigations");
	assert.equal(live.evidence.eventCount, 0, "scenario 2: no events");
	assert.equal(live.evidence.staleness, 0, "scenario 2: no staleness");
}

// --- 3. Single context, no related contexts/memories ---
{
	const c = ctx(["docs.com"], 1, 60 * MIN, 10, 300);
	const live = buildLiveContext({
		currentContext: c,
		events: [ev(NOW - MIN, "TAB_ACTIVATED", 1, 1, "https://docs.com")],
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(
		live.relatedContexts.length,
		0,
		"scenario 3: no related contexts",
	);
	assert.equal(
		live.relatedMemories.length,
		0,
		"scenario 3: no related memories",
	);
}

// --- 4. Rapid navigation (10 URL changes) — limit defaults to 10, newest first ---
{
	const events = Array.from({ length: 15 }, (_, i) =>
		ev(NOW - (15 - i) * 1000, "NAVIGATION", 1, 1, `https://site${i}.com`),
	);
	const live = buildLiveContext({
		currentContext: undefined,
		events,
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(live.recentNavigations.length, 10, "scenario 4: bounded to 10");
	assert.equal(
		live.recentNavigations[0],
		"https://site14.com",
		"scenario 4: newest first",
	);
	assert.equal(
		live.recentNavigations[9],
		"https://site5.com",
		"scenario 4: oldest kept is 10th",
	);
}

// --- 5. Related contexts included ---
{
	const current = ctx(["github.com", "slack.com"], 0, 30 * MIN, 30, 400);
	const related = ctx(
		["github.com", "slack.com", "jira.com"],
		2,
		60 * MIN,
		20,
		300,
	);
	const live = buildLiveContext({
		currentContext: current,
		events: [],
		relatedContexts: [
			{
				context: related,
				similarity: 2 / 3,
				sharedDomains: ["github.com", "slack.com"],
			},
		],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(live.relatedContexts.length, 1, "scenario 5: related context");
	assert.equal(
		live.relatedContexts[0].context.id,
		related.id,
		"scenario 5: correct context",
	);
	assert.equal(
		live.relatedContexts[0].similarity,
		2 / 3,
		"scenario 5: similarity surfaced",
	);
}

// --- 6. Related memories included ---
{
	const current = ctx(["github.com", "slack.com"], 0, 30 * MIN, 30, 400);
	const memory = {
		id: "mem-1",
		kind: "recurrent" as const,
		startTimestamp: NOW - 30 * DAY,
		endTimestamp: NOW - 2 * DAY,
		signature: "github.com+slack.com",
		fingerprint: {
			domains: [
				{ domain: "github.com", weight: 1000 },
				{ domain: "slack.com", weight: 800 },
			],
			pageKeys: [],
			orderedOrigins: ["github.com", "slack.com"],
			orderedTransitions: ["github.com→slack.com"],
			interactionProfile: {
				duration: 30 * MIN,
				eventDensity: 1800 / (30 * 60 + 1),
				navigationRate: 0.1,
				interactionRate: 0.5,
			},
			entryOrigin: "github.com",
			exitOrigin: "slack.com",
		},
		occurrences: [
			{
				contextId: "c1",
				startTimestamp: NOW - 30 * DAY,
				endTimestamp: NOW - 2 * DAY,
				domains: ["github.com", "slack.com"],
				sequence: [],
			},
		],
		confidence: 0.8,
		evidence: {
			occurrenceCount: 1,
			temporalSpreadMs: 0,
			similarityScores: [],
			sharedSequenceTokens: 2,
			sharedDomains: 2,
		},
		domains: [
			{
				domain: "github.com",
				eventCount: 1000,
				contextCount: 3,
				contextIds: ["c1", "c2", "c3"],
				firstSeen: NOW - 30 * DAY,
				lastSeen: NOW - 2 * DAY,
			},
			{
				domain: "slack.com",
				eventCount: 800,
				contextCount: 3,
				contextIds: ["c1", "c2", "c3"],
				firstSeen: NOW - 30 * DAY,
				lastSeen: NOW - 2 * DAY,
			},
		],
		contextIds: ["c1", "c2", "c3"],
		contextCount: 3,
		firstContextId: "c1",
		lastContextId: "c3",
		totalSessionCount: 7,
		totalEventCount: 1800,
		firstSeen: NOW - 30 * DAY,
		lastSeen: NOW - 2 * DAY,
		strength: 6,
		staleness: 2 * DAY,
		observation: "visited github.com, slack.com across 3 activity periods",
		inference: null,
	};
	const live = buildLiveContext({
		currentContext: current,
		events: [],
		relatedContexts: [],
		relatedMemories: [
			{
				memory,
				similarity: 1,
				sharedDomains: ["github.com", "slack.com"],
			},
		],
		now: NOW,
	});
	assert.equal(live.relatedMemories.length, 1, "scenario 6: related memory");
	assert.equal(
		live.relatedMemories[0].memory.kind,
		"recurrent",
		"scenario 6: recurrent memory",
	);
	assert.equal(live.relatedMemories[0].similarity, 1, "scenario 6: similarity");
}

// --- 7. Stale context (ended 24h ago) ---
{
	const c = ctx(["docs.com"], 1, 30 * MIN, 10, 200);
	const live = buildLiveContext({
		currentContext: c,
		events: [],
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	const expectedStaleness = NOW - (NOW - 1 * DAY + 30 * MIN);
	assert.equal(
		live.evidence.staleness,
		expectedStaleness,
		"scenario 7: staleness ≈ 24h",
	);
}

// --- 8. Low interaction intensity (few events, long duration) ---
{
	const c = ctx(["read.com"], 0, 60 * MIN, 5, 100);
	const live = buildLiveContext({
		currentContext: c,
		events: [],
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(
		live.interactionIntensity,
		5 / ((60 * MIN) / 60000), // 5 interactions / 60 min = 0.083/min
		"scenario 8: low intensity",
	);
	assert.ok(
		live.interactionIntensity < 1,
		"scenario 8: intensity below 1 event/min",
	);
}

// --- 9. No NAVIGATION events ---
{
	const c = ctx(["a.com"], 0, 30 * MIN, 10, 200);
	const live = buildLiveContext({
		currentContext: c,
		events: [ev(NOW - MIN, "TAB_ACTIVATED", 1, 1)],
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	});
	assert.equal(live.currentUrl, undefined, "scenario 9: no current URL");
	assert.deepEqual(live.recentNavigations, [], "scenario 9: no navigations");
	assert.equal(live.activeTabId, 1, "scenario 9: active tab still works");
}

// --- 10. Rebuild consistency (§8.2) ---
{
	const c = ctx(["github.com"], 0, 30 * MIN, 20, 300);
	const events = [
		ev(NOW - 10 * MIN, "TAB_ACTIVATED", 3, 1),
		ev(NOW - 5 * MIN, "NAVIGATION", 3, 1, "https://github.com/x"),
	];
	const inputs = {
		currentContext: c,
		events,
		relatedContexts: [],
		relatedMemories: [],
		now: NOW,
	};
	const a = buildLiveContext(inputs);
	const b = buildLiveContext(inputs);
	assert.deepEqual(a, b, "scenario 10: rebuild consistency");
}

logger.info("live-context.check: all assertions passed ✔");
