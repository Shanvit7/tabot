import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";
import type { StoredPageObservation } from "../pages/observations";
import {
	parseRecentSearchQuestion,
	projectActivitySearchResults,
	searchHistory,
} from "../recall/history-search";

const event = (
	id: string,
	url: string,
	timestamp: number,
	favicon?: string,
): StoredTabEvent => ({
	id,
	type: "TAB_UPDATED",
	tabId: 1,
	windowId: 1,
	timestamp,
	url,
	...(favicon ? { favicon } : {}),
});
const page = (
	id: string,
	url: string,
	timestamp: number,
	text: string,
	redacted = true,
	title?: string,
): StoredPageObservation => ({
	id,
	kind: "page-observation",
	timestamp,
	tabId: 1,
	windowId: 1,
	pageKey: "a".repeat(64),
	captureIdentity: id,
	url,
	trigger: "interaction",
	...(title ? { title } : {}),
	segments: text ? [text] : [],
	privacy: { policyVersion: 1, redacted, findings: [] },
	coverage: { truncated: false, partial: false },
});

const events = [
	event(
		"event-1",
		"https://example.com/docs/pkce?secret=redacted",
		100,
		"https://example.com/favicon.svg?token=redacted",
	),
	event("event-2", "https://example.com/docs/pkce#private", 150),
	event("event-3", "https://docs.example.net/reset", 250),
	event("event-4", "https://news.example.org/today", 350),
];
const pages = [
	page(
		"page-1",
		"https://example.com/docs/pkce?token=redacted",
		110,
		"PKCE verifier callback flow for OAuth authorization",
	),
	page(
		"page-2",
		"https://example.com/docs/pkce",
		120,
		"PKCE verifier setup and callback troubleshooting",
	),
	page(
		"page-3",
		"https://docs.example.net/reset",
		260,
		"Reset account password with a recovery code",
	),
	page(
		"page-clean",
		"https://example.com/private",
		280,
		"Ordinary documentation text",
		false,
	),
];

const exact = await searchHistory(events, pages, "PKCE verifier");
assert.equal(exact[0]?.url, "https://example.com/docs/pkce");
assert.equal(exact[0]?.favicon, "https://example.com/favicon.svg");
assert.equal(exact[0]?.pageCount, 2);
assert.equal(exact[0]?.eventCount, 2);
assert.equal(exact[0]?.sourceCount, 4);
assert.equal(exact[0]?.sources[0]?.url, "https://example.com/docs/pkce");
assert.equal(exact[0]?.excerpt.includes("PKCE"), true);
assert.equal(exact[0]?.url.includes("secret"), false);

const titleOnly = page(
	"title-only",
	"https://taladb.dev/guide",
	400,
	"",
	true,
	"Database in the browser",
);
const titleMatch = await searchHistory([], [titleOnly], "database");
assert.equal(titleMatch[0]?.pageTitle, "Database in the browser");
assert.equal(titleMatch[0]?.pageExcerptAvailable, false);
assert.deepEqual(titleMatch[0]?.evidenceKinds, ["title-only"]);

const searchNow = 1_800_000_000_000;
const recentSearch = parseRecentSearchQuestion(
	"what did i search 5 mins ago",
	searchNow,
);
assert.ok(recentSearch);
assert.deepEqual(recentSearch, {
	from: searchNow - 6 * 60_000,
	to: searchNow - 4 * 60_000,
	nearestTo: searchNow - 5 * 60_000,
});
const timedSearch = await searchHistory(
	[
		event(
			"google-search",
			"https://www.google.com/search?q=database&client=chrome",
			searchNow - 5 * 60_000 + 15_000,
		),
		event(
			"outside-window",
			"https://www.google.com/search?q=weather",
			searchNow - 8 * 60_000,
		),
	],
	[],
	"",
	{ ...recentSearch, limit: 5 },
);
assert.equal(timedSearch.length, 1);
assert.deepEqual(timedSearch[0]?.searchQueries, ["database"]);
const paginationEvents = [
	event("page-a", "https://a.example/pkce", 500),
	event("page-b", "https://b.example/pkce", 501),
];
const firstPage = await searchHistory(paginationEvents, [], "PKCE", {
	limit: 1,
});
const secondPage = await searchHistory(paginationEvents, [], "PKCE", {
	limit: 1,
	offset: 1,
});
assert.equal(firstPage.length, 1);
assert.equal(secondPage.length, 1);
assert.notEqual(firstPage[0]?.url, secondPage[0]?.url);
const semanticPage = pages[0];
assert.ok(semanticPage);
const semanticOnly = await searchHistory(
	[],
	[semanticPage],
	"a saved technical reference",
	{
		candidateOrder: ["https://example.com/docs/pkce"],
	},
);
assert.equal(semanticOnly[0]?.url, "https://example.com/docs/pkce");
assert.deepEqual(semanticOnly[0]?.matchedTerms, []);
assert.equal(semanticOnly[0]?.pageExcerptAvailable, true);

const externalActivity = projectActivitySearchResults(exact.slice(0, 1))[0];
assert.equal(externalActivity?.site, "https://example.com");
assert.equal(externalActivity?.preview?.includes("PKCE"), true);
assert.equal(JSON.stringify(externalActivity).includes("/docs/pkce"), false);
assert.equal(Object.hasOwn(externalActivity?.anchors[0] ?? {}, "url"), false);
const titleOnlyActivity = projectActivitySearchResults(
	await searchHistory(
		[],
		[
			page(
				"title-only",
				"https://example.org/settings",
				500,
				"",
				true,
				"OAuth callback settings",
			),
		],
		"OAuth callback settings",
	),
)[0];
assert.equal(titleOnlyActivity?.title, "OAuth callback settings");
assert.equal(titleOnlyActivity?.preview, null);
assert.deepEqual(titleOnlyActivity?.matchedFrom, ["title-only"]);
const pathOnlyResult = projectActivitySearchResults(
	await searchHistory(
		[event("path-only", "https://private.example/account/internal", 400)],
		[],
		"internal",
	),
)[0];
assert.equal(pathOnlyResult?.preview, null);
assert.equal(
	JSON.stringify(pathOnlyResult).includes("/account/internal"),
	false,
);

const paraphrase = await searchHistory(
	events,
	pages,
	"password reset account",
	{
		from: 200,
		to: 300,
		origin: "https://docs.example.net",
	},
);
assert.equal(paraphrase[0]?.url, "https://docs.example.net/reset");
assert.equal(paraphrase[0]?.sourceCount, 2);
assert.equal(
	(await searchHistory(events, pages, "ordinary documentation"))[0]?.url,
	"https://example.com/private",
);
assert.equal(
	await searchHistory(events, pages, "completely unrelated topic").then(
		(r) => r.length,
	),
	0,
);
assert.equal(
	await searchHistory(events, pages, "secret token").then((r) => r.length),
	0,
);
assert.equal(
	await searchHistory(events, pages, "PKCE", { from: 200 }).then(
		(r) => r.length,
	),
	0,
);
assert.equal(await searchHistory(events, [], "OAuth").then((r) => r.length), 0);

const judged = [
	{ query: "PKCE verifier", expected: "https://example.com/docs/pkce" },
	{
		query: "account password reset",
		expected: "https://docs.example.net/reset",
	},
	{ query: "OAuth callback", expected: "https://example.com/docs/pkce" },
];
const ranked = await Promise.all(
	judged.map(async ({ query, expected }) => ({
		expected,
		results: await searchHistory(events, pages, query),
	})),
);
const recallAt3 =
	ranked.filter(({ expected, results }) =>
		results.slice(0, 3).some((result) => result.url === expected),
	).length / ranked.length;
const mrr =
	ranked.reduce((sum, { expected, results }) => {
		const index = results.findIndex((result) => result.url === expected);
		return sum + (index < 0 ? 0 : 1 / (index + 1));
	}, 0) / ranked.length;
assert.equal(recallAt3, 1);
assert.equal(mrr, 1);

const matchingPage = page(
	"old-match",
	"https://evidence.example/article",
	100,
	`${"background ".repeat(30)}needle phrase appears in this exact source`,
);
const unrelatedPages = Array.from({ length: 6 }, (_, index) =>
	page(
		`new-${index}`,
		"https://evidence.example/article",
		200 + index,
		"Recent page observation without matching content",
	),
);
const evidence = (
	await searchHistory([], [matchingPage, ...unrelatedPages], "needle phrase")
)[0];
assert.equal(
	evidence?.sources.some(({ id }) => id === "old-match"),
	true,
);
assert.equal(evidence?.excerpt.includes("needle phrase"), true);

let searchYielded = false;
const yieldCheck = new Promise<void>((resolve) =>
	setTimeout(() => {
		searchYielded = true;
		resolve();
	}, 0),
);
const largeEvents = Array.from({ length: 10_000 }, (_, index) =>
	event(
		`load-${index}`,
		index === 9_999
			? "https://load.example/needle"
			: `https://load.example/page-${index}`,
		index,
	),
);
const largeResult = await searchHistory(largeEvents, [], "needle");
await yieldCheck;
assert.equal(searchYielded, true);
assert.equal(largeResult[0]?.url, "https://load.example/needle");
assert.equal(largeResult[0]?.sourceCount, 1);
logger.info(
	"history-search: synthetic fixture assertions passed (not product quality evidence); privacy, provenance, filters, deletion, and no-answer passed",
);
