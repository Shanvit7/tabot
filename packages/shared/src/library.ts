import {
	type DashboardNoteResult,
	isDashboardNotes,
	isDashboardSearchResults,
	isRecord,
} from "./dashboard";
import type { StoredTabEvent } from "./events/db";
import { deriveSiteDomain, type PageNote, sessionForNote } from "./notes/notes";
import type { StoredPageObservation } from "./pages/observations";
import {
	collectHistoryResults,
	type HistorySearchResult,
	safeRecallUrl,
	tokenizeRecallText,
} from "./recall/history-search";
import { sessionize } from "./sessions/sessions";

export type LibraryRequest = {
	level: "sites" | "pages" | "notes";
	query?: string;
	site?: string;
	url?: string;
	from?: number;
	to?: number;
	limit?: number;
	offset?: number;
};
export type LibrarySite = {
	site: string;
	url: string;
	favicon?: string;
	pageCount: number;
	noteCount: number;
	lastSeen: number;
};
export type LibraryPage = HistorySearchResult & {
	site: string;
	noteCount: number;
};
export type LibraryResponse = {
	sites: LibrarySite[];
	pages: LibraryPage[];
	notes: DashboardNoteResult[];
	total: number;
	hasMore: boolean;
};

export const rankLibrarySites = (sites: LibrarySite[], query: string) => {
	const terms = [...new Set(tokenizeRecallText(query))];
	const matchScore = (site: string) =>
		terms.filter((term) => tokenizeRecallText(site).includes(term)).length;
	return [...sites].sort(
		(left, right) =>
			matchScore(right.site) - matchScore(left.site) ||
			right.lastSeen - left.lastSeen ||
			left.site.localeCompare(right.site),
	);
};

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
const siteDomain = (value: unknown): value is string => {
	if (
		typeof value !== "string" ||
		!value ||
		value.length > 253 ||
		value.endsWith(".")
	)
		return false;
	const url = safeRecallUrl(`https://${value}/`);
	return Boolean(
		url &&
			url.hostname === value &&
			url.host === value &&
			deriveSiteDomain(value) === value &&
			(value.startsWith("[") ||
				value
					.split(".")
					.every((label) => label.length <= 63 && /^[a-z0-9_-]+$/.test(label))),
	);
};

export const isLibraryRequest = (value: unknown): value is LibraryRequest =>
	isRecord(value) &&
	!Array.isArray(value) &&
	(value.level === "sites" ||
		value.level === "pages" ||
		value.level === "notes") &&
	(value.query === undefined ||
		(typeof value.query === "string" && value.query.length <= 240)) &&
	(value.site === undefined || siteDomain(value.site)) &&
	(value.url === undefined || localUrl(value.url)) &&
	(value.level !== "pages" || value.site !== undefined) &&
	(value.level !== "notes" || value.url !== undefined) &&
	(value.site === undefined ||
		value.url === undefined ||
		deriveSiteDomain(new URL(value.url as string).hostname) === value.site) &&
	(value.from === undefined || timestamp(value.from)) &&
	(value.to === undefined || timestamp(value.to)) &&
	(value.from === undefined ||
		value.to === undefined ||
		(value.from as number) <= (value.to as number)) &&
	(value.limit === undefined ||
		(count(value.limit) && value.limit >= 1 && value.limit <= 20)) &&
	(value.offset === undefined || count(value.offset));

export const isLibraryResponse = (value: unknown): value is LibraryResponse => {
	if (
		!isRecord(value) ||
		!Array.isArray(value.sites) ||
		value.sites.length > 20 ||
		!isDashboardSearchResults(value.pages) ||
		!isDashboardNotes(value.notes) ||
		!count(value.total) ||
		typeof value.hasMore !== "boolean"
	)
		return false;
	const loaded = value.sites.length + value.pages.length + value.notes.length;
	return (
		[value.sites, value.pages, value.notes].filter((rows) => rows.length > 0)
			.length <= 1 &&
		loaded <= value.total &&
		(!value.hasMore || (loaded > 0 && loaded < value.total)) &&
		value.sites.every(
			(item) =>
				isRecord(item) &&
				siteDomain(item.site) &&
				localUrl(item.url) &&
				deriveSiteDomain(new URL(item.url).hostname) === item.site &&
				(item.favicon === undefined ||
					(localUrl(item.favicon) && item.favicon.length <= 2048)) &&
				count(item.pageCount) &&
				item.pageCount > 0 &&
				count(item.noteCount) &&
				timestamp(item.lastSeen),
		) &&
		value.pages.every(
			(item) =>
				siteDomain((item as LibraryPage).site) &&
				deriveSiteDomain(new URL(item.url).hostname) ===
					(item as LibraryPage).site &&
				count((item as LibraryPage).noteCount),
		) &&
		value.notes.every(
			(item) =>
				item.host === new URL(item.url).hostname &&
				item.site === deriveSiteDomain(item.host),
		)
	);
};

/**
 * Local keyword browse, not semantic search: any query token may match URL/type,
 * retained title/page text, or a note's title/text. Empty query includes all URLs.
 * Time bounds are inclusive, using event/page timestamp and note createdAt;
 * notes sort by updatedAt. Counts cover every in-range source on matching pages,
 * before pagination (site pageCount is distinct normalized URLs, not captures).
 * Notes-level query matches that note or its retained page metadata/text, not siblings.
 */
export const browseLibrary = async (
	events: StoredTabEvent[],
	pages: StoredPageObservation[],
	notes: PageNote[],
	request: LibraryRequest,
): Promise<LibraryResponse> => {
	if (!isLibraryRequest(request)) throw new Error("invalid-library-request");
	const inRange = (time: number) =>
		timestamp(time) &&
		time >= (request.from ?? 0) &&
		time <= (request.to ?? 8.64e15);
	const scopedUrl = (raw: string | undefined) => {
		const url = safeRecallUrl(raw);
		return url &&
			url.href.length <= 8192 &&
			siteDomain(deriveSiteDomain(url.hostname)) &&
			(!request.site || deriveSiteDomain(url.hostname) === request.site) &&
			(!request.url || url.href === request.url)
			? url
			: null;
	};
	const retainedEvents = events.filter(
		(row) => inRange(row.timestamp) && scopedUrl(row.url),
	);
	const retainedPages = pages.filter(
		(row) => inRange(row.timestamp) && scopedUrl(row.url),
	);
	const retainedNotes = notes.filter(
		(row) => inRange(row.createdAt) && scopedUrl(row.url),
	);
	const hasQuery = Boolean(request.query?.trim());
	const terms = [...new Set(tokenizeRecallText(request.query ?? ""))].slice(
		0,
		48,
	);
	const matches = (text: string) => {
		const tokens = new Set(tokenizeRecallText(text));
		return terms.some((term) => tokens.has(term));
	};
	const historyResults =
		terms.length || !hasQuery
			? await collectHistoryResults(
					retainedEvents,
					retainedPages,
					request.query ?? "",
				)
			: [];
	const metadataMatches = new Set(historyResults.map((page) => page.url));
	const noteMatches = (note: PageNote) => {
		const url = scopedUrl(note.url)!;
		return (
			!hasQuery ||
			(request.level !== "notes" && metadataMatches.has(url.href)) ||
			matches(
				`${url.hostname} ${url.pathname} ${note.title ?? ""} ${note.text}`,
			)
		);
	};
	const matchingUrls = new Set(metadataMatches);
	const notesByUrl = new Map<string, PageNote[]>();
	for (const note of retainedNotes) {
		const url = scopedUrl(note.url)!;
		const rows = notesByUrl.get(url.href) ?? [];
		rows.push(note);
		notesByUrl.set(url.href, rows);
		if (noteMatches(note)) matchingUrls.add(url.href);
	}
	// ponytail: O(retained records) full scan; add owner-side URL aggregates if retained history outgrows memory.
	const byUrl = new Map<string, LibraryPage>(
		historyResults.map((page) => [
			page.url,
			{
				...page,
				site: deriveSiteDomain(new URL(page.url).hostname),
				noteCount: 0,
			},
		]),
	);
	for (const [url, rows] of notesByUrl) {
		const latest = rows.reduce((left, right) =>
			left.updatedAt >= right.updatedAt ? left : right,
		);
		const page = byUrl.get(url) ?? {
			url,
			host: new URL(url).hostname,
			site: deriveSiteDomain(new URL(url).hostname),
			firstSeen: latest.createdAt,
			lastSeen: Math.min(latest.updatedAt, request.to ?? 8.64e15),
			eventCount: 0,
			pageCount: 0,
			sourceCount: 0,
			score: 0,
			excerpt: "",
			pageExcerptAvailable: false,
			evidenceKinds: [],
			matchedTerms: [],
			sources: [],
			noteCount: 0,
		};
		page.noteCount = rows.length;
		for (const note of rows) {
			page.firstSeen = Math.min(page.firstSeen, note.createdAt);
			page.lastSeen = Math.max(
				page.lastSeen,
				Math.min(note.updatedAt, request.to ?? 8.64e15),
			);
		}
		if (!page.pageTitle && latest.title)
			page.pageTitle = latest.title.slice(0, 300);
		const favicon = safeRecallUrl(latest.favicon ?? undefined)?.href;
		if (!page.favicon && favicon && favicon.length <= 2048)
			page.favicon = favicon;
		byUrl.set(url, page);
	}
	const matchedPages = [...byUrl.values()]
		.filter((page) => !hasQuery || matchingUrls.has(page.url))
		.sort(
			(left, right) =>
				right.score - left.score ||
				right.lastSeen - left.lastSeen ||
				left.url.localeCompare(right.url),
		);
	const offset = request.offset ?? 0;
	const limit = request.limit ?? 20;
	const response: LibraryResponse = {
		sites: [],
		pages: [],
		notes: [],
		total: 0,
		hasMore: false,
	};
	if (request.level === "notes") {
		const rows = retainedNotes
			.filter(noteMatches)
			.sort(
				(left, right) =>
					Math.min(right.updatedAt, request.to ?? 8.64e15) -
						Math.min(left.updatedAt, request.to ?? 8.64e15) ||
					left.id.localeCompare(right.id),
			);
		response.total = rows.length;
		const sessions = sessionize(events);
		response.notes = rows.slice(offset, offset + limit).map((note) => {
			const url = scopedUrl(note.url)!;
			const session = sessionForNote(note, sessions);
			const favicon = safeRecallUrl(note.favicon ?? undefined)?.href;
			return {
				id: note.id,
				text: note.text.slice(0, 4000),
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				url: url.href,
				host: url.hostname,
				site: deriveSiteDomain(url.hostname),
				title: note.title?.slice(0, 300) ?? null,
				favicon: favicon && favicon.length <= 2048 ? favicon : null,
				session: session
					? {
							start: session.startTimestamp,
							end: session.endTimestamp,
							durationMs: session.duration,
						}
					: null,
			};
		});
	} else if (request.level === "pages") {
		response.total = matchedPages.length;
		response.pages = matchedPages.slice(offset, offset + limit);
	} else {
		const sites = new Map<string, LibrarySite>();
		for (const page of matchedPages) {
			const site = sites.get(page.site) ?? {
				site: page.site,
				url: page.url,
				...(page.favicon ? { favicon: page.favicon } : {}),
				pageCount: 0,
				noteCount: 0,
				lastSeen: page.lastSeen,
			};
			site.pageCount++;
			site.noteCount += page.noteCount;
			sites.set(page.site, site);
		}
		const rows = rankLibrarySites([...sites.values()], request.query ?? "");
		response.total = rows.length;
		response.sites = rows.slice(offset, offset + limit);
	}
	response.hasMore = offset < response.total && limit < response.total - offset;
	if (!isLibraryResponse(response)) throw new Error("invalid-library-response");
	return response;
};
