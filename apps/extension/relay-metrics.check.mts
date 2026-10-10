// Runs the real WebSocket handler against an in-memory stand-in for local IndexedDB.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import * as shared from "@tabot/shared";

const from = Date.now() - 60_000;
const to = from + 50_000;
const events = [
	"https://a.test/private",
	"https://b.test/?q=secret",
	"https://a.test/private",
].map((url, index) => ({
	id: `raw-${index}`,
	type: "NAVIGATION" as const,
	tabId: 1,
	windowId: 1,
	timestamp: from + index * 10_000,
	url,
}));
let reads = 0;
let fail = false;
const db = {
	events: {
		where: (index: string) => {
			assert.equal(index, "timestamp");
			return {
				between: (
					start: number,
					end: number,
					includeStart: boolean,
					includeEnd: boolean,
				) => {
					assert.deepEqual(
						[start, end, includeStart, includeEnd],
						[from, to, true, false],
					);
					return {
						toArray: async () => {
							reads++;
							if (fail) throw new Error("Local database unavailable");
							return events;
						},
					};
				},
			};
		},
	},
};
const pattern = (index: number): shared.Memory => ({
	id: `pattern-${index}`,
	kind: "recurrent",
	startTimestamp: from,
	endTimestamp: to,
	signature: "a.test+b.test",
	fingerprint: {
		domains: [],
		pageKeys: ["https://a.test/private"],
		orderedOrigins: ["https://a.test", "https://b.test"],
		orderedTransitions: [],
		interactionProfile: {
			duration: 20_000,
			eventDensity: 1,
			navigationRate: 1,
			interactionRate: 0,
		},
	},
	occurrences: [0, 1].map((offset) => ({
		contextId: `context-${index}-${offset}..context-${index}-${offset}`,
		startTimestamp: from + offset * 20_000,
		endTimestamp: from + offset * 20_000 + 10_000,
		domains: ["https://a.test", "https://b.test"],
		sequence: [
			"https://user:pw@a.test/private?q=secret",
			"https://a.test/another",
			"https://b.test/private",
			"chrome://history",
		],
	})),
	contextIds: [`context-${index}-0`, `context-${index}-1`],
	contextCount: 2,
	firstContextId: `context-${index}-0`,
	lastContextId: `context-${index}-1`,
	totalSessionCount: 2,
	totalEventCount: 10,
	lastSeen: to + index,
	firstSeen: from,
	staleness: 0,
	strength: 0.9,
	confidence: 0.86,
	evidence: {
		occurrenceCount: 2,
		temporalSpreadMs: 20_000,
		similarityScores: [0.86],
		sharedSequenceTokens: 2,
		sharedDomains: 2,
	},
	observation:
		"Recurring sequence: a.test → b.test. Contact alice@example.com.",
	inference: null,
});
let patterns = Array.from({ length: 25 }, (_, index) => pattern(index));
const single = { ...pattern(99), kind: "single" as const };
let patternReads = 0;
let failPrivacy = false;
mock.module("@tabot/shared", {
	namedExports: {
		...shared,
		createEventsDb: async () => db,
		getMemories: async (_db: unknown, limit: number) => {
			assert.equal(limit, 500);
			patternReads++;
			if (fail) throw new Error("Local database unavailable");
			return [single, ...patterns];
		},
		getMemoryById: async (_db: unknown, id: string) =>
			patterns.find((m) => m.id === id),
		sanitizeDerived: async (derived: shared.Derived) => {
			if (failPrivacy) throw new Error("Privacy boundary unavailable");
			return shared.sanitizeDerived(derived);
		},
	},
});
type PatternList = {
	patterns: { id: string }[];
	availablePatterns: number;
	truncated: boolean;
};
type MemoryReply = {
	found: boolean;
	memory: null | {
		contextIds: string[];
		orderedOrigins: string[];
		occurrences: {
			contextIds: string[];
			startTimestamp: number;
			endTimestamp: number;
			sequence: string[];
		}[];
		truncated: { occurrences: boolean; responseBudget: boolean };
	};
};
const responses: {
	requestId: string;
	result?: unknown;
	error?: { message: string };
}[] = [];
let receive: ((response: (typeof responses)[number]) => void) | undefined;
let socket: TestSocket;
class TestSocket {
	static OPEN = 1;
	readyState = 1;
	onmessage?: (event: { data: string }) => void;
	onopen?: () => void;
	onclose?: () => void;
	onerror?: () => void;
	constructor() {
		socket = this;
	}
	send(message: string) {
		const response = JSON.parse(message);
		responses.push(response);
		receive?.(response);
	}
}
const originalChrome = globalThis.chrome;
const originalWebSocket = globalThis.WebSocket;
globalThis.chrome = {
	storage: {
		local: {
			get: async (key: string) => ({
				[key]: { installationId: "test", token: "test" },
			}),
		},
	},
} as unknown as typeof chrome;
globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
const request = async <T = ReturnType<typeof shared.activityMetricsResponse>>(
	params: unknown,
	method = "get_activity_metrics",
) => {
	const requestId = `request-${responses.length}`;
	const response = await new Promise<(typeof responses)[number]>(
		(resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("Relay check timed out")),
				10_000,
			);
			receive = (value) => {
				clearTimeout(timeout);
				resolve(value);
			};
			socket.onmessage?.({
				data: JSON.stringify({ type: "request", method, requestId, params }),
			});
		},
	);
	assert.equal(response.requestId, requestId);
	return { ...response, result: response.result as T | undefined };
};
try {
	const { startRelay } = await import("./relay");
	startRelay();
	await nextTurn();
	const all = await request({ from, to });
	assert.deepEqual(
		all.result,
		shared.activityMetricsResponse(
			shared.buildActivityMetrics(events, from, to),
		),
	);
	const scoped = await request({ from, to, origin: "https://a.test" });
	assert.equal(scoped.result?.sites.length, 1);
	assert.equal(scoped.result?.sites[0].estimatedActiveMs, 10_000);
	assert.doesNotMatch(JSON.stringify(scoped.result), /private|secret|raw-/);
	const before = reads;
	assert.ok(
		(await request({ from, to, origin: "https://a.test/private" })).error,
	);
	assert.equal(reads, before, "invalid request rejected before database read");
	const originalPatterns = JSON.stringify(patterns);
	const discovery = (await request<PatternList>({}, "list_recurring_patterns"))
		.result;
	assert.equal(discovery?.patterns.length, 10);
	assert.equal(discovery?.patterns[0].id, "pattern-24");
	assert.equal(discovery?.availablePatterns, 25);
	assert.equal(discovery?.truncated, true);
	assert.doesNotMatch(
		JSON.stringify(discovery),
		/alice@example\.com|private|secret|user:pw|chrome:\/\//,
	);
	assert.doesNotMatch(
		JSON.stringify(discovery),
		/activityCount|totalEventCount/,
	);
	const limited = (
		await request<PatternList>({ limit: 1 }, "list_recurring_patterns")
	).result;
	assert.deepEqual(
		limited?.patterns.map((p) => p.id),
		["pattern-24"],
	);
	const beforePatterns = patternReads;
	for (const limit of [0, 21, -1, 1.5, "2", null])
		assert.ok((await request({ limit }, "list_recurring_patterns")).error);
	for (const params of [null, [], "bad"])
		assert.ok((await request(params, "list_recurring_patterns")).error);
	assert.equal(
		patternReads,
		beforePatterns,
		"invalid pattern input rejected before local read",
	);
	const evidence = (
		await request<MemoryReply>({ id: "pattern-24" }, "get_memory")
	).result;
	assert.ok(evidence?.found);
	assert.deepEqual(evidence.memory?.orderedOrigins, [
		"https://a.test",
		"https://b.test",
	]);
	assert.deepEqual(evidence.memory?.occurrences[0].sequence, [
		"https://a.test",
		"https://b.test",
	]);
	assert.deepEqual(
		evidence.memory?.occurrences.map((o) => [o.startTimestamp, o.endTimestamp]),
		[
			[from, from + 10_000],
			[from + 20_000, from + 30_000],
		],
	);
	assert.deepEqual(evidence.memory?.contextIds, [
		"context-24-0",
		"context-24-1",
	]);
	assert.doesNotMatch(
		JSON.stringify(evidence),
		/alice@example\.com|private|secret|user:pw|chrome:\/\//,
	);
	assert.doesNotMatch(
		JSON.stringify(evidence),
		/activityCount|totalEventCount/,
	);
	assert.equal(
		JSON.stringify(patterns),
		originalPatterns,
		"privacy projection must not mutate local evidence",
	);
	assert.equal(
		(await request<MemoryReply>({ id: "missing" }, "get_memory")).result?.found,
		false,
	);
	for (const id of ["", " ", "x".repeat(257), null, 1])
		assert.ok((await request({ id }, "get_memory")).error);
	const grouped = pattern(200);
	grouped.occurrences = [
		{
			...grouped.occurrences[0],
			contextId: `${grouped.contextIds[0]}..${grouped.contextIds[1]}`,
		},
	];
	patterns.push(grouped);
	const groupedEvidence = (
		await request<MemoryReply>({ id: grouped.id }, "get_memory")
	).result;
	assert.deepEqual(
		groupedEvidence?.memory?.occurrences[0].contextIds,
		grouped.contextIds,
		"occurrence range identifiers must resolve to actual get_context ids",
	);
	failPrivacy = true;
	for (const [method, params] of [
		["list_recurring_patterns", {}],
		["get_memory", { id: "pattern-24" }],
	] as const) {
		assert.equal(
			(await request(params, method)).error?.message,
			"Privacy boundary unavailable",
		);
	}
	failPrivacy = false;
	const big = pattern(100);
	const longOrigin = `https://${"a".repeat(240)}.test`;
	big.occurrences = Array.from({ length: 30 }, (_, index) => ({
		contextId: `context-big-${index}`,
		startTimestamp: from + index,
		endTimestamp: to,
		domains: Array.from({ length: 20 }, (_, i) =>
			longOrigin.replace("https://", `https://${i}`),
		),
		sequence: Array.from(
			{ length: 50 },
			(_, i) => `${longOrigin.replace("https://", `https://${i}`)}/private`,
		),
	}));
	big.contextIds = big.occurrences.map((o) => o.contextId);
	big.evidence.occurrenceCount = 30;
	patterns = [big];
	const bounded = (await request<MemoryReply>({ id: big.id }, "get_memory"))
		.result;
	assert.ok(JSON.stringify(bounded).length < 64_000);
	assert.equal(bounded?.memory?.truncated.occurrences, true);
	assert.equal(bounded?.memory?.truncated.responseBudget, true);
	assert.deepEqual(bounded?.memory?.occurrences.at(-1)?.contextIds, [
		"context-big-29",
	]);
	patterns = Array.from({ length: 20 }, (_, index) => ({
		...big,
		id: `long-pattern-${index}`,
		lastSeen: to + index,
		occurrences: big.occurrences.slice(-1),
		fingerprint: {
			...big.fingerprint,
			orderedOrigins: big.occurrences[0].sequence.map(
				(url) => new URL(url).origin,
			),
		},
	}));
	const boundedList = (
		await request<PatternList>({ limit: 20 }, "list_recurring_patterns")
	).result;
	assert.ok(JSON.stringify(boundedList).length <= 60_000);
	assert.ok(boundedList && boundedList.patterns.length < 20);
	assert.equal(boundedList.truncated, true);
	assert.equal(boundedList.availablePatterns, 20);
	assert.equal(boundedList.patterns[0].id, "long-pattern-19");
	patterns = [];
	const empty = (await request<PatternList>({}, "list_recurring_patterns"))
		.result;
	assert.deepEqual(empty?.patterns, []);
	assert.equal(empty?.availablePatterns, 0);
	fail = true;
	for (const [method, params] of [
		["get_activity_metrics", { from, to }],
		["list_recurring_patterns", {}],
	] as const) {
		assert.equal(
			(await request(params, method)).error?.message,
			"Local database unavailable",
		);
	}
	console.log(
		"Extension metrics + patterns relay passed: discovery, occurrence evidence, budgets, privacy, correlation, validation and errors.",
	);
} finally {
	mock.restoreAll();
	globalThis.chrome = originalChrome;
	globalThis.WebSocket = originalWebSocket;
}
