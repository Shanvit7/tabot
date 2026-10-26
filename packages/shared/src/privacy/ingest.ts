import type { StoredTabEvent } from "../events/db";
import { piiRedactor } from "./pii-redactor";

export const sanitizeUrlForIngestion = async (
	raw: string,
): Promise<string | undefined> => {
	let url: URL;
	if (raw.length > 8192) return undefined;
	try {
		url = new URL(raw);
	} catch {
		return undefined;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
	const host = await piiRedactor.redact(url.hostname);
	if (host.findings.length) return undefined;
	url.username = "";
	url.password = "";
	// Query values and fragments can contain search terms, tokens, or private IDs.
	url.search = "";
	url.hash = "";
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(url.pathname);
	} catch {
		return undefined;
	}
	const { redacted: pathname } = await piiRedactor.redact(decodedPath);
	url.pathname = pathname;
	return url.toString();
};

/** Fail closed: persisted event URLs contain no query, fragment, or supported PII. */
export const sanitizeEventForIngestion = async (
	event: StoredTabEvent,
): Promise<StoredTabEvent> => {
	const [url, documentUrl] = await Promise.all([
		event.url ? sanitizeUrlForIngestion(event.url) : undefined,
		event.source?.documentUrl
			? sanitizeUrlForIngestion(event.source.documentUrl)
			: undefined,
	]);
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
		favicon: undefined,
		...(source ? { source } : {}),
	};
};
