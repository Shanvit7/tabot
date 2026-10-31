import type { StoredPageObservation } from "./pages/observations";
import {
	type HistorySearchResult,
	type SearchAvailability,
	safeRecallUrl,
} from "./recall/history-search";

export type {
	HistorySearchResult,
	SearchAvailability,
} from "./recall/history-search";
export { parseRecentSearchQuestion } from "./recall/history-search";
export type DashboardPagePreview = Pick<
	StoredPageObservation,
	"id" | "timestamp" | "segments" | "coverage" | "title" | "trigger"
> & {
	url: string;
	redacted: boolean;
};
export type DashboardReadFailure = { ok: false; code: string };
export type DashboardHistoryResponse =
	| { results: HistorySearchResult[]; searchStatus: SearchAvailability }
	| { preview: DashboardPagePreview | null }
	| DashboardReadFailure;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;
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
