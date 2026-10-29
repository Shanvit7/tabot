import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import type { StoredPageObservation } from "../pages/observations";
import {
	extractRelatednessFeatures,
	generateRelatednessCandidates,
	generateRelatednessCandidatesForSeeds,
	RELATEDNESS_FEATURE_NAMES,
	RELATEDNESS_FEATURE_VERSION,
	relatednessIdentityKeys,
	relatednessMatchSignals,
	scoreRelatednessHeuristic,
} from "../recall/relatedness";

const event = (
	id: string,
	timestamp: number,
	url?: string,
): StoredTabEvent => ({
	id,
	type: "NAVIGATION",
	tabId: 4,
	windowId: 2,
	timestamp,
	...(url ? { url } : {}),
	source: { instanceId: "instance", sequence: timestamp, documentId: "doc-a" },
});
const page = (
	id: string,
	timestamp: number,
	url: string,
	text: string,
): StoredPageObservation => ({
	id,
	kind: "page-observation",
	timestamp,
	tabId: 4,
	windowId: 2,
	documentId: "doc-a",
	pageKey: "a".repeat(64),
	captureIdentity: id,
	url,
	trigger: "interaction",
	segments: [text],
	privacy: { policyVersion: 1, redacted: true, findings: [] },
	coverage: { truncated: false, partial: false },
});
const feature = (
	values: number[],
	name: (typeof RELATEDNESS_FEATURE_NAMES)[number],
) => values[RELATEDNESS_FEATURE_NAMES.indexOf(name)];

const navigation = event(
	"event-1",
	1_000,
	"https://docs.example.test/auth?token=hidden#section",
);
const observation = page(
	"page-1",
	2_000,
	"https://docs.example.test/auth",
	"OAuth callback nonce verifier",
);
const pair = extractRelatednessFeatures(navigation, observation);
assert.equal(pair.featureVersion, RELATEDNESS_FEATURE_VERSION);
assert.deepEqual(pair.sourceIds, ["event-1", "page-1"]);
assert.deepEqual(pair.timestamps, [1_000, 2_000]);
assert.equal(pair.features.length, RELATEDNESS_FEATURE_NAMES.length);
assert.equal(feature(pair.features, "sameTab"), 1);
assert.equal(feature(pair.features, "sameWindow"), 1);
assert.equal(feature(pair.features, "sameUrl"), 1);
assert.equal(feature(pair.features, "sameDocumentId"), 1);
assert.equal(feature(pair.features, "bothPageTexts"), 0);
assert.equal(feature(pair.features, "pageTextJaccard"), 0);
assert.equal(JSON.stringify(pair).includes("token=hidden"), false);
assert.deepEqual(relatednessIdentityKeys(navigation), [
	"url:https://docs.example.test/auth",
	"document:doc-a",
]);
assert.equal(JSON.stringify(pair).includes("OAuth callback"), false);
assert.deepEqual(relatednessMatchSignals(pair.features).sort(), [
	"same_document",
	"same_url",
	"similar_path",
]);
assert.ok(scoreRelatednessHeuristic(pair.features) > 0);
assert.throws(
	() => scoreRelatednessHeuristic([Number.NaN]),
	/invalid-relatedness-features/,
);

const secondPage = page(
	"page-2",
	60_000,
	"https://docs.example.test/auth?source=history",
	"OAuth verifier callback flow",
);
const pagePair = extractRelatednessFeatures(observation, secondPage);
assert.equal(feature(pagePair.features, "bothPageTexts"), 1);
assert.ok(feature(pagePair.features, "pageTextJaccard") > 0);
assert.equal(feature(pagePair.features, "samePageKey"), 1);

const candidates = generateRelatednessCandidates(
	[
		event("event-1", 1_000, "https://docs.example.test/auth"),
		page("page-1", 1_010, "https://docs.example.test/auth", "OAuth"),
		page("page-2", 60_000, "https://docs.example.test/auth", "callback"),
	],
	{ maxPairs: 10, maxTemporalNeighbors: 1, maxTimeGapMs: 20 },
);
assert.equal(candidates.length, 2);
assert.deepEqual(candidates[0]?.sourceIds, ["event-1", "page-1"]);
assert.deepEqual(candidates[1]?.sourceIds, ["page-1", "page-2"]);
assert.equal(
	generateRelatednessCandidates(
		[
			event("event-1", 1_000, "https://docs.example.test/auth"),
			page("page-1", 1_010, "https://docs.example.test/auth", "OAuth"),
			page("page-2", 60_000, "https://docs.example.test/auth", "callback"),
		],
		{ maxPairs: 1, maxTemporalNeighbors: 1, maxTimeGapMs: 20 },
	).length,
	1,
);
const anchorCandidates = generateRelatednessCandidatesForSeeds(
	[
		page("chain-a", 1_000, "https://docs.example.test/auth", "OAuth"),
		page("chain-b", 60_000, "https://docs.example.test/auth", "callback"),
		page("chain-c", 120_000, "https://docs.example.test/auth", "verifier"),
	],
	["chain-a"],
	{ maxPairs: 10, maxTemporalNeighbors: 0, maxTimeGapMs: 0 },
);
assert.ok(
	anchorCandidates.some(
		(candidate) => candidate.sourceIds.includes("chain-c"),
		"seeded exact-identity candidates include non-adjacent visits",
	),
);
assert.deepEqual(
	generateRelatednessCandidates(
		[
			event("near-event", 1_000, "https://app.example.test/task"),
			page("near-page", 1_010, "https://docs.example.test/guide", "help"),
		],
		{ maxPairs: 1, maxTemporalNeighbors: 1, maxTimeGapMs: 20 },
	)[0]?.sourceIds,
	["near-event", "near-page"],
);
assert.throws(
	() =>
		generateRelatednessCandidates([], {
			maxPairs: 0,
			maxTemporalNeighbors: 1,
			maxTimeGapMs: 100,
		}),
	/invalid-relatedness-limits/,
);
console.log(
	"relatedness: bounded candidates and provenance-only features passed",
);
