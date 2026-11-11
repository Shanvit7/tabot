import * as chrono from "chrono-node";
import type { StoredTabEvent } from "../events/db";
import type { StoredPageObservation } from "../pages/observations";
import { searchQueryFromUrl } from "../privacy/ingest";

export type SearchEvidenceKind =
	| "url-only"
	| "title-only"
	| "auto-snippet"
	| "interaction-excerpt"
	| "search-phrase";
type Source = {
	kind: "event" | "page";
	evidenceKind: SearchEvidenceKind;
	pageTitle?: string;
	id: string;
	timestamp: number;
	url: string;
	favicon?: string;
	text: string;
	matchedTermCount: number;
	searchQuery?: string;
	excerpt?: string;
};
type SearchGroup = {
	url: string;
	favicon?: string;
	faviconTimestamp?: number;
	text: Set<string>;
	firstSeen: number;
	lastSeen: number;
	eventCount: number;
	pageCount: number;
	sourceCount: number;
	sources: Source[];
	excerpt: string;
	excerptMatches: number;
	searchQueries: {
		query: string;
		timestamp: number;
		matchedTermCount: number;
	}[];
	excerptSourceId: string;
	pageTitle?: string;
	evidenceKinds?: Set<SearchEvidenceKind>;
};
export type HistorySearchCitation = Pick<
	Source,
	"kind" | "id" | "timestamp" | "url" | "evidenceKind"
>;
export type HistorySearchResult = {
	url: string;
	host: string;
	favicon?: string;
	firstSeen: number;
	lastSeen: number;
	eventCount: number;
	pageCount: number;
	excerpt: string;
	searchQueries?: string[];
	pageExcerptAvailable: boolean;
	pageTitle?: string;
	evidenceKinds: SearchEvidenceKind[];
	matchedTerms: string[];
	sources: HistorySearchCitation[];
	sourceCount: number;
	score: number;
};
export type SearchAvailability = {
	mode: "hybrid" | "keyword";
	indexing: boolean;
	model: "not-loaded" | "loading" | "ready" | "unavailable";
};

export type HistorySearchOptions = {
	from?: number;
	to?: number;
	origin?: string;
	limit?: number;
	offset?: number;
	candidateOrder?: string[];
	nearestTo?: number;
};
export type ActivitySearchResult = {
	site: string;
	firstSeen: number;
	lastSeen: number;
	eventCount: number;
	pageCount: number;
	matchedFrom: SearchEvidenceKind[];
	matchedTerms: string[];
	anchors: Pick<HistorySearchCitation, "kind" | "id" | "timestamp">[];
};

export const tokenizeRecallText = (text: string): string[] =>
	text
		.normalize("NFKC")
		.toLowerCase()
		.match(/[\p{L}\p{N}]+/gu) ?? [];

export const parseTemporalRecallQuery = (query: string, now = Date.now()) => {
	const result = chrono.parse(query, new Date(now), { forwardDate: false })[0];
	if (!result) return undefined;
	const start = result.start.date();
	let from: number;
	let to: number;
	if (result.start.isCertain("minute")) {
		start.setSeconds(0, 0);
		from = start.getTime();
		to = from + 60_000 - 1;
	} else if (result.start.isCertain("hour")) {
		start.setMinutes(0, 0, 0);
		from = start.getTime();
		to = from + 60 * 60_000 - 1;
	} else {
		start.setHours(0, 0, 0, 0);
		from = start.getTime();
		const nextDay = new Date(start);
		nextDay.setDate(nextDay.getDate() + 1);
		to = nextDay.getTime() - 1;
	}
	const remainingQuery =
		`${query.slice(0, result.index)} ${query.slice(result.index + result.text.length)}`
			.replace(/[?.!,]+/g, " ")
			.replace(
				/^\s*(?:what did i (?:do|visit|browse|search)(?: for)?|what was i (?:doing|working on|looking at)|what pages did i visit|find pages about|show me|search for|pages about)\b/i,
				" ",
			)
			.trim();
	return { from, to, query: remainingQuery };
};

const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export const safeRecallUrl = (value: string | undefined): URL | null => {
	try {
		const url = new URL(value ?? "");
		if (
			(url.protocol !== "http:" && url.protocol !== "https:") ||
			url.username ||
			url.password
		)
			return null;
		url.search = "";
		url.hash = "";
		return url;
	} catch {
		return null;
	}
};

const addSource = (
	group: SearchGroup,
	source: Source,
	queryTerms: Set<string>,
) => {
	group.text.add(source.text);
	group.sourceCount++;
	group.firstSeen = Math.min(group.firstSeen, source.timestamp);
	group.lastSeen = Math.max(group.lastSeen, source.timestamp);
	if (source.favicon && source.timestamp >= (group.faviconTimestamp ?? 0)) {
		group.favicon = source.favicon;
		group.faviconTimestamp = source.timestamp;
	}
	if (source.kind === "event") {
		group.eventCount++;
		if (source.searchQuery) {
			group.searchQueries.push({
				query: source.searchQuery,
				timestamp: source.timestamp,
				matchedTermCount: source.matchedTermCount,
			});
			group.searchQueries = group.searchQueries
				.sort(
					(a, b) =>
						b.matchedTermCount - a.matchedTermCount ||
						b.timestamp - a.timestamp,
				)
				.filter(
					(item, index, all) =>
						all.findIndex((candidate) => candidate.query === item.query) ===
						index,
				)
				.slice(0, 5);
		}
	} else {
		group.pageCount++;
		const matched = new Set(
			tokenizeRecallText(source.excerpt ?? "").filter((term) =>
				queryTerms.has(term),
			),
		);
		if (matched.size > group.excerptMatches || !group.excerptSourceId) {
			group.excerptMatches = matched.size;
			group.excerpt = source.excerpt ?? "";
			group.excerptSourceId = source.id;
		}
	}
	group.evidenceKinds ??= new Set();
	group.evidenceKinds.add(source.evidenceKind);
	if (source.kind === "page" && source.pageTitle)
		group.pageTitle = source.pageTitle;
	group.sources.push(source);
	group.sources = group.sources
		.sort(
			(a, b) =>
				Number(b.id === group.excerptSourceId) -
					Number(a.id === group.excerptSourceId) ||
				b.matchedTermCount - a.matchedTermCount ||
				b.timestamp - a.timestamp,
		)
		.slice(0, 5);
};

export const searchHistory = async (
	events: StoredTabEvent[],
	pages: StoredPageObservation[],
	query: string,
	options: HistorySearchOptions = {},
): Promise<HistorySearchResult[]> => {
	const terms = [...new Set(tokenizeRecallText(query.slice(0, 240)))].slice(
		0,
		48,
	);
	if (
		(!terms.length &&
			options.nearestTo === undefined &&
			!options.candidateOrder?.length) ||
		(options.nearestTo !== undefined && !Number.isFinite(options.nearestTo)) ||
		(options.from !== undefined && !Number.isFinite(options.from)) ||
		(options.to !== undefined && !Number.isFinite(options.to)) ||
		(options.offset !== undefined &&
			(!Number.isSafeInteger(options.offset) || options.offset < 0)) ||
		(options.from !== undefined &&
			options.to !== undefined &&
			options.from > options.to)
	)
		return [];
	const queryTerms = new Set(terms);
	const groups = new Map<string, SearchGroup>();
	let scanned = 0;
	for (const event of events) {
		if (
			event.timestamp < (options.from ?? 0) ||
			event.timestamp > (options.to ?? Number.MAX_SAFE_INTEGER)
		)
			continue;
		const url = safeRecallUrl(event.url);
		if (!url || (options.origin && url.origin !== options.origin)) continue;
		const searchQuery = searchQueryFromUrl(event.url);
		const text = `${url.hostname} ${url.pathname} ${event.type.replaceAll("_", " ")} ${searchQuery ?? ""}`;
		const favicon = safeRecallUrl(event.favicon);
		const source: Source = {
			kind: "event",
			id: event.id,
			timestamp: event.timestamp,
			url: url.href,
			...(favicon ? { favicon: favicon.href } : {}),
			text,
			evidenceKind: searchQuery ? "search-phrase" : "url-only",
			...(searchQuery ? { searchQuery } : {}),
			matchedTermCount: terms.filter((term) =>
				tokenizeRecallText(text).includes(term),
			).length,
		};
		const group = groups.get(source.url) ?? {
			url: source.url,
			text: new Set<string>(),
			searchQueries: [],
			firstSeen: Number.MAX_SAFE_INTEGER,
			lastSeen: 0,
			eventCount: 0,
			pageCount: 0,
			sourceCount: 0,
			sources: [],
			excerpt: "",
			excerptMatches: 0,
			excerptSourceId: "",
		};
		addSource(group, source, queryTerms);
		groups.set(source.url, group);
		if (++scanned % 512 === 0) await yieldTurn();
	}
	for (const page of pages) {
		if (
			page.timestamp < (options.from ?? 0) ||
			page.timestamp > (options.to ?? Number.MAX_SAFE_INTEGER)
		)
			continue;
		const url = safeRecallUrl(page.url);
		if (!url || (options.origin && url.origin !== options.origin)) continue;
		const pageText = `${page.title ?? ""} ${page.segments.join(" ")}`.trim();
		const text = `${url.hostname} ${url.pathname} ${pageText}`;
		const matchedTerms = terms.filter((term) =>
			tokenizeRecallText(text).includes(term),
		);
		const excerptTerm = terms.find((term) =>
			tokenizeRecallText(pageText).includes(term),
		);
		const matchIndex = pageText
			.toLowerCase()
			.indexOf(excerptTerm?.toLowerCase() ?? "");
		const excerptStart = Math.max(0, matchIndex - 80);
		const hasExcerpt = page.segments.length > 0;
		const source: Source = {
			kind: "page",
			evidenceKind: hasExcerpt
				? page.trigger === "interaction"
					? "interaction-excerpt"
					: "auto-snippet"
				: "title-only",
			...(page.title ? { pageTitle: page.title } : {}),
			id: page.id,
			timestamp: page.timestamp,
			url: url.href,
			text,
			matchedTermCount: matchedTerms.length,
			excerpt: pageText.slice(excerptStart, excerptStart + 240),
		};
		const group = groups.get(source.url) ?? {
			url: source.url,
			text: new Set<string>(),
			searchQueries: [],
			firstSeen: Number.MAX_SAFE_INTEGER,
			lastSeen: 0,
			eventCount: 0,
			pageCount: 0,
			sourceCount: 0,
			sources: [],
			excerpt: "",
			excerptMatches: 0,
			excerptSourceId: "",
		};
		addSource(group, source, queryTerms);
		groups.set(source.url, group);
		if (++scanned % 512 === 0) await yieldTurn();
	}

	const documents = [...groups.values()];
	const documentFrequency = new Map(terms.map((term) => [term, 0]));
	const corpus: { counts: Map<string, number>; length: number }[] = [];
	let totalLength = 0;
	for (let index = 0; index < documents.length; index++) {
		const tokens = tokenizeRecallText(
			[...(documents[index]?.text ?? [])].join(" "),
		);
		const counts = new Map<string, number>();
		for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
		for (const term of terms)
			if (counts.has(term))
				documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		corpus.push({ counts, length: tokens.length });
		totalLength += tokens.length;
		if (index > 0 && index % 512 === 0) await yieldTurn();
	}

	const averageLength = totalLength / (corpus.length || 1);
	const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 10)));
	const results: HistorySearchResult[] = [];
	const candidateRanks = new Map(
		(options.candidateOrder ?? []).map((url, index) => [url, index]),
	);
	for (let index = 0; index < documents.length; index++) {
		const document = documents[index];
		const item = corpus[index];
		if (!document || !item) continue;
		let score = 0;
		const matchedTerms: string[] = [];
		for (const term of terms) {
			const frequency = item.counts.get(term) ?? 0;
			if (!frequency) continue;
			matchedTerms.push(term);
			const df = documentFrequency.get(term) ?? 0;
			const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
			const k1 = 1.2;
			const b = 0.75;
			score +=
				(idf * frequency * (k1 + 1)) /
				(frequency + k1 * (1 - b + b * (item.length / averageLength)));
		}
		const candidateRank = candidateRanks.get(document.url) ?? -1;
		if (score || candidateRank >= 0 || options.nearestTo !== undefined) {
			const url = new URL(document.url);
			results.push({
				url: document.url,
				host: url.host.replace(/^www\./, ""),
				...(document.favicon ? { favicon: document.favicon } : {}),
				firstSeen: document.firstSeen,
				lastSeen: document.lastSeen,
				eventCount: document.eventCount,
				pageCount: document.pageCount,
				excerpt: document.excerpt || `${url.hostname}${url.pathname}`,
				...(document.searchQueries.length
					? { searchQueries: document.searchQueries.map((item) => item.query) }
					: {}),
				pageExcerptAvailable: document.sources.some(
					(source) =>
						source.kind === "page" && source.evidenceKind !== "title-only",
				),
				...(document.pageTitle ? { pageTitle: document.pageTitle } : {}),
				evidenceKinds: [...(document.evidenceKinds ?? [])],
				matchedTerms,
				sources: document.sources.map(
					({ kind, id, timestamp, url: sourceUrl, evidenceKind }) => ({
						kind,
						id,
						timestamp,
						url: sourceUrl,
						evidenceKind,
					}),
				),
				sourceCount: document.sourceCount,
				score,
			});
		}
		if (index > 0 && index % 512 === 0) await yieldTurn();
	}
	const offset = options.offset ?? 0;
	return results
		.sort((a, b) => {
			if (options.nearestTo !== undefined)
				return (
					Math.abs(a.lastSeen - options.nearestTo) -
					Math.abs(b.lastSeen - options.nearestTo)
				);
			const leftRank = candidateRanks.get(a.url) ?? -1;
			const rightRank = candidateRanks.get(b.url) ?? -1;
			if (leftRank >= 0 || rightRank >= 0)
				return (
					(leftRank < 0 ? Infinity : leftRank) -
					(rightRank < 0 ? Infinity : rightRank)
				);
			return b.score - a.score || b.lastSeen - a.lastSeen;
		})
		.slice(offset, offset + limit);
};

/** Keep page titles, excerpts, URL paths, and raw event fields out of assistant activity results. */
export const projectActivitySearchResults = (
	results: HistorySearchResult[],
): ActivitySearchResult[] =>
	results.map((result) => ({
		site: new URL(result.url).origin,
		firstSeen: result.firstSeen,
		lastSeen: result.lastSeen,
		eventCount: result.eventCount,
		pageCount: result.pageCount,
		matchedFrom: result.evidenceKinds,
		matchedTerms: result.matchedTerms,
		anchors: result.sources.map(({ kind, id, timestamp }) => ({
			kind,
			id,
			timestamp,
		})),
	}));
