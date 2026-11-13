// Exercises the public evidence-search dispatch against an in-memory store.
import assert from "node:assert/strict";
import { mock } from "node:test";
import {
	setTimeout as delay,
	setImmediate as nextTurn,
} from "node:timers/promises";
import * as shared from "@tabot/shared";
import { browseLibrary, type LibraryRequest } from "@tabot/shared/library";

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
const libraryRequests: LibraryRequest[] = [];
const relayTestToken = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
const libraryNotes = Array.from({ length: 53 }, (_, index) => ({
	id: `saved-note-${index}`,
	text:
		index === 51
			? `sensitive-check john@example.com ${relayTestToken}`
			: `Saved note ${index}`,
	createdAt: 50 + index,
	updatedAt: 50 + index,
	url:
		index === 52
			? "https://example.test/orphan"
			: "https://example.test/private/path",
	origin: "https://example.test",
	host: "example.test",
	site: "example.test",
	title: index === 51 ? `john@example.com ${relayTestToken}` : "A saved title",
	favicon: null,
	pageKey: "saved-page-key",
	tabId: 1,
	windowId: 1,
	eventId: null,
}));
const db = {
	listPageNotes: async () =>
		libraryNotes.filter((note) => note.id === "saved-note-51"),
	readEvents: async () => [],
	browseLibrary: async (request: LibraryRequest) => {
		libraryRequests.push(request);
		return browseLibrary(
			[
				seedEvent,
				...Array.from({ length: 23 }, (_, index) => ({
					...seedEvent,
					id: `library-event-${index}`,
					timestamp: 20 + index,
					url: `https://example.test/page-${index}`,
				})),
			],
			[],
			libraryNotes,
			request,
		);
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
			set: async () => {},
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
	for (
		let attempt = 0;
		attempt < 200 && responses.at(-1)?.requestId !== requestId;
		attempt++
	)
		await delay(5);
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
	assert.equal(
		Object.hasOwn(
			(firstPage.results[0] as object | undefined) ?? {},
			"preview",
		),
		false,
	);
	assert.equal(
		Object.hasOwn((firstPage.results[0] as object | undefined) ?? {}, "title"),
		false,
	);
	const sites = (await request("list_sites", {}))?.result as {
		total: number;
		sites: { site: string; pageCount: number; noteCount: number }[];
	};
	assert.equal(sites.total, 1);
	assert.deepEqual(
		sites.sites.map(({ site, pageCount, noteCount }) => ({
			site,
			pageCount,
			noteCount,
		})),
		[{ site: "example.test", pageCount: 25, noteCount: 53 }],
	);
	const listedResponse = await request("list_site_pages", {
		site: "example.test",
		limit: 2,
	});
	assert.equal(
		listedResponse?.error,
		undefined,
		JSON.stringify(listedResponse),
	);
	const listed = listedResponse?.result as {
		total: number;
		nextCursor: string;
		pages: { pageRef: string; noteCount: number; captureAvailable: boolean }[];
	};
	assert.equal(listed.total, 25);
	assert.match(listed.nextCursor, /^\d+:2$/);
	assert.doesNotMatch(
		JSON.stringify({ sites, listed }),
		/private|orphan|saved title|page-\d|favicon|url|excerpt/,
	);
	const pageWithNotes = listed.pages.find((page) => page.noteCount === 52);
	assert.ok(pageWithNotes);
	assert.match(pageWithNotes.pageRef, /^example\.test:[a-f0-9]{64}$/);
	assert.equal(pageWithNotes.captureAvailable, false);
	let noteCursor: string | null | undefined;
	const noteIds: string[] = [];
	const noteResults: { id: string; text: string; title: string | null }[] = [];
	do {
		const response = await request("get_page_notes", {
			pageRef: pageWithNotes.pageRef,
			...(noteCursor ? { cursor: noteCursor } : {}),
		});
		assert.equal(response?.error, undefined);
		const page = response?.result as {
			total: number;
			nextCursor: string | null;
			notes: { id: string; text: string; title: string | null }[];
		};
		assert.equal(page.total, 52);
		assert.doesNotMatch(JSON.stringify(page), /private\/path|pageKey/);
		noteIds.push(...page.notes.map((note) => note.id));
		noteResults.push(...page.notes);
		noteCursor = page.nextCursor;
	} while (noteCursor);
	assert.equal(
		new Set(noteIds).size,
		52,
		"Opaque references paginate beyond the legacy 50-note cap",
	);
	const redactedNote = noteResults.find((note) => note.id === "saved-note-51");
	assert.ok(redactedNote);
	assert.equal(redactedNote.text.includes("john@example.com"), true);
	assert.equal(redactedNote.text.includes(relayTestToken), false);
	assert.equal((redactedNote.title ?? "").includes("john@example.com"), true);
	assert.equal((redactedNote.title ?? "").includes(relayTestToken), false);
	const legacyPageNotes = (
		await request("get_page_notes", {
			url: "https://example.test/private/path",
		})
	)?.result as {
		title: string | null;
		notes: { text: string; title: string | null }[];
	};
	assert.equal(
		(legacyPageNotes.title ?? "").includes("john@example.com"),
		true,
	);
	assert.equal((legacyPageNotes.title ?? "").includes(relayTestToken), false);
	assert.equal(
		(legacyPageNotes.notes[0]?.text ?? "").includes("john@example.com"),
		true,
	);
	assert.equal(
		(legacyPageNotes.notes[0]?.text ?? "").includes(relayTestToken),
		false,
	);
	const orphan = listed.pages.find((page) => page.noteCount === 1);
	assert.ok(orphan);
	const orphanNotes = (
		await request("get_page_notes", { pageRef: orphan.pageRef })
	)?.result as { count: number };
	assert.equal(orphanNotes.count, 1, "Note-only pages need no capture");
	const requestCount = libraryRequests.length;
	for (const [method, input] of [
		["list_site_pages", { site: "https://example.test/path" }],
		["list_sites", { limit: 9 }],
		["list_sites", { from: 20, to: 10 }],
		["get_page_notes", { pageRef: "invalid" }],
		[
			"get_page_notes",
			{ pageRef: pageWithNotes.pageRef, url: "https://example.test" },
		],
	]) {
		assert.ok((await request(method as string, input))?.error);
	}
	assert.equal(
		libraryRequests.length,
		requestCount,
		"Invalid requests never reach storage",
	);
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
