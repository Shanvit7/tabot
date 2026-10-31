import assert from "node:assert/strict";
import { fuseCandidateUrls } from "./search-ranking";

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
console.log("search-ranking: reciprocal-rank fusion passed");
