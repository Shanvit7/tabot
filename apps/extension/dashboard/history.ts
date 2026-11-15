import {
	deriveSiteDomain,
	type StoredTabEvent,
	safeRecallUrl,
	sessionForNote,
	sessionize,
	type TabotDatabase,
	UUID_PATTERN,
	validateNoteText,
} from "@tabot/shared";
import {
	type DashboardHistoryResponse,
	type DashboardPagePreview,
	isDashboardPagePreview,
	isRecord,
} from "@tabot/shared/dashboard";
import { isLibraryRequest, isLibraryResponse } from "@tabot/shared/library";
import { createLibraryPageReference } from "../ingestion/capture-identity";
import { isDashboardSender } from "./sender";

type HistoryReader = Pick<
	TabotDatabase,
	| "searchHistory"
	| "searchNotes"
	| "getSearchStatus"
	| "getPageObservation"
	| "readEvents"
> &
	Partial<
		Pick<TabotDatabase, "browseLibrary" | "updateNoteText" | "warmSearchModel">
	>;

export const readDashboardHistory = async (
	message: unknown,
	senderUrl: string | undefined,
	getDb: () => Promise<HistoryReader>,
): Promise<DashboardHistoryResponse> => {
	if (!isDashboardSender(senderUrl))
		return { ok: false, code: "unauthorized-sender" };
	if (!isRecord(message)) return { ok: false, code: "invalid-request" };
	if (message.type === "GET_PAGE_REFERENCE") {
		if (
			typeof message.url !== "string" ||
			message.url.length > 8192 ||
			safeRecallUrl(message.url)?.href !== message.url
		)
			return { ok: false, code: "invalid-request" };
		try {
			const url = new URL(message.url);
			return {
				pageRef: await createLibraryPageReference(
					deriveSiteDomain(url.hostname),
					message.url,
				),
			};
		} catch {
			return { ok: false, code: "page-reference-unavailable" };
		}
	}
	if (message.type === "PRELOAD_SEARCH_MODEL") {
		try {
			const db = await getDb();
			if (!db.warmSearchModel)
				return { ok: false, code: "search-preload-unavailable" };
			await db.warmSearchModel();
			return { preloadStarted: true };
		} catch {
			return { ok: false, code: "search-preload-unavailable" };
		}
	}
	if (message.type === "BROWSE_LIBRARY") {
		if (!isLibraryRequest(message))
			return { ok: false, code: "invalid-request" };
		try {
			const db = await getDb();
			if (!db.browseLibrary) return { ok: false, code: "library-unavailable" };
			const response = await db.browseLibrary(message);
			return isLibraryResponse(response)
				? response
				: { ok: false, code: "library-unavailable" };
		} catch {
			return { ok: false, code: "library-unavailable" };
		}
	}
	const search = message.type === "SEARCH_HISTORY";
	const updateNote = message.type === "UPDATE_NOTE";
	if (updateNote) {
		if (
			typeof message.id !== "string" ||
			message.id.length > 64 ||
			!validateNoteText(message.text)
		)
			return { ok: false, code: "invalid-request" };
	} else if (search) {
		if (
			typeof message.query !== "string" ||
			!message.query.trim() ||
			message.query.length > 240 ||
			(message.limit !== undefined &&
				(typeof message.limit !== "number" ||
					!Number.isInteger(message.limit) ||
					message.limit < 1 ||
					message.limit > 20)) ||
			(message.offset !== undefined &&
				(typeof message.offset !== "number" ||
					!Number.isSafeInteger(message.offset) ||
					message.offset < 0)) ||
			(message.noteOffset !== undefined &&
				(typeof message.noteOffset !== "number" ||
					!Number.isSafeInteger(message.noteOffset) ||
					message.noteOffset < 0)) ||
			(message.from !== undefined &&
				(typeof message.from !== "number" ||
					!Number.isFinite(message.from) ||
					message.from < 0)) ||
			(message.to !== undefined &&
				(typeof message.to !== "number" ||
					!Number.isFinite(message.to) ||
					message.to < 0)) ||
			(typeof message.from === "number" &&
				typeof message.to === "number" &&
				message.from > message.to) ||
			(message.origin !== undefined &&
				(typeof message.origin !== "string" ||
					safeRecallUrl(message.origin)?.origin !== message.origin))
		)
			return { ok: false, code: "invalid-request" };
	} else if (
		message.type !== "GET_PAGE_PREVIEW" ||
		typeof message.id !== "string" ||
		!UUID_PATTERN.test(message.id) ||
		typeof message.url !== "string" ||
		message.url.length > 8192 ||
		safeRecallUrl(message.url)?.href !== message.url
	) {
		return { ok: false, code: "invalid-request" };
	}
	try {
		const db = await getDb();
		if (updateNote) {
			if (!db.updateNoteText)
				return { ok: false, code: "note-update-unavailable" };
			const note = await db.updateNoteText(
				message.id as string,
				message.text as string,
			);
			return note ? { note } : { ok: false, code: "note-not-found" };
		}
		if (search) {
			const options = {
				from: message.from as number | undefined,
				to: message.to as number | undefined,
				origin: message.origin as string | undefined,
				limit: (message.limit as number | undefined) ?? 20,
				offset: (message.offset as number | undefined) ?? 0,
			};
			const noteOffset = (message.noteOffset as number | undefined) ?? 0;
			const domain = options.origin
				? new URL(options.origin).hostname
				: undefined;
			const [results, notes, events, searchStatus] = await Promise.all([
				db.searchHistory(message.query as string, options),
				db.searchNotes(message.query as string, {
					from: options.from,
					to: options.to,
					domain,
					limit: options.limit,
					offset: noteOffset,
				}),
				db.readEvents(),
				db.getSearchStatus(),
			]);
			const sessions = sessionize(events as StoredTabEvent[]);
			return {
				results,
				searchStatus,
				notes: notes.map((note) => {
					const session = sessionForNote(note, sessions);
					return {
						id: note.id,
						text: note.text.slice(0, 4_000),
						createdAt: note.createdAt,
						updatedAt: note.updatedAt,
						url: note.url,
						host: note.host,
						site: deriveSiteDomain(note.host),
						title: note.title,
						favicon: safeRecallUrl(note.favicon ?? undefined)?.href ?? null,
						session: session
							? {
									start: session.startTimestamp,
									end: session.endTimestamp,
									durationMs: session.duration,
								}
							: null,
					};
				}),
			};
		}
		const page = await db.getPageObservation(message.id as string);
		const url = safeRecallUrl(page?.url)?.href;
		if (!page || page.id !== message.id || !url || url !== message.url)
			return { preview: null };
		// Explicit projection: no tab/window IDs, document keys, or privacy findings leave the owner.
		const preview: DashboardPagePreview = {
			id: page.id,
			url,
			timestamp: page.timestamp,
			segments: page.segments,
			...(page.title ? { title: page.title } : {}),
			trigger: page.trigger,
			coverage: {
				partial: page.coverage.partial,
				truncated: page.coverage.truncated,
			},
			redacted: page.privacy.redacted,
		};
		if (!isDashboardPagePreview(preview))
			return { ok: false, code: "preview-unavailable" };
		return { preview };
	} catch {
		return {
			ok: false,
			code: search ? "search-unavailable" : "preview-unavailable",
		};
	}
};
