import type { StoredPageObservation } from "./pages/observations";
import {
	isWorkflowScriptDraft,
	type WorkflowScriptDraft,
} from "./workflows/automation-script";
import { BEHAVIOR_MODEL_LIMITS } from "./workflows/behavior-model";
import type { WorkflowCandidate } from "./workflows/discovery";

export type { WorkflowCandidate } from "./workflows/discovery";

import {
	type HistorySearchResult,
	type SearchAvailability,
	safeRecallUrl,
} from "./recall/history-search";

export type {
	HistorySearchResult,
	SearchAvailability,
} from "./recall/history-search";
export { parseTemporalRecallQuery } from "./recall/history-search";
export type DashboardPagePreview = Pick<
	StoredPageObservation,
	"id" | "timestamp" | "segments" | "coverage" | "title" | "trigger"
> & {
	url: string;
	redacted: boolean;
};
export type DashboardNoteResult = {
	id: string;
	text: string;
	createdAt: number;
	updatedAt: number;
	url: string;
	host: string;
	site: string;
	title: string | null;
	favicon: string | null;
	session: { start: number; end: number; durationMs: number } | null;
};
export type DashboardReadFailure = { ok: false; code: string };
export type DashboardWorkflowCandidates = {
	candidates: WorkflowCandidate[];
	modelReady: boolean;
	trainedThrough: number | null;
	sourceCount: number;
	truncated: boolean;
};
export type DashboardHistoryResponse =
	| DashboardWorkflowCandidates
	| { prepared: true }
	| { note: { id: string; text: string; updatedAt: number } }
	| { drafts: WorkflowScriptDraft[] }
	| { deleted: boolean }
	| {
			results: HistorySearchResult[];
			searchStatus: SearchAvailability;
			notes?: DashboardNoteResult[];
	  }
	| { preview: DashboardPagePreview | null }
	| DashboardReadFailure;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export const isDashboardWorkflowScriptDrafts = (
	value: unknown,
): value is { drafts: WorkflowScriptDraft[] } =>
	isRecord(value) &&
	Array.isArray(value.drafts) &&
	value.drafts.length <= 50 &&
	value.drafts.every(isWorkflowScriptDraft);

export const isDashboardWorkflowHandoffPrepared = (
	value: unknown,
): value is { prepared: true } => isRecord(value) && value.prepared === true;

export const isDashboardWorkflowCandidates = (
	value: unknown,
): value is DashboardWorkflowCandidates =>
	isRecord(value) &&
	typeof value.truncated === "boolean" &&
	typeof value.modelReady === "boolean" &&
	(value.trainedThrough === null || timestamp(value.trainedThrough)) &&
	count(value.sourceCount) &&
	value.sourceCount <= BEHAVIOR_MODEL_LIMITS.events &&
	(value.modelReady
		? value.trainedThrough !== null && value.sourceCount > 0
		: value.trainedThrough === null && value.sourceCount === 0) &&
	Array.isArray(value.candidates) &&
	value.candidates.length <= 50 &&
	value.candidates.every(
		(candidate) =>
			isRecord(candidate) &&
			typeof candidate.id === "string" &&
			candidate.id.length <= 64 &&
			Array.isArray(candidate.steps) &&
			(candidate.steps as unknown[]).length >= 2 &&
			(candidate.steps as unknown[]).length <= 3 &&
			count(candidate.modelMatches) &&
			(candidate.modelMatches as number) >= 2 &&
			(candidate.modelMatches as number) <= 256 &&
			(candidate.steps as unknown[]).every(
				(step) =>
					isRecord(step) &&
					typeof step.host === "string" &&
					step.host.length <= 253 &&
					typeof step.origin === "string" &&
					step.origin.length <= 512,
			) &&
			Array.isArray(candidate.occurrences) &&
			candidate.occurrences.length >= 2 &&
			candidate.occurrences.length <= 8 &&
			candidate.occurrences.every(
				(occurrence) =>
					isRecord(occurrence) &&
					timestamp(occurrence.startedAt) &&
					Array.isArray(occurrence.sourceIds) &&
					occurrence.sourceIds.length ===
						(candidate.steps as unknown[]).length &&
					occurrence.sourceIds.every(
						(id) => typeof id === "string" && id.length <= 128,
					),
			) &&
			timestamp(candidate.firstAt) &&
			timestamp(candidate.lastAt) &&
			candidate.firstAt <= candidate.lastAt &&
			(value.modelReady || (value.candidates as unknown[]).length === 0),
	);
// Chrome navigation timestamps can contain fractional milliseconds.
const timestamp = (value: unknown): value is number =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	value >= 0 &&
	value <= 8.64e15;
const count = (value: unknown): value is number =>
	typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const localUrl = (value: unknown): value is string =>
	typeof value === "string" &&
	value.length <= 8192 &&
	safeRecallUrl(value)?.href === value;
const safeFaviconUrl = (value: unknown): boolean =>
	value === undefined ||
	(typeof value === "string" &&
		value.length <= 2048 &&
		safeRecallUrl(value)?.href === value);

// Treat an old/incompatible extension response as a read failure, never empty history.
export const isDashboardSearchResults = (
	value: unknown,
): value is HistorySearchResult[] =>
	Array.isArray(value) &&
	value.length <= 20 &&
	value.every(
		(item) =>
			isRecord(item) &&
			localUrl(item.url) &&
			safeFaviconUrl(item.favicon) &&
			typeof item.host === "string" &&
			item.host.length > 0 &&
			timestamp(item.firstSeen) &&
			timestamp(item.lastSeen) &&
			item.firstSeen <= item.lastSeen &&
			count(item.eventCount) &&
			count(item.pageCount) &&
			count(item.sourceCount) &&
			typeof item.score === "number" &&
			Number.isFinite(item.score) &&
			typeof item.excerpt === "string" &&
			item.excerpt.length <= 8192 &&
			(item.pageTitle === undefined ||
				(typeof item.pageTitle === "string" && item.pageTitle.length <= 512)) &&
			Array.isArray(item.evidenceKinds) &&
			item.evidenceKinds.length <= 5 &&
			item.evidenceKinds.every((kind) =>
				[
					"url-only",
					"title-only",
					"auto-snippet",
					"interaction-excerpt",
					"search-phrase",
				].includes(String(kind)),
			) &&
			(item.searchQueries === undefined ||
				(Array.isArray(item.searchQueries) &&
					item.searchQueries.length <= 5 &&
					item.searchQueries.every(
						(query) => typeof query === "string" && query.length <= 512,
					))) &&
			typeof item.pageExcerptAvailable === "boolean" &&
			Array.isArray(item.matchedTerms) &&
			item.matchedTerms.length <= 48 &&
			item.matchedTerms.every(
				(term) => typeof term === "string" && term.length <= 240,
			) &&
			Array.isArray(item.sources) &&
			item.sources.length <= 5 &&
			item.sources.every(
				(source) =>
					isRecord(source) &&
					(source.kind === "event" || source.kind === "page") &&
					[
						"url-only",
						"title-only",
						"auto-snippet",
						"interaction-excerpt",
						"search-phrase",
					].includes(String(source.evidenceKind)) &&
					typeof source.id === "string" &&
					source.id.length <= 128 &&
					timestamp(source.timestamp) &&
					source.url === item.url,
			),
	);

export const isDashboardNotes = (
	value: unknown,
): value is DashboardNoteResult[] =>
	Array.isArray(value) &&
	value.length <= 20 &&
	value.every(
		(item) =>
			isRecord(item) &&
			typeof item.id === "string" &&
			item.id.length <= 64 &&
			typeof item.text === "string" &&
			item.text.length <= 4_000 &&
			timestamp(item.createdAt) &&
			timestamp(item.updatedAt) &&
			localUrl(item.url) &&
			typeof item.host === "string" &&
			item.host.length <= 253 &&
			typeof item.site === "string" &&
			item.site.length <= 253 &&
			(item.title === null ||
				(typeof item.title === "string" && item.title.length <= 300)) &&
			(item.favicon === null || safeFaviconUrl(item.favicon)) &&
			(item.session === null ||
				(isRecord(item.session) &&
					timestamp(item.session.start) &&
					timestamp(item.session.end) &&
					item.session.start <= item.session.end &&
					count(item.session.durationMs))),
	);

export const isDashboardSearchAvailability = (
	value: unknown,
): value is SearchAvailability =>
	isRecord(value) &&
	(value.mode === "hybrid" || value.mode === "keyword") &&
	typeof value.indexing === "boolean" &&
	(value.model === "not-loaded" ||
		value.model === "loading" ||
		value.model === "ready" ||
		value.model === "unavailable");

export const isDashboardPagePreview = (
	value: unknown,
): value is DashboardPagePreview =>
	isRecord(value) &&
	typeof value.id === "string" &&
	localUrl(value.url) &&
	timestamp(value.timestamp) &&
	typeof value.redacted === "boolean" &&
	(value.title === undefined ||
		(typeof value.title === "string" && value.title.length <= 512)) &&
	["auto-dwell", "viewport-dwell", "interaction"].includes(
		String(value.trigger),
	) &&
	isRecord(value.coverage) &&
	typeof value.coverage.partial === "boolean" &&
	typeof value.coverage.truncated === "boolean" &&
	Array.isArray(value.segments) &&
	(value.segments.length > 0 || Boolean(value.title)) &&
	value.segments.length <= 4 &&
	value.segments.every(
		(segment) =>
			typeof segment === "string" &&
			segment.length > 0 &&
			segment.length <= 1000,
	);
