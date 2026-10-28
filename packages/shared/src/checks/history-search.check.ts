import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";
import type { StoredPageObservation } from "../pages/observations";
import { searchHistory } from "../recall/history-search";

const event = (id: string, url: string, timestamp: number): StoredTabEvent => ({
	id,
	type: "TAB_UPDATED",
	tabId: 1,
	windowId: 1,
	timestamp,
	url,
});
const page = (
	id: string,
	url: string,
	timestamp: number,
	text: string,
	redacted = true,
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
	segments: [text],
	privacy: { policyVersion: 1, redacted, findings: [] },
	coverage: { truncated: false, partial: false },
});

const events = [
	event("event-1", "https://example.com/docs/pkce?secret=redacted", 100),
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
		"page-private",
		"https://example.com/private",
		280,
		"secret password token",
		false,
	),
];

const exact = await searchHistory(events, pages, "PKCE verifier");
assert.equal(exact[0]?.url, "https://example.com/docs/pkce");
assert.equal(exact[0]?.pageCount, 2);
assert.equal(exact[0]?.eventCount, 2);
assert.equal(exact[0]?.sourceCount, 4);
assert.equal(exact[0]?.sources[0]?.url, "https://example.com/docs/pkce");
assert.equal(exact[0]?.excerpt.includes("PKCE"), true);
assert.equal(exact[0]?.url.includes("secret"), false);

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
	`history-search: Recall@3=${recallAt3.toFixed(2)} MRR=${mrr.toFixed(2)}; privacy, provenance, filters, deletion, and no-answer passed`,
);
