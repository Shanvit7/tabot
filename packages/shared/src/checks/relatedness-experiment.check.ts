import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import {
	type RelatednessTaskRecord,
	runRelatednessExperiment,
} from "../recall/relatedness-experiment";

const event = (id: string, url: string, timestamp: number): StoredTabEvent => ({
	id,
	type: "NAVIGATION",
	tabId: 1,
	windowId: 1,
	timestamp,
	url,
});
const events = [
	event("train-a", "https://docs.example.test/auth", 1_000),
	event("train-b", "https://docs.example.test/auth", 2_000),
	event("train-c", "https://video.example.test/music", 3_000),
	event("eval-a", "https://guide.example.test/login", 4_000),
	event("eval-b", "https://guide.example.test/login", 5_000),
	event("eval-c", "https://unrelated.example.test/cooking", 6_000),
];
const records: RelatednessTaskRecord[] = [
	{
		version: 1,
		threadId: "thread-train",
		split: "train",
		query: "authentication",
		judgedSources: [],
		pairJudgments: [
			{ leftId: "train-a", rightId: "train-b", label: "related" },
			{ leftId: "train-a", rightId: "train-c", label: "unrelated" },
		],
	},
	{
		version: 1,
		threadId: "thread-eval",
		split: "evaluation",
		query: "login",
		judgedSources: [
			{ sourceId: "eval-b", label: "relevant" },
			{ sourceId: "eval-c", label: "irrelevant" },
		],
		pairJudgments: [
			{ leftId: "eval-a", rightId: "eval-b", label: "related" },
			{ leftId: "eval-a", rightId: "eval-c", label: "unrelated" },
		],
	},
];

const { model, report } = await runRelatednessExperiment(records, events);
assert.equal(model.featureVersion, 1);
assert.equal(report.trainThreads, 1);
assert.equal(report.evaluationThreads, 1);
assert.equal(report.trainPairs, 2);
assert.equal(report.evaluationPairs, 2);
assert.equal(report.pageTextPairCoverage, 0);
assert.equal(report.pairAuc.time.count, 2);
assert.equal(report.taskRanking.taladb.tasks, 1);
assert.equal(report.taskRanking.handwired.tasks, 1);
const firstRecord = records[0];
assert.ok(firstRecord);
await assert.rejects(
	runRelatednessExperiment(
		[...records, { ...firstRecord, split: "evaluation" }],
		events,
	),
	/thread-crosses-dataset-splits/,
);
console.log(
	"relatedness-experiment: split isolation and held-out metrics passed",
);
