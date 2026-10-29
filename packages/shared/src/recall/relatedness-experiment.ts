import { constants as fsConstants } from "node:fs";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";
import type { StoredTabEvent } from "../events/db";
import {
	createRelatednessScorer,
	type HandwiredRelatednessModel,
	type RelatednessTrainingExample,
	trainRelatednessModel,
} from "./handwired-relatedness";
import { searchHistory } from "./history-search";
import {
	parseCliArgs,
	queryContainsUrl,
	readEvidenceExport,
	resolveSafeLabelPath,
} from "./local-labeler";
import {
	extractRelatednessFeatures,
	generateRelatednessCandidatesForSeeds,
	RELATEDNESS_FEATURE_NAMES,
	type RelatednessFeatures,
	relatednessIdentityKeys,
	relatednessMatchSignals,
	scoreRelatednessHeuristic,
} from "./relatedness";

export type RelatednessTaskRecord = {
	version: 1;
	threadId: string;
	split: "train" | "evaluation";
	query: string;
	judgedSources: {
		sourceId: string;
		label: "relevant" | "irrelevant" | "ambiguous";
	}[];
	pairJudgments: {
		leftId: string;
		rightId: string;
		label: "related" | "unrelated" | "ambiguous";
	}[];
};

type PairExample = RelatednessTrainingExample & { threadId: string };
type PairMetric = { count: number; auc: number | null };
type TaskMetric = {
	tasks: number;
	precisionAt8: number | null;
	recallAt8: number | null;
	ndcgAt8: number | null;
};

type ExperimentReport = {
	trainThreads: number;
	evaluationThreads: number;
	trainPairs: number;
	evaluationPairs: number;
	pageTextPairCoverage: number;
	pairAuc: Record<
		"handwired" | "heuristic" | "time" | "url" | "lexical",
		PairMetric
	>;
	taskRanking: Record<"taladb" | "handwired" | "heuristic", TaskMetric>;
};

const LABEL_FILE_MAX_BYTES = 8 * 1024 * 1024;
const CANDIDATE_LIMIT = 1_000;
const PAIR_LIMIT = 20_000;
const TIME_GAP_MS = 168 * 60 * 60 * 1_000;
const featureValue = (
	features: RelatednessFeatures,
	name: (typeof RELATEDNESS_FEATURE_NAMES)[number],
) => {
	const value = features[RELATEDNESS_FEATURE_NAMES.indexOf(name)];
	if (value === undefined) throw new Error("missing-relatedness-feature");
	return value;
};

const validSourceId = (value: unknown): value is string =>
	typeof value === "string" &&
	value.length > 0 &&
	value.length <= 128 &&
	!queryContainsUrl(value);

const parseTaskRecord = (value: unknown): RelatednessTaskRecord => {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("invalid-relatedness-task-record");
	const row = value as Record<string, unknown>;
	if (
		row.version !== 1 ||
		typeof row.threadId !== "string" ||
		!row.threadId.trim() ||
		row.threadId.length > 128 ||
		queryContainsUrl(row.threadId) ||
		(row.split !== "train" && row.split !== "evaluation") ||
		typeof row.query !== "string" ||
		!row.query.trim() ||
		row.query.length > 240 ||
		queryContainsUrl(row.query) ||
		!Array.isArray(row.judgedSources) ||
		row.judgedSources.length > 100 ||
		!Array.isArray(row.pairJudgments) ||
		row.pairJudgments.length > 500
	)
		throw new Error("invalid-relatedness-task-record");
	const judgedSources = row.judgedSources.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new Error("invalid-relatedness-source-judgment");
		const judgment = item as Record<string, unknown>;
		if (
			!validSourceId(judgment.sourceId) ||
			!(["relevant", "irrelevant", "ambiguous"] as unknown[]).includes(
				judgment.label,
			)
		)
			throw new Error("invalid-relatedness-source-judgment");
		return {
			sourceId: judgment.sourceId,
			label:
				judgment.label as RelatednessTaskRecord["judgedSources"][number]["label"],
		};
	});
	const pairJudgments = row.pairJudgments.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new Error("invalid-relatedness-pair-judgment");
		const judgment = item as Record<string, unknown>;
		if (
			!validSourceId(judgment.leftId) ||
			!validSourceId(judgment.rightId) ||
			judgment.leftId === judgment.rightId ||
			!(["related", "unrelated", "ambiguous"] as unknown[]).includes(
				judgment.label,
			)
		)
			throw new Error("invalid-relatedness-pair-judgment");
		return {
			leftId: judgment.leftId,
			rightId: judgment.rightId,
			label:
				judgment.label as RelatednessTaskRecord["pairJudgments"][number]["label"],
		};
	});
	return {
		version: 1,
		threadId: row.threadId,
		split: row.split,
		query: row.query,
		judgedSources,
		pairJudgments,
	};
};

export const readRelatednessTaskRecords = async (
	repoRoot: string,
	path: string,
): Promise<RelatednessTaskRecord[]> => {
	const safePath = await resolveSafeLabelPath(repoRoot, path);
	const [actualPath, fileInfo] = await Promise.all([
		realpath(safePath),
		stat(safePath),
	]);
	const root = await realpath(repoRoot);
	if (
		actualPath === root ||
		actualPath.startsWith(`${root}/`) ||
		fileInfo.size > LABEL_FILE_MAX_BYTES
	)
		throw new Error("invalid-relatedness-label-file");
	const content = await readFile(actualPath, "utf8");
	const records = content
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line, index) => {
			try {
				return parseTaskRecord(JSON.parse(line));
			} catch {
				throw new Error(`invalid-relatedness-label-line-${index + 1}`);
			}
		});
	if (!records.length) throw new Error("empty-relatedness-label-file");
	return records;
};

const auc = (rows: { score: number; label: 0 | 1 }[]): number | null => {
	const positives = rows.filter((row) => row.label === 1).length;
	const negatives = rows.length - positives;
	if (!positives || !negatives) return null;
	const sorted = [...rows].sort((a, b) => a.score - b.score);
	let rankSum = 0;
	for (let start = 0; start < sorted.length; ) {
		let end = start + 1;
		while (end < sorted.length && sorted[end]?.score === sorted[start]?.score)
			end++;
		const averageRank = (start + 1 + end) / 2;
		for (let index = start; index < end; index++)
			if (sorted[index]?.label === 1) rankSum += averageRank;
		start = end;
	}
	return (
		(rankSum - (positives * (positives + 1)) / 2) / (positives * negatives)
	);
};

const rankingMetrics = (
	rankedIds: string[],
	judgments: RelatednessTaskRecord["judgedSources"],
): Omit<TaskMetric, "tasks"> | null => {
	const labels = new Map(
		judgments
			.filter(({ label }) => label !== "ambiguous")
			.map(({ sourceId, label }) => [sourceId, label === "relevant"]),
	);
	const relevantCount = [...labels.values()].filter(Boolean).length;
	if (!labels.size || !relevantCount) return null;
	const ranked = rankedIds.filter((id) => labels.has(id)).slice(0, 8);
	const denominator = Math.min(8, labels.size);
	let hits = 0;
	let dcg = 0;
	for (const [index, id] of ranked.entries()) {
		if (!labels.get(id)) continue;
		hits++;
		dcg += 1 / Math.log2(index + 2);
	}
	const ideal = Array.from(
		{ length: Math.min(8, relevantCount) },
		(_, index) => 1 / Math.log2(index + 2),
	).reduce((sum, score) => sum + score, 0);
	return {
		precisionAt8: hits / denominator,
		recallAt8: hits / relevantCount,
		ndcgAt8: dcg / ideal,
	};
};

const averageTaskMetrics = (
	records: RelatednessTaskRecord[],
	ranks: Map<string, string[]>,
	kind: "taladb" | "relatedness",
): TaskMetric => {
	const rows = records.flatMap((record, index) => {
		const metric = rankingMetrics(
			ranks.get(`${kind}:${index}`) ?? [],
			record.judgedSources,
		);
		return metric ? [metric] : [];
	});
	if (!rows.length)
		return { tasks: 0, precisionAt8: null, recallAt8: null, ndcgAt8: null };
	return {
		tasks: rows.length,
		precisionAt8:
			rows.reduce((sum, row) => sum + (row.precisionAt8 ?? 0), 0) / rows.length,
		recallAt8:
			rows.reduce((sum, row) => sum + (row.recallAt8 ?? 0), 0) / rows.length,
		ndcgAt8:
			rows.reduce((sum, row) => sum + (row.ndcgAt8 ?? 0), 0) / rows.length,
	};
};

const taskRanking = async (
	records: RelatednessTaskRecord[],
	evidence: StoredTabEvent[],
	scorePair: (features: RelatednessFeatures) => number,
): Promise<Map<string, string[]>> => {
	const byId = new Map(evidence.map((row) => [row.id, row]));
	const ranked = new Map<string, string[]>();
	for (const [index, record] of records.entries()) {
		const directResults = await searchHistory(evidence, [], record.query, {
			limit: 20,
		});
		const directIds = [
			...new Set(
				directResults.flatMap((result) =>
					result.sources.map((source) => source.id),
				),
			),
		];
		ranked.set(`taladb:${index}`, directIds);
		const seedIds = directIds.slice(0, 8).filter((id) => byId.has(id));
		const seeds = seedIds.flatMap((id) => {
			const seed = byId.get(id);
			return seed ? [seed] : [];
		});
		const identityKeys = new Set(seeds.flatMap(relatednessIdentityKeys));
		const nearby = evidence
			.filter((row) => row.timestamp <= Date.now())
			.map((row) => ({
				row,
				sharesIdentity: relatednessIdentityKeys(row).some((key) =>
					identityKeys.has(key),
				),
				timeGap: Math.min(
					...seeds.map((seed) => Math.abs(row.timestamp - seed.timestamp)),
				),
			}))
			.filter(
				({ sharesIdentity, timeGap }) =>
					sharesIdentity || timeGap <= TIME_GAP_MS,
			)
			.sort(
				(left, right) =>
					Number(right.sharesIdentity) - Number(left.sharesIdentity) ||
					left.timeGap - right.timeGap ||
					left.row.timestamp - right.row.timestamp,
			)
			.slice(0, CANDIDATE_LIMIT)
			.map(({ row }) => row);
		const candidateEvidence = new Map(
			[...seeds, ...nearby].map((row) => [row.id, row]),
		);
		const pairs = generateRelatednessCandidatesForSeeds(
			[...candidateEvidence.values()],
			seedIds,
			{
				maxPairs: PAIR_LIMIT,
				maxTemporalNeighbors: 64,
				maxTimeGapMs: TIME_GAP_MS,
			},
		);
		const candidateScores = new Map<string, number>();
		for (const pair of pairs) {
			const left = byId.get(pair.sourceIds[0]);
			const right = byId.get(pair.sourceIds[1]);
			if (!left || !right) continue;
			const leftSeed = seedIds.includes(left.id);
			const rightSeed = seedIds.includes(right.id);
			if (leftSeed === rightSeed) continue;
			const seed = leftSeed ? left : right;
			const candidate = leftSeed ? right : left;
			const features = extractRelatednessFeatures(seed, candidate).features;
			if (!relatednessMatchSignals(features).length) continue;
			candidateScores.set(
				candidate.id,
				Math.max(
					candidateScores.get(candidate.id) ?? -Infinity,
					scorePair(features),
				),
			);
		}
		const modelIds = [...candidateScores]
			.sort(
				([leftId, leftScore], [rightId, rightScore]) =>
					rightScore - leftScore ||
					(byId.get(rightId)?.timestamp ?? 0) -
						(byId.get(leftId)?.timestamp ?? 0) ||
					leftId.localeCompare(rightId),
			)
			.map(([id]) => id);
		ranked.set(`relatedness:${index}`, modelIds);
	}
	return ranked;
};

export const runRelatednessExperiment = async (
	inputRecords: RelatednessTaskRecord[],
	evidence: StoredTabEvent[],
): Promise<{ model: HandwiredRelatednessModel; report: ExperimentReport }> => {
	const records = inputRecords.map(parseTaskRecord);
	const threadSplits = new Map<string, string>();
	const sourceSplits = new Map<string, string>();
	for (const record of records) {
		const previousSplit = threadSplits.get(record.threadId);
		if (previousSplit && previousSplit !== record.split)
			throw new Error("thread-crosses-dataset-splits");
		threadSplits.set(record.threadId, record.split);
		for (const sourceId of [
			...record.judgedSources.map(({ sourceId }) => sourceId),
			...record.pairJudgments.flatMap(({ leftId, rightId }) => [
				leftId,
				rightId,
			]),
		]) {
			const previousSourceSplit = sourceSplits.get(sourceId);
			if (previousSourceSplit && previousSourceSplit !== record.split)
				throw new Error("source-crosses-dataset-splits");
			sourceSplits.set(sourceId, record.split);
		}
	}
	const byId = new Map(evidence.map((row) => [row.id, row]));
	if (byId.size !== evidence.length)
		throw new Error("duplicate-local-evidence-id");
	for (const sourceId of records.flatMap((record) =>
		record.judgedSources.map(({ sourceId }) => sourceId),
	))
		if (!byId.has(sourceId))
			throw new Error("labeled-source-not-in-local-evidence");
	const examples = records.flatMap((record) =>
		record.pairJudgments.flatMap((judgment) => {
			if (judgment.label === "ambiguous") return [];
			const left = byId.get(judgment.leftId);
			const right = byId.get(judgment.rightId);
			if (!left || !right)
				throw new Error("labeled-source-not-in-local-evidence");
			return [
				{
					threadId: record.threadId,
					features: extractRelatednessFeatures(left, right).features,
					label: judgment.label === "related" ? (1 as const) : (0 as const),
				},
			];
		}),
	);
	const training = examples.filter((example) =>
		records.some(
			(record) =>
				record.threadId === example.threadId && record.split === "train",
		),
	);
	const evaluation = examples.filter((example) =>
		records.some(
			(record) =>
				record.threadId === example.threadId && record.split === "evaluation",
		),
	);
	if (
		!training.some(({ label }) => label === 1) ||
		!training.some(({ label }) => label === 0)
	)
		throw new Error("training-split-needs-related-and-unrelated-pairs");
	const model = trainRelatednessModel(training);
	const handwired = createRelatednessScorer(model);
	const metric = (
		score: (features: RelatednessFeatures) => number,
		rows: PairExample[],
	): PairMetric => ({
		count: rows.length,
		auc: auc(
			rows.map(({ features, label }) => ({ score: score(features), label })),
		),
	});
	const evaluationRecords = records.filter(
		(record) => record.split === "evaluation",
	);
	const [handwiredRanks, heuristicRanks] = await Promise.all([
		taskRanking(evaluationRecords, evidence, handwired),
		taskRanking(evaluationRecords, evidence, scoreRelatednessHeuristic),
	]);
	const taskAuc = (prefix: "handwired" | "heuristic") =>
		metric(
			prefix === "handwired" ? handwired : scoreRelatednessHeuristic,
			evaluation,
		);
	const report: ExperimentReport = {
		trainThreads: new Set(
			records.filter((row) => row.split === "train").map((row) => row.threadId),
		).size,
		evaluationThreads: new Set(evaluationRecords.map((row) => row.threadId))
			.size,
		trainPairs: training.length,
		evaluationPairs: evaluation.length,
		pageTextPairCoverage:
			evaluation.length === 0
				? 0
				: evaluation.filter(
						({ features }) =>
							features[RELATEDNESS_FEATURE_NAMES.indexOf("bothPageTexts")] ===
							1,
					).length / evaluation.length,
		pairAuc: {
			handwired: taskAuc("handwired"),
			heuristic: taskAuc("heuristic"),
			time: metric(
				(features) => -featureValue(features, "logGapSeconds"),
				evaluation,
			),
			url: metric((features) => featureValue(features, "sameUrl"), evaluation),
			lexical: metric(
				(features) => featureValue(features, "pageTextJaccard"),
				evaluation,
			),
		},
		taskRanking: {
			taladb: averageTaskMetrics(evaluationRecords, handwiredRanks, "taladb"),
			handwired: averageTaskMetrics(
				evaluationRecords,
				handwiredRanks,
				"relatedness",
			),
			heuristic: averageTaskMetrics(
				evaluationRecords,
				heuristicRanks,
				"relatedness",
			),
		},
	};
	return { model, report };
};

const writeNewLocalModel = async (
	repoRoot: string,
	requestedPath: string,
	model: HandwiredRelatednessModel,
) => {
	const path = await resolveSafeLabelPath(repoRoot, requestedPath);
	const file = await open(
		path,
		fsConstants.O_WRONLY |
			fsConstants.O_CREAT |
			fsConstants.O_EXCL |
			fsConstants.O_NOFOLLOW,
		0o600,
	);
	try {
		const [opened, actualPath] = await Promise.all([
			file.stat(),
			realpath(path),
		]);
		const root = await realpath(repoRoot);
		if (
			actualPath === root ||
			actualPath.startsWith(`${root}/`) ||
			opened.nlink !== 1
		)
			throw new Error("model-must-stay-outside-repository");
		await file.writeFile(`${JSON.stringify(model)}\n`, "utf8");
		await file.chmod(0o600);
	} finally {
		await file.close();
	}
};

const main = async () => {
	const [exportPath, labelsPath, modelPath] = parseCliArgs(argv.slice(2));
	if (!exportPath) {
		stderr.write(
			"Usage: pnpm --filter @tabot/shared relatedness:local -- <export.jsonl> [labels.jsonl] [model.json]\n",
		);
		process.exitCode = 2;
		return;
	}
	const repoRoot = resolve(import.meta.dirname, "../../../..");
	const defaultLabels = resolve(
		homedir(),
		".tabot",
		"relatedness-labels.jsonl",
	);
	const outputPath = resolve(
		modelPath ??
			resolve(homedir(), ".tabot", `relatedness-model-${Date.now()}.json`),
	);
	const [{ events }, records] = await Promise.all([
		readEvidenceExport(resolve(exportPath)),
		readRelatednessTaskRecords(repoRoot, resolve(labelsPath ?? defaultLabels)),
	]);
	const { model, report } = await runRelatednessExperiment(records, events);
	await writeNewLocalModel(repoRoot, outputPath, model);
	stdout.write(
		`${JSON.stringify({ modelPath: outputPath, report }, null, 2)}\n`,
	);
};

if (argv[1]?.endsWith("relatedness-experiment.ts"))
	main().catch((error: unknown) => {
		stderr.write(
			`${error instanceof Error ? error.message : "relatedness-experiment-failed"}\n`,
		);
		process.exitCode = 1;
	});
