import assert from "node:assert/strict";
import {
	getTypedText,
	getVerificationStage,
} from "../components/features/assistant/chatgpt-tutorial/timeline.ts";
import {
	CHATGPT_SEARCH_ANSWER,
	CHATGPT_SEARCH_RESULTS,
	getTabotSearchStage,
	SEARCH_DEMO_DURATION,
	SEARCH_QUERY,
	TABOT_SEARCH_COUNTS,
	TABOT_SEARCH_RESULTS,
} from "../components/features/landing/demo/paired-search-demo-data.ts";

assert.equal(SEARCH_DEMO_DURATION, 20 * 30);
assert.equal(SEARCH_QUERY, "Search on Acme company");
assert.equal(getTypedText(SEARCH_QUERY, 120, 18, 100), SEARCH_QUERY);
assert.equal(getTypedText(SEARCH_QUERY, 150, 20, 130), SEARCH_QUERY);
assert.deepEqual([0, 150, 180, 240, 599, 200, 0].map(getVerificationStage), [
	"compose",
	"compose",
	"calling",
	"answer",
	"answer",
	"calling",
	"compose",
]);
assert.deepEqual([0, 150, 180, 240, 320].map(getTabotSearchStage), [
	"search",
	"results",
	"select-pages",
	"period",
	"pages",
]);
assert.equal(
	getTypedText(CHATGPT_SEARCH_ANSWER, 295, 240, 55),
	CHATGPT_SEARCH_ANSWER,
);
assert.deepEqual(TABOT_SEARCH_COUNTS, {
	Everything: 4,
	Sites: 2,
	Pages: 2,
	Notes: 0,
});
assert.equal(
	CHATGPT_SEARCH_RESULTS.reduce((count, result) => count + result.pageCount, 0),
	2,
);
assert.equal(TABOT_SEARCH_RESULTS.length, 2);

const chatSites = CHATGPT_SEARCH_RESULTS.map(
	(result) => new URL(result.site).hostname,
).sort();
const localSites = TABOT_SEARCH_RESULTS.map((page) => page.host).sort();
assert.deepEqual(localSites, chatSites);
for (const result of CHATGPT_SEARCH_RESULTS) {
	assert.ok(new URL(result.site).hostname.endsWith(".example"));
	assert.deepEqual(Object.keys(result).sort(), [
		"anchors",
		"eventCount",
		"firstSeen",
		"lastSeen",
		"matchedFrom",
		"matchedTerms",
		"pageCount",
		"site",
	]);
}
for (const page of TABOT_SEARCH_RESULTS) {
	assert.equal(new URL(page.url).hostname, page.host);
	assert.equal(page.pageExcerptAvailable, true);
	assert.ok(page.pageTitle && page.excerpt);
	assert.ok(new URL(page.url).hostname.endsWith(".example"));
}
console.log("Paired ChatGPT/Tabot search demo checks passed.");
