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
const savedWorkflowScripts: unknown[][] = [];
const db = {
	getPendingWorkflowHandoff: async () => ({
		payload: {
			candidateId: "handwired-v1-1234abcd",
			sites: [
				"https://www.linkedin.com",
				"https://google.com",
				"https://www.linkedin.com",
			],
			occurrences: 2,
			modelMatches: 3,
			firstAt: 100,
			lastAt: 200,
			evidenceType: "site-navigation-only",
		},
		grant: {
			token: "123e4567-e89b-42d3-a456-426614174000",
			candidateId: "handwired-v1-1234abcd",
			expiresAt: Date.now() + 60_000,
			origins: ["https://www.linkedin.com", "https://google.com"],
			handoffDigest: "a".repeat(64),
		},
	}),
	saveWorkflowScriptDraft: async (...args: unknown[]) => {
		savedWorkflowScripts.push(args);
		return {
			id: "draft-id",
			candidateId: "handwired-v1-1234abcd",
			savedAt: 1,
			status: "draft",
			script: args[3],
		};
	},
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
	readRelatedActivity: async (
		_anchors: number[],
		_pageKeys: string[],
		_origins: string[],
		_seedIds: string[],
		_gap: number,
		_limit: number,
		offset: number,
	) => (offset ? [relatedPage] : [relatedEvent, relatedPage]),
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
const originalFetch = globalThis.fetch;
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
globalThis.fetch = (async (input) => {
	const url = String(input);
	if (url.endsWith("/ping"))
		return new Response(JSON.stringify({ ok: true, result: { pong: true } }));
	if (url.endsWith("/connection"))
		return new Response(
			JSON.stringify({ chatgpt: true, claude: false, order: ["chatgpt"] }),
		);
	return new Response(null, { status: 404 });
}) as typeof fetch;
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
	const { runRelaySanityCheck, startRelay } = await import("./relay");
	startRelay();
	await nextTurn();
	const diagnostics = await runRelaySanityCheck();
	assert.equal(diagnostics.roundTrip.ok, true);
	assert.equal(
		"chatgpt" in diagnostics.assistants && diagnostics.assistants.chatgpt,
		true,
	);
	const response = await request("search_activity", {
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
	assert.doesNotMatch(json, /private|secret|OAuth callback|relatedEvidence/);
	assert.equal(Object.hasOwn(firstPage.results[0] ?? {}, "preview"), false);
	assert.equal(Object.hasOwn(firstPage.results[0] ?? {}, "title"), false);
	const handoff = await request("get_pending_workflow_handoff", {});
	assert.ok(handoff);
	assert.equal((handoff.result as { ready: boolean }).ready, true);
	const handoffJson = JSON.stringify(handoff.result);
	assert.match(handoffJson, /linkedin\.com.*google\.com.*linkedin\.com/);
	assert.doesNotMatch(handoffJson, /sourceIds|private|secret|page text/);
	const nextPage = await request("search_activity", {
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
	const relatedPage1 = await request("find_activity_matches", {
		anchors: [
			{ kind: "event", id: "event-1" },
			{ kind: "page", id: "page-1" },
		],
		limit: 1,
	});
	assert.ok(relatedPage1?.result, JSON.stringify(relatedPage1));
	const related = relatedPage1.result as {
		count: number;
		nextCursor: string | null;
		matches: {
			id: string;
			kind: "event" | "page";
			matchedBy: string[];
			matchedAnchorIds: string[];
		}[];
	};
	assert.equal(related.count, 1);
	assert.match(related.nextCursor ?? "", /^\d{1,16}:1$/);
	assert.ok(related.matches[0]?.matchedBy.includes("same_site"));
	assert.ok(related.matches[0]?.matchedAnchorIds.includes("event-1"));
	assert.equal(Object.hasOwn(related.matches[0] ?? {}, "preview"), false);
	assert.equal(Object.hasOwn(related.matches[0] ?? {}, "title"), false);
	assert.doesNotMatch(
		JSON.stringify(related.matches),
		/private|secret|OAuth callback/,
	);
	assert.equal(related.matches[0]?.kind, "event");
	const trailResponse = await request("get_activity_timeline", {
		anchors: [{ kind: "event", id: "event-1" }],
		limit: 1,
	});
	assert.ok(trailResponse?.result);
	const trail = trailResponse.result as {
		items: {
			id: string;
			role: string;
			timestamp: number;
		}[];
	};
	assert.deepEqual(
		trail.items.map(({ id }) => id),
		["event-1", "event-2"],
	);
	assert.deepEqual(
		trail.items.map(({ role }) => role),
		["anchor", "match"],
	);
	assert.equal(Object.hasOwn(trail.items[0] ?? {}, "preview"), false);
	assert.equal(Object.hasOwn(trail.items[0] ?? {}, "title"), false);
	assert.doesNotMatch(JSON.stringify(trail), /private|secret|OAuth callback/);
	const relatedPage2 = await request("find_activity_matches", {
		anchors: [
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
	const workflowScript = {
		version: 1,
		name: "Open a site",
		description: "Open the selected site.",
		trigger: "manual",
		origins: ["https://www.linkedin.com"],
		inputs: [],
		steps: [{ type: "navigate", url: "https://www.linkedin.com/" }],
	};
	const saveScript = await request("save_workflow_script", {
		candidateId: "handwired-v1-1234abcd",
		grantToken: "12345678-1234-1234-1234-123456789012",
		handoffDigest: "a".repeat(64),
		script: workflowScript,
	});
	assert.equal((saveScript.result as { status: string }).status, "draft");
	assert.equal(savedWorkflowScripts.length, 1);
	const invalidScript = await request("save_workflow_script", {
		candidateId: "handwired-v1-1234abcd",
		grantToken: "12345678-1234-1234-1234-123456789012",
		handoffDigest: "a".repeat(64),
		script: { ...workflowScript, code: "alert(1)" },
	});
	assert.match(invalidScript.error?.message ?? "", /Invalid workflow script/);
	assert.equal(
		savedWorkflowScripts.length,
		1,
		"invalid script never reaches local owner",
	);
	const invalidRelatedCursor = await request("find_activity_matches", {
		anchors: [{ kind: "event", id: "event-1" }],
		cursor: `${Date.now() + 100_000}:1`,
	});
	assert.equal(
		invalidRelatedCursor?.error?.message,
		"cursor must be a valid next-page cursor.",
	);
	const invalidCursor = await request("search_activity", {
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
		"Extension activity relay passed: local search, explicit matches, and legacy dispatch removal.",
	);
} finally {
	mock.restoreAll();
	globalThis.chrome = originalChrome;
	globalThis.WebSocket = originalWebSocket;
	globalThis.fetch = originalFetch;
}
