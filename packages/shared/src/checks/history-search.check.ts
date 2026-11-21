import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";
import type { StoredPageObservation } from "../pages/observations";
import {
	type HistorySearchResult,
	parseTemporalRecallQuery,
	projectActivitySearchResults,
	rerankCandidates,
	searchHistory,
	searchHistoryWithTotal,
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

const searchNow = new Date(2026, 10, 10, 13, 25).getTime();
const temporalActivity = parseTemporalRecallQuery(
	"What did I do 2 days ago?",
	searchNow,
);
assert.ok(temporalActivity);
assert.equal(temporalActivity.query, "");
const expectedActivityDay = new Date(searchNow);
expectedActivityDay.setDate(expectedActivityDay.getDate() - 2);
expectedActivityDay.setHours(0, 0, 0, 0);
assert.equal(temporalActivity.from, expectedActivityDay.getTime());
const expectedNextDay = new Date(expectedActivityDay);
expectedNextDay.setDate(expectedNextDay.getDate() + 1);
assert.equal(temporalActivity.to, expectedNextDay.getTime() - 1);
const temporalTopic = parseTemporalRecallQuery(
	"Find pages about TalaDB yesterday",
	searchNow,
);
assert.equal(temporalTopic?.query, "TalaDB");
assert.equal(parseTemporalRecallQuery("what did I do", searchNow), undefined);
assert.equal(
	parseTemporalRecallQuery("what was I working on yesterday", searchNow)?.query,
	"",
);
const recentSearch = parseTemporalRecallQuery(
	"what did i search 5 mins ago",
	searchNow,
);
assert.ok(recentSearch);
assert.equal(recentSearch.query, "");
assert.equal(recentSearch.from, searchNow - 5 * 60_000);
assert.equal(recentSearch.to, searchNow - 4 * 60_000 - 1);
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
	{
		...recentSearch,
		limit: 5,
		candidateOrder: ["https://www.google.com/search"],
	},
);
assert.equal(timedSearch.length, 1);
assert.deepEqual(timedSearch[0]?.searchQueries, ["database"]);
const activityFallback = await searchHistory(events.slice(0, 1), [], "", {
	candidateOrder: ["https://example.com/docs/pkce"],
});
assert.equal(activityFallback[0]?.url, "https://example.com/docs/pkce");
const timedPages = await searchHistory(
	[
		{
			...event("visible-a", "https://a.example/work", 1_000),
			type: "PAGE_VISIBLE",
		},
		{
			...event("visible-b", "https://b.example/work", 61_000),
			type: "PAGE_VISIBLE",
		},
		{
			...event("visible-c", "https://b.example/work", 91_000),
			type: "PAGE_VISIBLE",
		},
	],
	[],
	"",
	{ candidateOrder: ["https://a.example/work", "https://b.example/work"] },
);
assert.equal(timedPages[0]?.estimatedActiveMs, 60_000);
assert.equal(timedPages[1]?.estimatedActiveMs, 30_000);
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
const { results: countedPage, total: countedTotal } =
	await searchHistoryWithTotal(paginationEvents, [], "PKCE", { limit: 1 });
assert.equal(countedPage.length, 1);
assert.equal(countedTotal, 2);
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
assert.equal(Object.hasOwn(externalActivity ?? {}, "preview"), false);
assert.equal(Object.hasOwn(externalActivity ?? {}, "title"), false);
assert.doesNotMatch(JSON.stringify(externalActivity), /PKCE|OAuth callback/);
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
assert.equal(Object.hasOwn(titleOnlyActivity ?? {}, "title"), false);
assert.equal(Object.hasOwn(titleOnlyActivity ?? {}, "preview"), false);
assert.doesNotMatch(JSON.stringify(titleOnlyActivity), /OAuth callback/);
assert.deepEqual(titleOnlyActivity?.matchedFrom, ["title-only"]);
const pathOnlyResult = projectActivitySearchResults(
	await searchHistory(
		[event("path-only", "https://private.example/account/internal", 400)],
		[],
		"internal",
	),
)[0];
assert.equal(Object.hasOwn(pathOnlyResult ?? {}, "preview"), false);
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

const normalizedQuery = "ﬃ".repeat(81);
const expanded = await searchHistory(
	[],
	[page("normalized", "https://unicode.example/", 100, normalizedQuery)],
	normalizedQuery,
);
assert.equal(expanded.length, 1);
assert.ok(
	expanded[0].matchedTerms.every((term) => term.length <= 240),
	"normalization cannot emit incompatible metadata",
);
const rankedEvents = [
	event("a-new", "https://rank.example/a", 300),
	event("b", "https://rank.example/b", 200),
	event("a-old", "https://rank.example/a", 100),
];
const stableRanking = await searchHistory(rankedEvents, [], "rank", {
	candidateOrder: [
		"https://rank.example/a",
		"https://rank.example/b",
		"https://rank.example/a",
	],
});
assert.deepEqual(
	stableRanking.map((row) => row.url),
	["https://rank.example/a", "https://rank.example/b"],
);
assert.equal(
	stableRanking[0].estimatedActiveMs,
	undefined,
	"sparse ranked candidates cannot establish time spent",
);

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

// Phase 3/4 rerank: recency + metadata nudge near-equal fused ranks, duplicates are diversified, strong rank still wins.
const DAY = 86_400_000;
const rerankNow = 100 * DAY;
const hit = (
	url: string,
	lastSeen: number,
	pageTitle?: string,
): HistorySearchResult =>
	({
		url,
		host: new URL(url).host,
		lastSeen,
		...(pageTitle ? { pageTitle } : {}),
	}) as HistorySearchResult;
const rank = (urls: string[]) =>
	new Map(urls.map((url, index) => [url, index]));
const order = (results: HistorySearchResult[]) => results.map((r) => r.url);

const recentWins = rerankCandidates(
	[hit("https://a.example/old", 0), hit("https://b.example/new", rerankNow)],
	rank(["https://a.example/old", "https://b.example/new"]),
	"guide",
	rerankNow,
);
assert.deepEqual(order(recentWins), [
	"https://b.example/new",
	"https://a.example/old",
]);

const strongRankStays = rerankCandidates(
	[
		hit("https://a.example/best", 0),
		...Array.from({ length: 30 }, (_, i) =>
			hit(`https://c${i}.example/x`, rerankNow),
		),
	],
	rank([
		"https://a.example/best",
		...Array.from({ length: 30 }, (_, i) => `https://c${i}.example/x`),
	]),
	"guide",
	rerankNow,
);
assert.ok(
	order(strongRankStays).indexOf("https://a.example/best") <
		order(strongRankStays).indexOf("https://c29.example/x"),
);

const titleBoost = rerankCandidates(
	[
		hit("https://a.example/1", rerankNow, "Unrelated"),
		hit("https://b.example/2", rerankNow, "Wayfair careers"),
	],
	rank(["https://a.example/1", "https://b.example/2"]),
	"wayfair",
	rerankNow,
);
assert.equal(titleBoost[0]?.url, "https://b.example/2");

const hostUrls = [
	"https://linkedin.com/1",
	"https://linkedin.com/2",
	"https://linkedin.com/3",
	"https://other.example/1",
];
const diversified = rerankCandidates(
	hostUrls.map((url) => hit(url, rerankNow)),
	rank(hostUrls),
	"profile",
	rerankNow,
);
assert.ok(order(diversified).indexOf("https://other.example/1") < 3);
const dupTitle = rerankCandidates(
	[
		hit("https://a.example/1", rerankNow, "Same Article"),
		hit("https://b.example/2", rerankNow, "same article"),
		hit("https://c.example/3", rerankNow, "Different"),
	],
	rank(["https://a.example/1", "https://b.example/2", "https://c.example/3"]),
	"notes",
	rerankNow,
);
assert.equal(order(dupTitle)[1], "https://c.example/3");
const nonCandidate = rerankCandidates(
	[hit("https://z.example/z", rerankNow), hit("https://a.example/1", 0)],
	rank(["https://a.example/1"]),
	"x",
	rerankNow,
);
assert.equal(nonCandidate[1]?.url, "https://z.example/z");
// Real finding: "zosma ai" buried excerpt matches behind unrelated *.ai hosts. A term matching most of the pool (the TLD "ai")
// must not earn the metadata boost, and a few same-host matches must not be demoted behind unrelated hosts.
const aiUrls = [
	"https://www.linkedin.com/in/a",
	"https://www.linkedin.com/in/b",
	"https://www.linkedin.com/in/c",
	...Array.from({ length: 6 }, (_, i) => `https://tool${i}.ai/x`),
];
const aiOrder = order(
	rerankCandidates(
		aiUrls.map((url) => hit(url, rerankNow)),
		new Map(aiUrls.map((url, index) => [url, index < 3 ? index : index + 8])),
		"zosma ai",
		rerankNow,
	),
);
assert.deepEqual(aiOrder.slice(0, 3), aiUrls.slice(0, 3));

logger.info(
	"history-search: synthetic fixture assertions passed (not product quality evidence); privacy, provenance, filters, deletion, and no-answer passed",
);
