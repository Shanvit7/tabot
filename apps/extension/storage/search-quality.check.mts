import assert from "node:assert/strict";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

type EvidenceType =
	| "url-only"
	| "title-only"
	| "auto-snippet"
	| "interaction-excerpt";
type Document = { id: string; text: string; evidenceType: EvidenceType };
type Query = { query: string; relevant: Record<string, number> };
type Metrics = {
	recallAt5: number | null;
	precisionAt5: number | null;
	mrrAt5: number | null;
	ndcgAt5: number | null;
	rocAuc: number | null;
	noAnswerRate: number;
};

const model = "Xenova/multi-qa-MiniLM-L6-cos-v1";
const documents: Document[] = [
	{
		id: "taladb-web",
		evidenceType: "auto-snippet",
		text: "Run a full vector and document database in the browser tab. Store and query application data, then pair TalaDB with an on-device embedding model to add semantic search, BM25 full-text, and hybrid RAG retrieval with no server, no API key, and no data leaving the user's machine.",
	},
	{
		id: "taladb-url-only",
		evidenceType: "url-only",
		text: "taladb.dev guide web.html",
	},
	{
		id: "taladb-vector",
		evidenceType: "interaction-excerpt",
		text: "TalaDB vector search indexes embeddings and ranks related passages by cosine similarity. Applications generate embeddings locally and persist them with their documents.",
	},
	{
		id: "taladb-hybrid",
		evidenceType: "auto-snippet",
		text: "TalaDB hybrid search combines full-text BM25 matches with semantic vector results using reciprocal rank fusion. It supports browser-local retrieval without sending data to a server.",
	},
	{
		id: "linkedin-jobs",
		evidenceType: "auto-snippet",
		text: "LinkedIn job search results list open roles, employers, locations, and filters for finding work.",
	},
	{
		id: "react-router",
		evidenceType: "interaction-excerpt",
		text: "TanStack Router loaders fetch route data before rendering a page and surface failures through route error boundaries.",
	},
	{
		id: "privacy",
		evidenceType: "auto-snippet",
		text: "Tabot keeps browser activity and captured page excerpts on device in extension-owned OPFS storage. Search does not upload browsing history.",
	},
	{
		id: "cooking",
		evidenceType: "auto-snippet",
		text: "A flaky croissant dough needs cold butter, repeated folds, and a hot oven for crisp layers.",
	},
	{
		id: "design",
		evidenceType: "auto-snippet",
		text: "A dashboard uses typography, spacing, and color contrast to clarify information hierarchy.",
	},
	{
		id: "title-database",
		evidenceType: "title-only",
		text: "Database in the Browser: TalaDB Guide",
	},
];
const queries: Query[] = [
	{
		query: "how to use a database in the browser without a server",
		relevant: { "taladb-web": 2, "taladb-hybrid": 1 },
	},
	{
		query: "what did I read about db vector search",
		relevant: { "taladb-web": 1, "taladb-vector": 2, "taladb-hybrid": 1 },
	},
	{
		query: "find semantic search with full text",
		relevant: { "taladb-hybrid": 2, "taladb-vector": 1 },
	},
	{
		query: "what is TalaDB",
		relevant: {
			"taladb-web": 2,
			"taladb-vector": 1,
			"taladb-hybrid": 1,
		},
	},
	{ query: "database", relevant: { "taladb-web": 2 } },
	{
		query: "Database in the Browser: TalaDB Guide",
		relevant: { "title-database": 2 },
	},
	{
		query: "vector and document database in browser tab",
		relevant: { "taladb-web": 2 },
	},
	{
		query: "db",
		relevant: { "taladb-web": 2, "taladb-vector": 1, "taladb-hybrid": 1 },
	},
	{ query: "LinkedIn jobs near me", relevant: { "linkedin-jobs": 2 } },
	{
		query: "where did I see route loader errors",
		relevant: { "react-router": 2 },
	},
	{
		query: "private local browser history not uploaded",
		relevant: { privacy: 2, "taladb-hybrid": 1 },
	},
	{ query: "how do I bake croissants", relevant: { cooking: 2 } },
	{ query: "design system dashboard typography", relevant: { design: 2 } },
	{ query: "how do I renew my car registration", relevant: {} },
];
const cosine = (left: number[], right: number[]) =>
	left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
const dcg = (grades: number[]) =>
	grades.reduce(
		(sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2),
		0,
	);
const auc = (scores: { score: number; relevant: boolean }[]) => {
	const positives = scores.filter((score) => score.relevant);
	const negatives = scores.filter((score) => !score.relevant);
	if (!positives.length || !negatives.length) return undefined;
	let wins = 0;
	for (const positive of positives)
		for (const negative of negatives)
			wins +=
				positive.score > negative.score
					? 1
					: Number(positive.score === negative.score) / 2;
	return wins / (positives.length * negatives.length);
};
const evaluate = (
	rankings: { query: Query; scores: { id: string; score: number }[] }[],
	threshold: number,
): Metrics => {
	let recallAt5 = 0;
	let precisionAt5 = 0;
	let mrrAt5 = 0;
	let ndcgAt5 = 0;
	let noAnswerRate = 0;
	const aucs: number[] = [];
	for (const { query, scores } of rankings) {
		const ranked = scores
			.filter(({ score }) => score >= threshold)
			.sort((left, right) => right.score - left.score);
		const top = ranked.slice(0, 5);
		const relevantIds = Object.keys(query.relevant);
		const hits = top.filter(({ id }) => query.relevant[id] !== undefined);
		if (relevantIds.length) {
			recallAt5 += hits.length / relevantIds.length;
			precisionAt5 += hits.length / 5;
			const first = top.findIndex(({ id }) => query.relevant[id] !== undefined);
			mrrAt5 += first < 0 ? 0 : 1 / (first + 1);
			const ideal = relevantIds
				.map((id) => query.relevant[id] ?? 0)
				.sort((left, right) => right - left)
				.slice(0, 5);
			ndcgAt5 +=
				dcg(top.map(({ id }) => query.relevant[id] ?? 0)) / (dcg(ideal) || 1);
		} else {
			noAnswerRate += Number(top.length > 0);
		}
		const queryAuc = auc(
			scores.map(({ id, score }) => ({
				score,
				relevant: query.relevant[id] !== undefined,
			})),
		);
		if (queryAuc !== undefined) aucs.push(queryAuc);
	}
	const answerable = rankings.filter(
		({ query }) => Object.keys(query.relevant).length > 0,
	).length;
	const noAnswer = rankings.length - answerable;
	return {
		recallAt5: answerable ? recallAt5 / answerable : null,
		precisionAt5: answerable ? precisionAt5 / answerable : null,
		mrrAt5: answerable ? mrrAt5 / answerable : null,
		ndcgAt5: answerable ? ndcgAt5 / answerable : null,
		rocAuc: aucs.length
			? aucs.reduce((sum, score) => sum + score, 0) / aucs.length
			: null,
		noAnswerRate: noAnswer ? noAnswerRate / noAnswer : 0,
	};
};

const assets = path.resolve(".cache/semantic/models");
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = `${assets}${path.sep}`;
const embed = await pipeline("feature-extraction", model, {
	device: "cpu",
	dtype: "q8",
});
const embedText = async (text: string) =>
	Array.from(
		(await embed(text, { pooling: "mean", normalize: true }))
			.data as Float32Array,
	);
const documentVectors = await Promise.all(
	documents.map(async (document) => ({
		id: document.id,
		evidenceType: document.evidenceType,
		vector: await embedText(document.text),
	})),
);
const rankings = await Promise.all(
	queries.map(async (query) => {
		const vector = await embedText(query.query);
		return {
			query,
			scores: documentVectors.map(
				({ id, evidenceType, vector: documentVector }) => ({
					id,
					evidenceType,
					score: cosine(vector, documentVector),
				}),
			),
		};
	}),
);
const thresholds = [0.2, 0.25, 0.3, 0.35, 0.45];
const results = thresholds.map((threshold) => ({
	threshold,
	...evaluate(rankings, threshold),
}));
console.table(results);
const current = results.find(({ threshold }) => threshold === 0.45);
const tuned = results.find(({ threshold }) => threshold === 0.2);
assert.ok(current && tuned);
assert.ok(tuned.recallAt5 !== null && current.recallAt5 !== null);
assert.ok(tuned.ndcgAt5 !== null && current.ndcgAt5 !== null);
assert.ok(
	tuned.recallAt5 > current.recallAt5,
	"0.2 should improve Recall@5 over the former 0.45 cutoff",
);
assert.ok(
	tuned.ndcgAt5 > current.ndcgAt5,
	"0.2 should improve nDCG@5 over the former 0.45 cutoff",
);
assert.equal(
	tuned.noAnswerRate,
	0,
	"no-answer query produced a false positive",
);
const databaseQuery = rankings.find(({ query }) => query.query === "database");
const abbreviationQuery = rankings.find(({ query }) => query.query === "db");
const scoreFor = (ranking: (typeof rankings)[number] | undefined, id: string) =>
	ranking?.scores.find((score) => score.id === id)?.score ?? 0;
assert.ok(scoreFor(databaseQuery, "taladb-web") >= tuned.threshold);
const titleQuery = rankings.find(({ query }) =>
	query.query.startsWith("Database in the Browser"),
);
const pageTextQuery = rankings.find(({ query }) =>
	query.query.startsWith("vector and document"),
);
assert.ok(
	scoreFor(titleQuery, "title-database") >= tuned.threshold,
	"title-only evidence did not match",
);
assert.ok(
	scoreFor(pageTextQuery, "taladb-web") >= tuned.threshold,
	"page-text evidence did not match",
);
assert.ok(scoreFor(abbreviationQuery, "taladb-web") >= tuned.threshold);
console.log(
	`database: page-text=${scoreFor(databaseQuery, "taladb-web").toFixed(3)}, url-only=${scoreFor(databaseQuery, "taladb-url-only").toFixed(3)}`,
);
console.log(
	`db: TalaDB=${scoreFor(abbreviationQuery, "taladb-web").toFixed(3)}`,
);
const evidenceTypes = [
	...new Set(documents.map(({ evidenceType }) => evidenceType)),
];
console.table(
	evidenceTypes.map((evidenceType) => ({
		evidenceType,
		...evaluate(
			rankings.map(({ query, scores }) => ({
				query: {
					...query,
					relevant: Object.fromEntries(
						Object.entries(query.relevant).filter(
							([id]) =>
								documents.find((document) => document.id === id)
									?.evidenceType === evidenceType,
						),
					),
				},
				scores: scores.filter((score) => score.evidenceType === evidenceType),
			})),
			tuned.threshold,
		),
	})),
);
console.log("search-quality: local model metrics by evidence type passed");
