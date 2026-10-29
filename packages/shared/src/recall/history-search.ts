import type { StoredTabEvent } from "../events/db";
import type { StoredPageObservation } from "../pages/observations";

type Source = {
	kind: "event" | "page";
	id: string;
	timestamp: number;
	url: string;
	text: string;
	matchedTermCount: number;
	excerpt?: string;
};
type SearchGroup = {
	url: string;
	text: Set<string>;
	firstSeen: number;
	lastSeen: number;
	eventCount: number;
	pageCount: number;
	sourceCount: number;
	sources: Source[];
	excerpt: string;
	excerptMatches: number;
	excerptSourceId: string;
};
export type HistorySearchCitation = Pick<
	Source,
	"kind" | "id" | "timestamp" | "url"
>;
export type HistorySearchResult = {
	url: string;
	host: string;
	firstSeen: number;
	lastSeen: number;
	eventCount: number;
	pageCount: number;
	excerpt: string;
	pageExcerptAvailable: boolean;
	matchedTerms: string[];
	sources: HistorySearchCitation[];
	sourceCount: number;
	score: number;
};
export type HistorySearchOptions = {
	from?: number;
	to?: number;
	origin?: string;
	limit?: number;
	offset?: number;
};
export type EvidenceSearchResult = {
	origin: string;
	firstSeen: number;
	lastSeen: number;
	eventCount: number;
	pageCount: number;
	excerpt: string;
	matchedTerms: string[];
	sources: Pick<HistorySearchCitation, "kind" | "id" | "timestamp">[];
};

export const tokenizeRecallText = (text: string): string[] =>
	text
		.normalize("NFKC")
		.toLowerCase()
		.match(/[\p{L}\p{N}]+/gu) ?? [];
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
	if (source.kind === "event") group.eventCount++;
	else {
		group.pageCount++;
		const matched = new Set(
			tokenizeRecallText(source.excerpt ?? "").filter((term) =>
				queryTerms.has(term),
			),
		);
		if (matched.size > group.excerptMatches) {
			group.excerptMatches = matched.size;
			group.excerpt = source.excerpt ?? "";
			group.excerptSourceId = source.id;
		}
	}
	group.sources.push(source);
	group.sources = group.sources
		.toSorted(
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
		!terms.length ||
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
		const text = `${url.hostname} ${url.pathname} ${event.type.replaceAll("_", " ")}`;
		const source: Source = {
			kind: "event",
			id: event.id,
			timestamp: event.timestamp,
			url: url.href,
			text,
			matchedTermCount: terms.filter((term) =>
				tokenizeRecallText(text).includes(term),
			).length,
		};
		const group = groups.get(source.url) ?? {
			url: source.url,
			text: new Set<string>(),
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
		const pageText = page.segments.join(" ");
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
		const source: Source = {
			kind: "page",
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
		if (score) {
			const url = new URL(document.url);
			results.push({
				url: document.url,
				host: url.host.replace(/^www\./, ""),
				firstSeen: document.firstSeen,
				lastSeen: document.lastSeen,
				eventCount: document.eventCount,
				pageCount: document.pageCount,
				excerpt: document.excerpt || `${url.hostname}${url.pathname}`,
				pageExcerptAvailable: Boolean(document.excerptSourceId),
				matchedTerms,
				sources: document.sources.map(
					({ kind, id, timestamp, url: sourceUrl }) => ({
						kind,
						id,
						timestamp,
						url: sourceUrl,
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
		.toSorted((a, b) => b.score - a.score || b.lastSeen - a.lastSeen)
		.slice(offset, offset + limit);
};

/** Drop URL paths and raw event fields before returning search evidence to an MCP client. */
export const projectEvidenceSearchResults = (
	results: HistorySearchResult[],
): EvidenceSearchResult[] =>
	results.map((result) => ({
		origin: new URL(result.url).origin,
		firstSeen: result.firstSeen,
		lastSeen: result.lastSeen,
		eventCount: result.eventCount,
		pageCount: result.pageCount,
		excerpt: result.pageExcerptAvailable ? result.excerpt.slice(0, 240) : "",
		matchedTerms: result.matchedTerms,
		sources: result.sources.map(({ kind, id, timestamp }) => ({
			kind,
			id,
			timestamp,
		})),
	}));
