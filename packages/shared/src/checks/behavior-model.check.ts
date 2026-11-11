import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import {
	BEHAVIOR_MODEL_LIMITS,
	BEHAVIOR_MODEL_SCHEMA,
	buildNextSiteExamples,
	createBehaviorPredictor,
	isBehaviorCheckpoint,
	trainBehaviorCheckpoint,
} from "../workflows/behavior-model";

const event = (
	id: string,
	tabId: number,
	timestamp: number,
	url: string,
	type: StoredTabEvent["type"] = "NAVIGATION",
): StoredTabEvent => ({
	id,
	tabId,
	windowId: 1,
	timestamp,
	url,
	type,
});
const sites = [
	"https://alpha.test/a",
	"https://beta.test/b",
	"https://gamma.test/c",
];
const events = Array.from({ length: 12 }, (_, repeat) =>
	sites.map((url, index) =>
		event(`${repeat}-${index}`, 1, repeat * 60_000 + index * 1_000, url),
	),
).flat();
const refreshedSameOrigin = buildNextSiteExamples([
	event("first", 1, 0, "https://alpha.test/"),
	event("same-site-refresh", 1, 29 * 60_000, "https://alpha.test/next"),
	event("next-site", 1, 31 * 60_000, "https://beta.test/"),
]);
assert.equal(refreshedSameOrigin.length, 1);
assert.equal(
	refreshedSameOrigin[0].sourceIds[0],
	"same-site-refresh",
	"same-site visits refresh idle boundary and source provenance",
);
const examples = buildNextSiteExamples([
	...events,
	event("click", 2, 900_000, "https://ignored.test", "CLICK"),
	event("gap", 1, 2_500_000, "https://delta.test/d"),
]);
assert.equal(
	examples.length,
	35,
	"navigation only, deduplicated and gap-bounded",
);
assert.ok(
	examples.every(
		(example) =>
			example.features.length ===
			BEHAVIOR_MODEL_LIMITS.buckets * BEHAVIOR_MODEL_LIMITS.context,
	),
);
assert.ok(
	examples.every(
		(example) =>
			example.features.filter(Boolean).length <= BEHAVIOR_MODEL_LIMITS.context,
	),
);
const training = await trainBehaviorCheckpoint(events);
assert.ok(training.checkpoint);
assert.equal(training.checkpoint.schema, BEHAVIOR_MODEL_SCHEMA);
assert.equal(training.checkpoint.sourceIds.length, events.length);
const predict = createBehaviorPredictor(training.checkpoint);
assert.ok(predict);
assert.ok(
	examples.every((example) => {
		const prediction = predict(example.features);
		return (
			Number.isInteger(prediction) &&
			prediction >= 0 &&
			prediction < BEHAVIOR_MODEL_LIMITS.buckets
		);
	}),
	"Handwired inference returns a bounded site bucket",
);
const cancelled = await trainBehaviorCheckpoint(events, () => true);
assert.equal(
	cancelled.cancelled,
	true,
	"training yields to cancellation between epochs",
);
assert.equal(isBehaviorCheckpoint(training.checkpoint), true);
assert.ok(
	training.checkpoint.revision.startsWith(
		`behavior-v${BEHAVIOR_MODEL_SCHEMA}-`,
	),
);
assert.equal(
	isBehaviorCheckpoint({ ...training.checkpoint, schema: 1 }),
	false,
	"previous per-tab model checkpoint is rebuilt from cross-tab sequences",
);
assert.equal(
	isBehaviorCheckpoint({
		...training.checkpoint,
		sourceIds: training.checkpoint.sourceIds.map((id, index) =>
			index === 0 ? "x".repeat(128) : id,
		),
	}),
	true,
	"all valid 128-character event IDs fit checkpoint validation",
);
assert.equal(
	isBehaviorCheckpoint({ ...training.checkpoint, weights: [Number.NaN] }),
	false,
	"corrupt/non-finite checkpoint rejected",
);
assert.ok(training.checkpoint.weights.every(Number.isFinite));
assert.deepEqual(
	(await trainBehaviorCheckpoint(events)).checkpoint,
	training.checkpoint,
	"fixed seed produces a reproducible checkpoint",
);
assert.equal(
	(await trainBehaviorCheckpoint(events.slice(0, 4))).checkpoint,
	null,
	"insufficient transitions do not create a checkpoint",
);
console.log(
	`behavior model: ${training.examples} next-site examples; finite checkpoint and bounded Handwired inference passed`,
);
