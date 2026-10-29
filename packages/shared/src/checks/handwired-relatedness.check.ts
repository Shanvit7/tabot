import assert from "node:assert/strict";
import {
	createRelatednessScorer,
	trainRelatednessModel,
} from "../recall/handwired-relatedness";
import {
	RELATEDNESS_FEATURE_NAMES,
	type RelatednessFeatures,
} from "../recall/relatedness";

const related = Array.from(
	{ length: RELATEDNESS_FEATURE_NAMES.length },
	() => 0,
) as RelatednessFeatures;
related[RELATEDNESS_FEATURE_NAMES.indexOf("sameDocumentId")] = 1;
related[RELATEDNESS_FEATURE_NAMES.indexOf("sameTab")] = 1;
const unrelated = Array.from(
	{ length: RELATEDNESS_FEATURE_NAMES.length },
	() => 0,
) as RelatednessFeatures;
const examples = Array.from({ length: 20 }, (_, index) => ({
	features: index < 10 ? unrelated : related,
	label: (index < 10 ? 0 : 1) as 0 | 1,
}));
const model = trainRelatednessModel(examples);
const score = createRelatednessScorer(model);
assert.ok(score(related) > score(unrelated));
assert.deepEqual(trainRelatednessModel(examples).weights, model.weights);
assert.equal(model.featureVersion, 1);
assert.equal(model.upstreamCommit, "257856e3b221140acb4cc4460626b850c0bd4ff1");
assert.throws(() => score([Number.NaN]), /invalid-relatedness-features/);
console.log("handwired-relatedness: synthetic supervised fit passed");
