import assert from "node:assert/strict";
import { admitSemanticHit, fuseCandidateUrls } from "./search-ranking";

const fused = fuseCandidateUrls([
	[
		"semantic-1",
		"semantic-2",
		"semantic-3",
		"semantic-4",
		"semantic-5",
		"semantic-6",
		"semantic-7",
		"semantic-8",
		"semantic-9",
		"semantic-10",
		"exact-lexical",
	],
	["exact-lexical", "exact-lexical"],
]);

assert.equal(
	fused[0],
	"exact-lexical",
	"lexical rank must offset weaker vector rank",
);
assert.equal(fused.filter((url) => url === "exact-lexical").length, 1);
assert.deepEqual(fuseCandidateUrls([[], ["first", "second"]]), [
	"first",
	"second",
]);
// BM25 hit always admitted; vector-only needs 0.25 alone, 0.35 once BM25 has literal matches.
assert.ok(admitSemanticHit({ textRank: 3 }, undefined, 5));
assert.ok(admitSemanticHit({ textRank: null }, 0.3, 0));
assert.ok(!admitSemanticHit({ textRank: null }, 0.24, 0));
assert.ok(
	!admitSemanticHit({ textRank: null }, 0.3, 5),
	"noise next to literal hits",
);
assert.ok(admitSemanticHit({ textRank: null }, 0.36, 5));
assert.ok(!admitSemanticHit({ textRank: null }, undefined, 0));
console.log("search-ranking: reciprocal-rank fusion passed");
