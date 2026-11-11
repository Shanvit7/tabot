import type { StoredTabEvent } from "../events/db";
import {
	type BehaviorCheckpoint,
	buildNextSiteExamples,
	createBehaviorPredictor,
} from "./behavior-model";

export const HANDWIRED_WORKFLOW_LIMITS = {
	maxCandidates: 50,
	maxOccurrences: 8,
	minOccurrences: 2,
} as const;

export type WorkflowCandidate = {
	id: string;
	steps: { origin: string; host: string }[];
	occurrences: { startedAt: number; sourceIds: string[] }[];
	modelMatches: number;
	firstAt: number;
	lastAt: number;
};

const hash = (value: string): string => {
	let result = 2166136261;
	for (let index = 0; index < value.length; index++)
		result = Math.imul(result ^ value.charCodeAt(index), 16777619);
	return (result >>> 0).toString(16).padStart(8, "0");
};

/** Build candidates only from sequences the trained Handwired model predicts. */
export const discoverHandwiredWorkflows = (
	events: StoredTabEvent[],
	checkpoint: BehaviorCheckpoint | null,
): WorkflowCandidate[] => {
	if (!checkpoint) return [];
	const predict = createBehaviorPredictor(checkpoint);
	if (!predict) return [];

	const groups = new Map<string, WorkflowCandidate>();
	for (const example of buildNextSiteExamples(events)) {
		if (
			example.contextOrigins.length < 1 ||
			example.sourceIds.length !== example.contextOrigins.length + 1 ||
			predict(example.features) !== example.target
		)
			continue;

		const origins = [...example.contextOrigins, example.origin];
		if (origins.some((origin) => new URL(origin).protocol !== "https:"))
			continue;
		const fingerprint = JSON.stringify(origins);
		const candidate = groups.get(fingerprint) ?? {
			id: `handwired-v1-${hash(fingerprint)}`,
			steps: origins.map((origin) => ({
				origin,
				host: new URL(origin).hostname,
			})),
			occurrences: [],
			modelMatches: 0,
			firstAt: example.startedAt,
			lastAt: example.timestamp,
		};
		const sourceIds = new Set(example.sourceIds);
		if (
			candidate.occurrences.some((occurrence) =>
				occurrence.sourceIds.some((id) => sourceIds.has(id)),
			)
		)
			continue;

		candidate.modelMatches++;
		if (candidate.occurrences.length < HANDWIRED_WORKFLOW_LIMITS.maxOccurrences)
			candidate.occurrences.push({
				startedAt: example.startedAt,
				sourceIds: example.sourceIds,
			});
		candidate.firstAt = Math.min(candidate.firstAt, example.startedAt);
		candidate.lastAt = Math.max(candidate.lastAt, example.timestamp);
		groups.set(fingerprint, candidate);
	}

	return [...groups.values()]
		.filter(
			(candidate) =>
				candidate.modelMatches >= HANDWIRED_WORKFLOW_LIMITS.minOccurrences,
		)
		.sort(
			(a, b) =>
				b.modelMatches - a.modelMatches ||
				b.lastAt - a.lastAt ||
				a.id.localeCompare(b.id),
		)
		.slice(0, HANDWIRED_WORKFLOW_LIMITS.maxCandidates);
};
