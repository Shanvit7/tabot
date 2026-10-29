// Exercises the public evidence-search dispatch against an in-memory store.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import * as shared from "@tabot/shared";

const searchResult = {
	url: "https://example.test/private/path?token=secret",
	host: "example.test",
	firstSeen: 10,
	lastSeen: 20,
	eventCount: 1,
	pageCount: 1,
	excerpt: "OAuth callback",
	pageExcerptAvailable: true,
	matchedTerms: ["oauth"],
	sources: [
		{
			kind: "event" as const,
			id: "event-1",
			timestamp: 10,
			url: "https://example.test/private/path?token=secret",
		},
		{
			kind: "page" as const,
			id: "page-1",
			timestamp: 20,
			url: "https://example.test/private/path?token=secret",
		},
	],
	sourceCount: 2,
	score: 1,
};
const relatedEvent = {
	id: "event-2",
	type: "NAVIGATION" as const,
	tabId: 1,
	windowId: 1,
	timestamp: 30,
	url: "https://example.test/private/path",
	source: { instanceId: "test-instance", sequence: 2, documentId: "doc-1" },
};
const relatedPage = {
	id: "page-2",
	kind: "page-observation" as const,
	timestamp: 40,
	tabId: 1,
	windowId: 1,
	pageKey: "page-key",
	captureIdentity: "capture-2",
	url: "https://example.test/related",
	trigger: "interaction" as const,
	segments: ["OAuth callback nonce verifier"],
	privacy: { policyVersion: 1, redacted: true, findings: [] },
	coverage: { truncated: false, partial: false },
};
const seedEvent = {
	...relatedEvent,
	id: "event-1",
	timestamp: 10,
	url: "https://example.test/private/path?token=secret",
};
const seedPage = {
	...relatedPage,
	id: "page-1",
	timestamp: 20,
	url: "https://example.test/private/path?token=secret",
	segments: ["OAuth callback nonce"],
};
const searchOptions: { limit?: number; offset?: number; to?: number }[] = [];
const db = {
	searchHistory: async (
		_query: string,
		options?: { limit?: number; offset?: number; to?: number },
	) => {
		searchOptions.push(options ?? {});
		return options?.offset
			? []
			: [searchResult, { ...searchResult, url: "https://other.test/path" }];
	},
	findEvent: async (id: string) =>
		id === seedEvent.id ? seedEvent : undefined,
	getPageObservation: async (id: string) =>
		id === seedPage.id ? seedPage : undefined,
	readRelatednessEvidence: async () => [relatedEvent, relatedPage],
};
mock.module("@tabot/shared", { namedExports: shared });
mock.module("../storage/client", {
	namedExports: { getStorageDb: async () => db },
});

const responses: {
	requestId: string;
	result?: unknown;
	error?: { message: string };
}[] = [];
let socket: TestSocket;
class TestSocket {
	static OPEN = 1;
	readyState = 1;
	onmessage?: (event: { data: string }) => void;
	constructor() {
		socket = this;
	}
	send(message: string) {
		responses.push(JSON.parse(message));
	}
}
const originalChrome = globalThis.chrome;
const originalWebSocket = globalThis.WebSocket;
globalThis.chrome = {
	storage: {
		local: {
			get: async () => ({
				tabot_relay_credentials: { installationId: "test", token: "test" },
			}),
		},
	},
} as unknown as typeof chrome;
globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
const request = async (method: string, params: unknown) => {
	const requestId = `request-${responses.length}`;
	socket.onmessage?.({
		data: JSON.stringify({ type: "request", method, requestId, params }),
	});
	await nextTurn();
	const response = responses.at(-1);
	assert.equal(response?.requestId, requestId);
	return response;
};
try {
	const { startRelay } = await import("./relay");
	startRelay();
	await nextTurn();
	const response = await request("search_evidence", {
		query: "OAuth",
		limit: 1,
	});
	assert.ok(response);
	const firstPage = response.result as {
		count: number;
		nextCursor: string;
		results: unknown[];
	};
	assert.equal(firstPage.count, 1);
	assert.match(firstPage.nextCursor, /^\d+:1$/);
	const json = JSON.stringify(firstPage.results);
	assert.match(json, /example\.test/);
	assert.doesNotMatch(json, /private|secret|relatedEvidence/);
	const nextPage = await request("search_evidence", {
		query: "OAuth",
		limit: 1,
		cursor: firstPage.nextCursor,
	});
	assert.ok(nextPage);
	assert.equal(
		(nextPage.result as { count: number; nextCursor: null }).nextCursor,
		null,
	);
	assert.equal(searchOptions.length, 2);
	assert.equal(searchOptions[0]?.limit, 2);
	assert.equal(searchOptions[1]?.offset, 1);
	assert.equal(searchOptions[0]?.to, searchOptions[1]?.to);
	const relatedPage1 = await request("find_related_evidence", {
		sources: [
			{ kind: "event", id: "event-1" },
			{ kind: "page", id: "page-1" },
		],
		limit: 1,
	});
	assert.ok(relatedPage1?.result, JSON.stringify(relatedPage1));
	const related = relatedPage1.result as {
		ranker: string;
		count: number;
		nextCursor: string | null;
		results: { id: string; signals: string[]; score: number }[];
	};
	assert.equal(related.ranker, "heuristic-v1");
	assert.equal(related.count, 1);
	assert.match(related.nextCursor ?? "", /^\d{1,16}:1$/);
	assert.ok(related.results[0]?.signals.includes("same_url"));
	assert.ok(related.results[0]?.score > 0);
	assert.ok(related.results[0]?.matchedSeedIds.includes("event-1"));
	assert.doesNotMatch(JSON.stringify(related.results), /private|secret/);
	assert.equal(related.results[0]?.kind, "event");
	const trailResponse = await request("get_evidence_trail", {
		sources: [{ kind: "event", id: "event-1" }],
		limit: 1,
	});
	assert.ok(trailResponse?.result);
	const trail = trailResponse.result as {
		trail: { id: string; role: string; timestamp: number }[];
	};
	assert.deepEqual(trail.trail.map(({ id }) => id), ["event-1", "event-2"]);
	assert.deepEqual(trail.trail.map(({ role }) => role), ["seed", "related"]);
	assert.doesNotMatch(JSON.stringify(trail), /private|secret/);
	const relatedPage2 = await request("find_related_evidence", {
		sources: [
			{ kind: "event", id: "event-1" },
			{ kind: "page", id: "page-1" },
		],
		limit: 1,
		cursor: related.nextCursor,
	});
	assert.ok(relatedPage2);
	const secondRelated = relatedPage2.result as {
		count: number;
		nextCursor: string | null;
	};
	assert.equal(secondRelated.count, 1);
	assert.equal(secondRelated.nextCursor, null);
	const invalidRelatedCursor = await request("find_related_evidence", {
		sources: [{ kind: "event", id: "event-1" }],
		cursor: `${Date.now() + 100_000}:1`,
	});
	assert.equal(
		invalidRelatedCursor?.error?.message,
		"cursor must be a valid next-page cursor.",
	);
	const invalidCursor = await request("search_evidence", {
		query: "OAuth",
		cursor: `${Date.now() + 100_000}:1`,
	});
	assert.equal(
		invalidCursor?.error?.message,
		"cursor must be a valid next-page cursor.",
	);
	assert.equal(searchOptions.length, 2);
	const removed = await request("get_current_context", {});
	assert.equal(
		removed?.error?.message,
		"Method not implemented: get_current_context",
	);
	console.log(
		"Extension evidence relay passed: direct search projection and legacy dispatch removal.",
	);
} finally {
	mock.restoreAll();
	globalThis.chrome = originalChrome;
	globalThis.WebSocket = originalWebSocket;
}
