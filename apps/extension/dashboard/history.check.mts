import assert from "node:assert/strict";
import {
	normalizeEvent,
	type StoredPageObservation,
	searchHistory,
	type TabotDatabase,
} from "@tabot/shared";
import {
	isDashboardPagePreview,
	isDashboardSearchResults,
} from "@tabot/shared/dashboard";
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
		| "searchHistory"
		| "searchNotes"
		| "getSearchStatus"
		| "getPageObservation"
		| "readEvents"
	>
> => {
	opens++;
	if (fail) throw new Error("offline");
	return {
		searchNotes: async () => [],
		readEvents: async () => [],
		searchHistory: async (query, options) => {
			assert.equal(query, "guide");
			lastOptions = options;
			return [];
		},
		getSearchStatus: async () => ({
			mode: "keyword",
			indexing: true,
			model: "loading",
		}),
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
	{ ...previewRequest, id: "../events" },
	{ ...previewRequest, url: "javascript:alert(1)" },
	{ ...previewRequest, url: `${url}?secret=yes` },
	{ type: "GET_EVENTS" },
])
	assert.deepEqual(await readDashboardHistory(request, sender, getDb), {
		ok: false,
		code: "invalid-request",
	});
assert.equal(opens, 0, "Malformed requests must not open storage");
assert.deepEqual(
	await readDashboardHistory(
		{
			type: "SEARCH_HISTORY",
			query: "guide",
			from: 0,
			to: 2000,
			origin: "https://example.com",
			limit: 10,
		},
		sender,
		getDb,
	),
	{
		results: [],
		searchStatus: { mode: "keyword", indexing: true, model: "loading" },
		notes: [],
	},
);
assert.deepEqual(lastOptions, {
	from: 0,
	to: 2000,
	origin: "https://example.com",
	limit: 10,
});
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
				searchNotes: async () => [],
				readEvents: async () => [],
				searchHistory: (query, options) =>
					searchHistory([navigation], [capturedPage], query, options),
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
assert.equal(wiredResponse.results[0].firstSeen, navigation.timestamp);
assert.equal(wiredResponse.results[0].lastSeen, capturedPage.timestamp);
assert.equal(isDashboardSearchResults(wiredResponse.results), true);
assert.deepEqual(wiredResponse.searchStatus, {
	mode: "hybrid",
	indexing: false,
	model: "ready",
});
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
console.log(
	"dashboard history: authorization, validation, bounded projection, missing captures and explicit read failures passed",
);
