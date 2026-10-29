import type { StoredTabEvent } from "../events/db";
import type { StoredPageObservation } from "../pages/observations";
import { safeRecallUrl, tokenizeRecallText } from "./history-search";

export type RelatednessEvidence = StoredTabEvent | StoredPageObservation;
export type RelatednessPair = {
	sourceIds: [string, string];
	timestamps: [number, number];
};
export type CandidateLimits = {
	maxPairs: number;
	maxTemporalNeighbors: number;
	maxTimeGapMs: number;
};
export const RELATEDNESS_FEATURE_VERSION = 1;
export const MAX_RELATEDNESS_CANDIDATES = 50_000;
export const MAX_TEMPORAL_NEIGHBORS = 64;
export const RELATEDNESS_FEATURE_NAMES = [
	"logGapSeconds",
	"sameTab",
	"sameWindow",
	"bothUrls",
	"sameOrigin",
	"sameUrl",
	"pathPrefixRatio",
	"bothDocumentIds",
	"sameDocumentId",
	"bothEvents",
	"sameEventType",
	"bothPages",
	"samePageKey",
	"samePageTrigger",
	"bothPageTexts",
	"pageTextJaccard",
] as const;
export type RelatednessFeatures = number[];
export type FeaturedRelatednessPair = RelatednessPair & {
	featureVersion: typeof RELATEDNESS_FEATURE_VERSION;
	features: RelatednessFeatures;
};

const isPage = (
	evidence: RelatednessEvidence,
): evidence is StoredPageObservation =>
	"kind" in evidence && evidence.kind === "page-observation";
const documentId = (evidence: RelatednessEvidence) =>
	isPage(evidence) ? evidence.documentId : evidence.source?.documentId;
const pageText = (evidence: RelatednessEvidence) =>
	isPage(evidence) ? evidence.segments.join(" ") : "";
const pathPrefixRatio = (left: string, right: string) => {
	const a = left.split("/").filter(Boolean);
	const b = right.split("/").filter(Boolean);
	let shared = 0;
	while (shared < a.length && shared < b.length && a[shared] === b[shared])
		shared++;
	return shared / Math.max(a.length, b.length, 1);
};
const tokenJaccard = (left: string, right: string) => {
	const a = new Set(tokenizeRecallText(left));
	const b = new Set(tokenizeRecallText(right));
	if (!a.size || !b.size) return 0;
	let intersection = 0;
	for (const token of a) if (b.has(token)) intersection++;
	return intersection / (a.size + b.size - intersection);
};
const pairOrder = (left: RelatednessEvidence, right: RelatednessEvidence) =>
	left.timestamp - right.timestamp ||
	(left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
const toPair = (
	left: RelatednessEvidence,
	right: RelatednessEvidence,
): RelatednessPair => {
	const [first, second] =
		pairOrder(left, right) <= 0 ? [left, right] : [right, left];
	return {
		sourceIds: [first.id, second.id],
		timestamps: [first.timestamp, second.timestamp],
	};
};
export const relatednessIdentityKeys = (evidence: RelatednessEvidence) => {
	const url = safeRecallUrl(evidence.url);
	const keys = url && url.href.length <= 2_044 ? [`url:${url.href}`] : [];
	if (isPage(evidence) && evidence.pageKey.length <= 2_042)
		keys.push(`page:${evidence.pageKey}`);
	const id = documentId(evidence);
	if (id && id.length <= 2_038) keys.push(`document:${id}`);
	return keys;
};

/** Candidate generation bounds work; exact identity links can span any time gap. */
const validateCandidateLimits = (limits: CandidateLimits) => {
	if (
		!Number.isSafeInteger(limits.maxPairs) ||
		limits.maxPairs < 1 ||
		limits.maxPairs > MAX_RELATEDNESS_CANDIDATES ||
		!Number.isSafeInteger(limits.maxTemporalNeighbors) ||
		limits.maxTemporalNeighbors < 0 ||
		limits.maxTemporalNeighbors > MAX_TEMPORAL_NEIGHBORS ||
		!Number.isSafeInteger(limits.maxTimeGapMs) ||
		limits.maxTimeGapMs < 0
	)
		throw new Error("invalid-relatedness-limits");
};

export const generateRelatednessCandidates = (
	evidence: RelatednessEvidence[],
	limits: CandidateLimits,
): RelatednessPair[] => {
	validateCandidateLimits(limits);
	const sorted = [...evidence].sort(pairOrder);
	const pairs = new Map<string, RelatednessPair>();
	const add = (left: RelatednessEvidence, right: RelatednessEvidence) => {
		if (left.id === right.id || pairs.size >= limits.maxPairs) return;
		const pair = toPair(left, right);
		pairs.set(`${pair.sourceIds[0]}\0${pair.sourceIds[1]}`, pair);
	};
	const previousByIdentity = new Map<string, RelatednessEvidence>();
	for (const row of sorted) {
		for (const key of relatednessIdentityKeys(row)) {
			const previous = previousByIdentity.get(key);
			if (previous) add(previous, row);
			previousByIdentity.set(key, row);
		}
	}
	// ponytail: cap temporal edges to maxPairs; raise the explicit limit if evaluation shows missed useful candidates.
	for (
		let index = 0;
		index < sorted.length && pairs.size < limits.maxPairs;
		index++
	) {
		const row = sorted[index];
		if (!row) continue;
		for (
			let offset = 1;
			offset <= limits.maxTemporalNeighbors && pairs.size < limits.maxPairs;
			offset++
		) {
			const neighbor = sorted[index + offset];
			if (!neighbor) break;
			if (neighbor.timestamp - row.timestamp > limits.maxTimeGapMs) break;
			add(row, neighbor);
		}
	}
	return [...pairs.values()];
};

/** Builds bounded anchor-to-candidate links so each requested source gets direct neighbors. */
export const generateRelatednessCandidatesForSeeds = (
	evidence: RelatednessEvidence[],
	seedIds: string[],
	limits: CandidateLimits,
): RelatednessPair[] => {
	validateCandidateLimits(limits);
	if (seedIds.length > 8) throw new Error("invalid-relatedness-seeds");
	const byId = new Map(evidence.map((row) => [row.id, row]));
	const pairs = new Map<string, RelatednessPair>();
	for (const seedId of seedIds) {
		const seed = byId.get(seedId);
		if (!seed) continue;
		const keys = new Set(relatednessIdentityKeys(seed));
		const candidates = evidence.filter((row) => row.id !== seed.id);
		const identityMatches = candidates.filter((row) =>
			relatednessIdentityKeys(row).some((key) => keys.has(key)),
		);
		const temporalMatches = candidates
			.filter(
				(row) =>
					Math.abs(row.timestamp - seed.timestamp) <= limits.maxTimeGapMs,
			)
			.sort(
				(a, b) =>
					Math.abs(a.timestamp - seed.timestamp) -
						Math.abs(b.timestamp - seed.timestamp) || pairOrder(a, b),
			)
			.slice(0, limits.maxTemporalNeighbors);
		for (const candidate of [...identityMatches, ...temporalMatches]) {
			if (pairs.size >= limits.maxPairs) break;
			const pair = toPair(seed, candidate);
			pairs.set(`${pair.sourceIds[0]}\0${pair.sourceIds[1]}`, pair);
		}
		if (pairs.size >= limits.maxPairs) break;
	}
	return [...pairs.values()];
};

/** Numeric features only; availability flags distinguish missing evidence from a mismatch. */
const feature = (
	features: RelatednessFeatures,
	name: (typeof RELATEDNESS_FEATURE_NAMES)[number],
) => features[RELATEDNESS_FEATURE_NAMES.indexOf(name)] ?? 0;

export const relatednessMatchSignals = (features: RelatednessFeatures) => {
	if (
		features.length !== RELATEDNESS_FEATURE_NAMES.length ||
		features.some((value) => !Number.isFinite(value) || value < 0)
	)
		throw new Error("invalid-relatedness-features");
	const signals: string[] = [];
	if (feature(features, "sameDocumentId")) signals.push("same_document");
	if (feature(features, "samePageKey")) signals.push("same_page");
	if (feature(features, "sameUrl")) signals.push("same_url");
	if (feature(features, "pageTextJaccard") >= 0.15)
		signals.push("page_text_overlap");
	if (
		feature(features, "sameOrigin") &&
		feature(features, "pathPrefixRatio") >= 0.5
	)
		signals.push("similar_path");
	return signals;
};

/** Uncalibrated transparent baseline; not a probability or learned model. */
export const scoreRelatednessHeuristic = (features: RelatednessFeatures) => {
	if (
		features.length !== RELATEDNESS_FEATURE_NAMES.length ||
		features.some((value) => !Number.isFinite(value) || value < 0)
	)
		throw new Error("invalid-relatedness-features");
	return (
		100 * feature(features, "sameDocumentId") +
		80 * feature(features, "samePageKey") +
		60 * feature(features, "sameUrl") +
		25 * feature(features, "pageTextJaccard") +
		10 * feature(features, "pathPrefixRatio") +
		4 * feature(features, "sameOrigin") +
		feature(features, "sameTab") +
		0.5 * feature(features, "sameWindow") -
		Math.min(feature(features, "logGapSeconds"), 20) * 0.1
	);
};

export const extractRelatednessFeatures = (
	left: RelatednessEvidence,
	right: RelatednessEvidence,
): FeaturedRelatednessPair => {
	const pair = toPair(left, right);
	const [first, second] =
		pair.sourceIds[0] === left.id ? [left, right] : [right, left];
	const firstPage = isPage(first);
	const secondPage = isPage(second);
	const firstUrl = safeRecallUrl(first.url);
	const secondUrl = safeRecallUrl(second.url);
	const bothUrls = Number(Boolean(firstUrl && secondUrl));
	const firstDocumentId = documentId(first);
	const secondDocumentId = documentId(second);
	const bothDocumentIds = Number(Boolean(firstDocumentId && secondDocumentId));
	const bothPageTexts = Number(
		firstPage &&
			secondPage &&
			Boolean(first.segments.join(" ").trim()) &&
			Boolean(second.segments.join(" ").trim()),
	);
	const firstTokens = firstPage ? pageText(first) : "";
	const secondTokens = secondPage ? pageText(second) : "";
	const features = [
		Math.log1p(Math.abs(first.timestamp - second.timestamp) / 1000),
		Number(first.tabId === second.tabId),
		Number(first.windowId === second.windowId),
		bothUrls,
		Number(
			Boolean(firstUrl && secondUrl && firstUrl.origin === secondUrl.origin),
		),
		Number(Boolean(firstUrl && secondUrl && firstUrl.href === secondUrl.href)),
		firstUrl && secondUrl
			? pathPrefixRatio(firstUrl.pathname, secondUrl.pathname)
			: 0,
		bothDocumentIds,
		Number(
			Boolean(
				firstDocumentId &&
					secondDocumentId &&
					firstDocumentId === secondDocumentId,
			),
		),
		Number(!firstPage && !secondPage),
		Number(!firstPage && !secondPage && first.type === second.type),
		Number(firstPage && secondPage),
		Number(firstPage && secondPage && first.pageKey === second.pageKey),
		Number(firstPage && secondPage && first.trigger === second.trigger),
		bothPageTexts,
		bothPageTexts ? tokenJaccard(firstTokens, secondTokens) : 0,
	];
	return { ...pair, featureVersion: RELATEDNESS_FEATURE_VERSION, features };
};
