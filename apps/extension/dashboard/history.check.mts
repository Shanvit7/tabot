import assert from "node:assert/strict";
import {
	normalizeEvent,
	type StoredPageObservation,
	searchHistory,
	type TabotDatabase,
} from "@tabot/shared";
import {
	isDashboardNotes,
	isDashboardPagePreview,
	isDashboardSearchResults,
} from "@tabot/shared/dashboard";
import {
	browseLibrary,
	isLibraryResponse,
	type LibraryRequest,
	type LibraryResponse,
} from "@tabot/shared/library";
import { readDashboardHistory } from "./history";

const sender = "http://localhost:3000/home";
const url = "https://example.com/guide";
const id = "11111111-1111-4111-8111-111111111111";
const page: StoredPageObservation = {
	id,
	kind: "page-observation",
	timestamp: 1000,
	tabId: 7,
	windowId: 1,
	pageKey: "a".repeat(64),
	captureIdentity: "b".repeat(64),
	documentId: "internal-document",
	url,
	trigger: "viewport-dwell",
	segments: ["Retained [EMAIL] excerpt."],
	privacy: { policyVersion: 1, redacted: true, findings: ["EMAIL"] },
	coverage: { partial: true, truncated: false },
};
let opens = 0;
let current: StoredPageObservation | undefined = page;
let fail = false;
let lastOptions: unknown;
const getDb = async (): Promise<
	Pick<
		TabotDatabase,
		| "searchHistoryWithTotal"
		| "searchNotesWithTotal"
		| "searchHistory"
		| "searchNotes"
		| "getSearchStatus"
		| "getPageObservation"
		| "readEvents"
		| "warmSearchModel"
	>
> => {
	opens++;
	if (fail) throw new Error("offline");
	return {
		searchNotesWithTotal: async () => ({ results: [], total: 0 }),
		searchNotes: async () => [],
		readEvents: async () => [],
		searchHistory: async () => [],
		searchHistoryWithTotal: async (query, options) => {
			assert.equal(query, "guide");
			lastOptions = options;
			return { results: [], total: 0 };
		},
		getSearchStatus: async () => ({
			mode: "keyword",
			indexing: true,
			model: "loading",
		}),
		warmSearchModel: async () => {},
		getPageObservation: async (requestedId) => {
			assert.equal(requestedId, id);
			return current;
		},
	};
};
const previewRequest = { type: "GET_PAGE_PREVIEW", id, url };
for (const untrusted of [
	undefined,
	"https://evil.example/home",
	"https://shanvit7.github.io/other",
	"http://localhost:3002/home",
]) {
	assert.deepEqual(
		await readDashboardHistory(previewRequest, untrusted, getDb),
		{ ok: false, code: "unauthorized-sender" },
	);
	assert.deepEqual(
		await readDashboardHistory(
			{ type: "GET_PAGE_REFERENCE", url },
			untrusted,
			getDb,
		),
		{ ok: false, code: "unauthorized-sender" },
	);
	assert.deepEqual(
		await readDashboardHistory(
			{ type: "BROWSE_LIBRARY", level: "sites" },
			untrusted,
			getDb,
		),
		{ ok: false, code: "unauthorized-sender" },
	);
	assert.deepEqual(
		await readDashboardHistory(
			{ type: "PRELOAD_SEARCH_MODEL" },
			untrusted,
			getDb,
		),
		{ ok: false, code: "unauthorized-sender" },
	);
	assert.deepEqual(
		await readDashboardHistory(
			{ type: "SEARCH_HISTORY", query: "guide" },
			untrusted,
			getDb,
		),
		{ ok: false, code: "unauthorized-sender" },
	);
}
assert.equal(opens, 0, "Rejected senders must not open storage");
for (const request of [
	null,
	{ type: "SEARCH_HISTORY", query: {} },
	{ type: "SEARCH_HISTORY", query: " " },
	{ type: "SEARCH_HISTORY", query: "x".repeat(241) },
	...[0, 21, NaN, "10", null].map((limit) => ({
		type: "SEARCH_HISTORY",
		query: "guide",
		limit,
	})),
	{ type: "SEARCH_HISTORY", query: "guide", from: 2, to: 1 },
	{ type: "SEARCH_HISTORY", query: "guide", from: "yesterday" },
	{ type: "SEARCH_HISTORY", query: "guide", origin: "javascript:alert(1)" },
	{ type: "UPDATE_NOTE", id: "note-1", text: " " },
	{ type: "UPDATE_NOTE", id: "note-1", text: "x".repeat(4_001) },
	{ ...previewRequest, id: "../events" },
	{ ...previewRequest, url: "javascript:alert(1)" },
	{ ...previewRequest, url: `${url}?secret=yes` },
	{ type: "GET_PAGE_REFERENCE", url: "javascript:alert(1)" },
	{ type: "GET_PAGE_REFERENCE", url: `${url}?secret=yes` },
	{ type: "GET_EVENTS" },
	{ type: "BROWSE_LIBRARY", level: "pages" },
	{ type: "BROWSE_LIBRARY", level: "notes" },
	{ type: "BROWSE_LIBRARY", level: "pages", site: "https://example.com" },
	{ type: "BROWSE_LIBRARY", level: "notes", url: `${url}?secret=yes` },
	{ type: "BROWSE_LIBRARY", level: "sites", offset: -1 },
	{ type: "BROWSE_LIBRARY", level: "sites", limit: 21 },
	{ type: "BROWSE_LIBRARY", level: "sites", from: 2, to: 1 },
])
	assert.deepEqual(await readDashboardHistory(request, sender, getDb), {
		ok: false,
		code: "invalid-request",
	});
assert.equal(opens, 0, "Malformed requests must not open storage");
Object.defineProperty(globalThis, "chrome", {
	configurable: true,
	value: {
		storage: {
			local: {
				get: async () => ({
					tabot_capture_identity_key_v1: Array.from(
						{ length: 32 },
						(_, i) => i,
					),
				}),
				set: async () => {},
			},
		},
	},
});
const pageReference = await readDashboardHistory(
	{ type: "GET_PAGE_REFERENCE", url },
	sender,
	getDb,
);
assert.ok("pageRef" in pageReference);
assert.ok(pageReference.pageRef.startsWith("example.com:"));
assert.equal(pageReference.pageRef.length, "example.com:".length + 64);
assert.equal(JSON.stringify(pageReference).includes("/guide"), false);
assert.equal(opens, 0, "Page references must not open history storage");
assert.deepEqual(
	await readDashboardHistory({ type: "PRELOAD_SEARCH_MODEL" }, sender, getDb),
	{ preloadStarted: true },
);
assert.deepEqual(
	await readDashboardHistory(
		{
			type: "SEARCH_HISTORY",
			query: "guide",
			from: 0,
			to: 2000,
			origin: "https://example.com",
			limit: 10,
			offset: 40,
			noteOffset: 60,
		},
		sender,
		getDb,
	),
	{
		results: [],
		resultsTotal: 0,
		notesTotal: 0,
		searchStatus: { mode: "keyword", indexing: true, model: "loading" },
		notes: [],
	},
);
assert.deepEqual(lastOptions, {
	from: 0,
	to: 2000,
	origin: "https://example.com",
	limit: 10,
	offset: 40,
});
const pagedResponse = await readDashboardHistory(
	{
		type: "SEARCH_HISTORY",
		query: "guide",
		includeTotals: false,
	},
	sender,
	getDb,
);
assert.equal(
	"resultsTotal" in pagedResponse ? pagedResponse.resultsTotal : undefined,
	undefined,
);
assert.equal(
	"notesTotal" in pagedResponse ? pagedResponse.notesTotal : undefined,
	undefined,
);
Object.assign(page.coverage, { internalDocumentId: "internal-document" });
const response = await readDashboardHistory(previewRequest, sender, getDb);
assert.ok("preview" in response && isDashboardPagePreview(response.preview));
assert.deepEqual(Object.keys(response.preview).sort(), [
	"coverage",
	"id",
	"redacted",
	"segments",
	"timestamp",
	"trigger",
	"url",
]);
assert.equal(JSON.stringify(response).includes("internal-document"), false);
assert.deepEqual(
	await readDashboardHistory(
		{ ...previewRequest, url: "https://example.com/other" },
		sender,
		getDb,
	),
	{ preview: null },
);
current = { ...page, id: "22222222-2222-4222-8222-222222222222" };
assert.deepEqual(await readDashboardHistory(previewRequest, sender, getDb), {
	preview: null,
});
current = undefined;
assert.deepEqual(await readDashboardHistory(previewRequest, sender, getDb), {
	preview: null,
});
current = { ...page, segments: ["x".repeat(1001)] };
assert.deepEqual(await readDashboardHistory(previewRequest, sender, getDb), {
	ok: false,
	code: "preview-unavailable",
});
fail = true;
assert.deepEqual(await readDashboardHistory(previewRequest, sender, getDb), {
	ok: false,
	code: "preview-unavailable",
});
assert.deepEqual(
	await readDashboardHistory(
		{ type: "SEARCH_HISTORY", query: "guide" },
		sender,
		getDb,
	),
	{ ok: false, code: "search-unavailable" },
);
assert.deepEqual(
	await readDashboardHistory({ type: "PRELOAD_SEARCH_MODEL" }, sender, getDb),
	{ ok: false, code: "search-preload-unavailable" },
);
fail = false;
assert.equal(isDashboardSearchResults([]), true);
assert.equal(isDashboardSearchResults({ ok: false }), false);
const result = {
	url,
	host: "example.com",
	firstSeen: 0,
	lastSeen: 1000,
	eventCount: 0,
	pageCount: 1,
	sourceCount: 1,
	score: 1,
	excerpt: "guide",
	pageExcerptAvailable: true,
	evidenceKinds: ["auto-snippet"],
	matchedTerms: ["guide"],
	sources: [
		{ kind: "page", id, url, timestamp: 1000, evidenceKind: "auto-snippet" },
	],
};
assert.equal(isDashboardSearchResults([result]), true);
// Chrome webNavigation.timeStamp includes fractional milliseconds. Exercise the
// real producer and the JSON message boundary, not only hand-written responses.
const navigation = normalizeEvent({
	id,
	type: "NAVIGATION",
	tabId: 7,
	windowId: 1,
	url,
	timestamp: 1793448000000.125,
});
const capturedPage = { ...page, timestamp: Math.ceil(navigation.timestamp) };
const wiredResponse = JSON.parse(
	JSON.stringify(
		await readDashboardHistory(
			{ type: "SEARCH_HISTORY", query: "guide" },
			sender,
			async () => ({
				searchNotesWithTotal: async () => ({ results: [], total: 0 }),
				searchNotes: async () => [],
				searchHistory: async () => [],
				readEvents: async () => [],
				searchHistoryWithTotal: async (query, options) => {
					const result = await searchHistory(
						[navigation],
						[capturedPage],
						query,
						options,
					);
					return { results: result, total: result.length };
				},
				getSearchStatus: async () => ({
					mode: "hybrid",
					indexing: false,
					model: "ready",
				}),
				getPageObservation: async () => capturedPage,
			}),
		),
	),
);
assert.equal(wiredResponse.results.length, 1);
assert.equal(wiredResponse.resultsTotal, 1);
assert.equal(wiredResponse.notesTotal, 0);
assert.equal(wiredResponse.results[0].firstSeen, navigation.timestamp);
assert.equal(wiredResponse.results[0].lastSeen, capturedPage.timestamp);
assert.equal(isDashboardSearchResults(wiredResponse.results), true);
assert.deepEqual(wiredResponse.searchStatus, {
	mode: "hybrid",
	indexing: false,
	model: "ready",
});
const truncatedResponse = await readDashboardHistory(
	{ type: "SEARCH_HISTORY", query: "guide" },
	sender,
	async () => ({
		...(await getDb()),
		searchHistoryWithTotal: async () => ({
			results: [result],
			total: 500,
			truncated: true,
		}),
		readEvents: async () => {
			throw new Error("empty notes must not read events");
		},
	}),
);
assert.ok("results" in truncatedResponse);
assert.equal(
	"resultsTotal" in truncatedResponse,
	false,
	"capped candidate counts are not exact totals",
);
const faviconResponse = await readDashboardHistory(
	{ type: "SEARCH_HISTORY", query: "guide" },
	sender,
	async () => ({
		...(await getDb()),
		searchNotesWithTotal: async () => ({
			total: 1,
			results: [
				{
					id,
					text: "guide",
					createdAt: 1000,
					updatedAt: 1000,
					url,
					origin: "https://example.com",
					host: "example.com",
					title: "Guide",
					site: "example.com",
					favicon: `https://example.com/${"x".repeat(2050)}`,
					pageKey: "a".repeat(64),
					tabId: 1,
					windowId: 1,
					eventId: null,
				},
			],
		}),
	}),
);
assert.ok("notes" in faviconResponse);
assert.equal(faviconResponse.notes[0].favicon, null);
assert.equal(isDashboardNotes(faviconResponse.notes), true);
for (const invalidTime of [
	NaN,
	Infinity,
	-Infinity,
	-1,
	8.64e15 + 1,
	"1000",
	null,
]) {
	assert.equal(
		isDashboardSearchResults([{ ...result, firstSeen: invalidTime }]),
		false,
	);
	assert.equal(
		isDashboardSearchResults([{ ...result, lastSeen: invalidTime }]),
		false,
	);
	assert.equal(
		isDashboardSearchResults([
			{
				...result,
				sources: [{ ...result.sources[0], timestamp: invalidTime }],
			},
		]),
		false,
	);
	assert.equal(
		isDashboardPagePreview({ ...response.preview, timestamp: invalidTime }),
		false,
	);
}
for (const broken of [
	{ ...result, url: "javascript:alert(1)" },
	{ ...result, lastSeen: Infinity },
	{
		...result,
		sources: [
			{ kind: "page", id, timestamp: 0, url: "https://other.example/" },
		],
	},
])
	assert.equal(isDashboardSearchResults([broken]), false);
const editedNote = await readDashboardHistory(
	{ type: "UPDATE_NOTE", id: "note-1", text: "Updated note" },
	sender,
	async () => ({
		...(await getDb()),
		updateNoteText: async (noteId: string, text: string) => ({
			id: noteId,
			text,
			updatedAt: 123,
		}),
	}),
);
assert.deepEqual(editedNote, {
	note: { id: "note-1", text: "Updated note", updatedAt: 123 },
});
const libraryRequest = {
	type: "BROWSE_LIBRARY",
	level: "pages",
	site: "example.com",
	offset: 20,
} as const;
const libraryResult = await browseLibrary(
	Array.from({ length: 25 }, (_, index) => ({
		...navigation,
		id: `library-${index}`,
		url: `https://example.com/page-${index}`,
	})),
	[],
	[],
	libraryRequest,
);
let receivedLibrary: LibraryRequest | undefined;
const libraryResponse = await readDashboardHistory(
	libraryRequest,
	sender,
	async () => ({
		...(await getDb()),
		browseLibrary: async (request) => {
			receivedLibrary = request;
			return libraryResult;
		},
	}),
);
assert.deepEqual(receivedLibrary, libraryRequest);
assert.ok(isLibraryResponse(libraryResponse));
assert.equal(libraryResponse.total, 25);
assert.equal(libraryResponse.pages.length, 5);
assert.equal(libraryResponse.hasMore, false);
assert.deepEqual(await readDashboardHistory(libraryRequest, sender, getDb), {
	ok: false,
	code: "library-unavailable",
});
assert.deepEqual(
	await readDashboardHistory(libraryRequest, sender, async () => ({
		...(await getDb()),
		browseLibrary: async () => {
			throw new Error("read-failed");
		},
	})),
	{ ok: false, code: "library-unavailable" },
);
assert.deepEqual(
	await readDashboardHistory(libraryRequest, sender, async () => ({
		...(await getDb()),
		browseLibrary: async () => ({ total: 0 }) as LibraryResponse,
	})),
	{ ok: false, code: "library-unavailable" },
);
console.log(
	"dashboard history: authorization, validation, bounded projection, missing captures and explicit read failures passed",
);
