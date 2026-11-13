import type { StoredTabEvent } from "../events/db";
import { sensitiveDataRedactor } from "./sensitive-data";

const MAX_SEARCH_QUERY_LENGTH = 512;
const searchQueryParameter = (url: URL) => {
	const host = url.hostname.toLowerCase();
	if (
		/^(?:www\.)?google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(host) &&
		url.pathname === "/search"
	)
		return "q";
	if (/^(?:www\.)?bing\.com$/.test(host) && url.pathname === "/search")
		return "q";
	if (
		/^(?:www\.)?duckduckgo\.com$/.test(host) &&
		["/", "/html/"].includes(url.pathname)
	)
		return "q";
	if (host === "search.brave.com" && url.pathname === "/search") return "q";
	if (host === "search.yahoo.com" && url.pathname === "/search") return "p";
	if (/^(?:www\.)?ecosia\.org$/.test(host) && url.pathname === "/search")
		return "q";
	return undefined;
};

export const searchQueryFromUrl = (raw: string | undefined) => {
	if (!raw || raw.length > 8192) return undefined;
	try {
		const url = new URL(raw);
		const parameter = searchQueryParameter(url);
		return parameter
			? url.searchParams.get(parameter)?.slice(0, MAX_SEARCH_QUERY_LENGTH)
			: undefined;
	} catch {
		return undefined;
	}
};

export const sanitizeUrlForIngestion = async (
	raw: string,
	options: { retainSearchQuery?: boolean } = {},
): Promise<string | undefined> => {
	let url: URL;
	if (raw.length > 8192) return undefined;
	try {
		url = new URL(raw);
	} catch {
		return undefined;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
	const host = await sensitiveDataRedactor.redact(url.hostname);
	if (host.findings.length) return undefined;
	url.username = "";
	url.password = "";
	const queryParameter = options.retainSearchQuery
		? searchQueryParameter(url)
		: undefined;
	const searchQuery = queryParameter
		? url.searchParams.get(queryParameter)?.slice(0, MAX_SEARCH_QUERY_LENGTH)
		: undefined;
	url.search = "";
	if (searchQuery) {
		const { redacted } = await sensitiveDataRedactor.redact(searchQuery);
		if (redacted.trim() && queryParameter)
			url.searchParams.set(queryParameter, redacted.trim());
	}
	url.hash = "";
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(url.pathname);
	} catch {
		return undefined;
	}
	const { redacted: pathname } =
		await sensitiveDataRedactor.redact(decodedPath);
	url.pathname = pathname;
	return url.toString();
};

/** Persist favicon URLs without credentials, query, fragment, or detected secrets. */
export const sanitizeEventForIngestion = async (
	event: StoredTabEvent,
): Promise<StoredTabEvent> => {
	const [url, favicon, documentUrl] = await Promise.all([
		event.url
			? sanitizeUrlForIngestion(event.url, { retainSearchQuery: true })
			: undefined,
		event.favicon && event.favicon.length <= 2048
			? sanitizeUrlForIngestion(event.favicon)
			: undefined,
		event.source?.documentUrl
			? sanitizeUrlForIngestion(event.source.documentUrl)
			: undefined,
	]);
	const safeFavicon =
		url && favicon && favicon.length <= 2048 ? favicon : undefined;
	const source = event.source
		? {
				...event.source,
				...(documentUrl ? { documentUrl } : {}),
				...(!documentUrl ? { documentUrl: undefined } : {}),
			}
		: undefined;
	return {
		...event,
		...(url ? { url } : { url: undefined }),
		favicon: safeFavicon,
		...(source ? { source } : {}),
	};
};
