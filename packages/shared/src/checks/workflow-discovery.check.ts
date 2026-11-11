import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import { trainBehaviorCheckpoint } from "../workflows/behavior-model";
import { discoverHandwiredWorkflows } from "../workflows/discovery";

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

const sites = ["https://alpha.test", "https://beta.test", "https://gamma.test"];
const events = Array.from({ length: 12 }, (_, repeat) =>
	sites.map((url, index) =>
		event(
			`repeat-${repeat}-${index}`,
			1,
			repeat * 600_000 + index * 1_000,
			url,
		),
	),
).flat();
const training = await trainBehaviorCheckpoint(events);
assert.ok(
	training.checkpoint,
	"repeated navigation trains a local Handwired model",
);
const candidates = discoverHandwiredWorkflows(events, training.checkpoint);
assert.ok(candidates.length > 0, "model predicts repeated site sequences");
assert.ok(
	candidates.every((candidate) => candidate.modelMatches >= 2),
	"each discovered pattern has repeated model-predicted examples",
);
const localWorkflowEvents = Array.from({ length: 12 }, (_, repeat) =>
	[
		"http://localhost:3000",
		"https://www.linkedin.com",
		"http://localhost:3000",
	].map((url, index) =>
		event(`local-${repeat}-${index}`, 1, repeat * 600_000 + index * 1_000, url),
	),
).flat();
const localTraining = await trainBehaviorCheckpoint(localWorkflowEvents);
assert.ok(localTraining.checkpoint);
assert.deepEqual(
	discoverHandwiredWorkflows(localWorkflowEvents, localTraining.checkpoint),
	[],
	"patterns containing non-HTTPS origins cannot be handed off",
);
assert.ok(
	candidates.every(
		(candidate) =>
			candidate.steps.length >= 2 &&
			candidate.steps.length <= 3 &&
			candidate.occurrences.every(
				(occurrence) => occurrence.sourceIds.length === candidate.steps.length,
			),
	),
	"candidate steps retain source provenance",
);
const tabSwitchEvents = Array.from({ length: 6 }, (_, repeat) =>
	sites.map((url, index) =>
		event(
			`tab-switch-${repeat}-${index}`,
			index + 1,
			repeat * 600_000 + index * 1_000,
			url,
			"TAB_ACTIVATED",
		),
	),
).flat();
const tabSwitchTraining = await trainBehaviorCheckpoint(tabSwitchEvents);
assert.ok(
	tabSwitchTraining.checkpoint,
	"switching between the same tabs produces Handwired training examples",
);
assert.ok(
	discoverHandwiredWorkflows(tabSwitchEvents, tabSwitchTraining.checkpoint)
		.length > 0,
	"Handwired discovers repeated paths made by switching between tabs",
);
const quickRepeats = Array.from({ length: 4 }, (_, repeat) =>
	sites.map((url, index) =>
		event(`quick-${repeat}-${index}`, 1, repeat * 120_000 + index * 1_000, url),
	),
).flat();
const quickTraining = await trainBehaviorCheckpoint(quickRepeats);
assert.ok(quickTraining.checkpoint);
assert.ok(
	discoverHandwiredWorkflows(quickRepeats, quickTraining.checkpoint).length > 0,
	"rapidly repeated workflows count as separate non-overlapping evidence",
);
assert.deepEqual(
	discoverHandwiredWorkflows(events, null),
	[],
	"discovery has no deterministic fallback without a Handwired checkpoint",
);
const oneOffEvents = [
	...events,
	event("one-off-a", 2, 8_000_000, "https://delta.test"),
	event("one-off-b", 2, 8_001_000, "https://epsilon.test"),
];
const withOneOffs = discoverHandwiredWorkflows(
	oneOffEvents,
	training.checkpoint,
);
assert.ok(
	withOneOffs.every(
		(candidate) => !candidate.steps.some((step) => step.host === "delta.test"),
	),
	"one-off navigation is not shown as a recurring model pattern",
);
console.log(
	`Handwired workflow discovery: ${candidates.length} predicted repeated sequences from ${training.examples} next-site examples`,
);
