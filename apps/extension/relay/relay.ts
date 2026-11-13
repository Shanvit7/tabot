/// <reference types="chrome" />

import {
	type AssistantConnections,
	canonicalPageUrl,
	deriveSiteDomain,
	logger,
	type PageNote,
	projectActivitySearchResults,
	type StoredIngestRecord,
	type StoredTabEvent,
	safeRecallUrl,
	sensitiveDataRedactor,
	sessionForNote,
	sessionize,
} from "@tabot/shared";
import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import { isLibraryRequest, type LibraryPage } from "@tabot/shared/library";
import {
	createCaptureIdentity,
	createLibraryPageReference,
} from "../ingestion/capture-identity";
import { getStorageDb } from "../storage/client";
import {
	approveAuthorizationTransaction as approveAuthorization,
	getAssistantConnections as fetchAssistantConnections,
	pingRelay,
	type RelayCredentials,
	registerInstallation,
} from "./services";

/**
 * Extension ↔ relay connection.
 *
 * Owns: installation identity, authenticated WebSocket, heartbeat, exponential
 * backoff reconnect, request/response correlation, and local activity search.
 * Results are projected to the privacy-safe MCP contract before responding.
 */

// Production target. Local development overrides this in .env.development.
const RELAY_URL = (
	process.env.PLASMO_PUBLIC_MCP_RELAY_URL ??
	"https://tabot-mcp.shanvit7.workers.dev"
).replace(/\/$/, "");
const HTTP_BASE = RELAY_URL.replace(/^ws/, "http");
const WS_URL = `${RELAY_URL.replace(/^http/, "ws")}/relay`;

// Preserve existing production credentials; keep dev installations separate.
const STORAGE_KEY =
	RELAY_URL === "https://tabot-mcp.shanvit7.workers.dev"
		? "tabot_relay_credentials"
		: `tabot_relay_credentials:${new URL(RELAY_URL).host}`;
const HEARTBEAT_MS = 25_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

/** Relay method names — must match mcp-server src/mcp/tools.ts. */
const SEARCH_ACTIVITY_METHOD = "search_activity";
const FIND_ACTIVITY_MATCHES_METHOD = "find_activity_matches";
const GET_ACTIVITY_TIMELINE_METHOD = "get_activity_timeline";
const SEARCH_NOTES_METHOD = "search_notes";
const GET_PAGE_NOTES_METHOD = "get_page_notes";
const GET_SITE_NOTES_METHOD = "get_site_notes";
const LIST_SITES_METHOD = "list_sites";
const LIST_SITE_PAGES_METHOD = "list_site_pages";
const ACTIVITY_RESULT_LIMIT = 8;
const MAX_ACTIVITY_OFFSET = 999_999;
const MAX_ACTIVITY_QUERY_CHARS = 200;

const decodePageCursor = (
	cursor: unknown,
): { snapshot: number; offset: number } => {
	if (cursor === undefined) return { snapshot: Date.now(), offset: 0 };
	const match =
		typeof cursor === "string" && /^(\d{1,16}):([1-9]\d{0,5})$/.exec(cursor);
	if (!match) throw new Error("cursor must be a valid next-page cursor.");
	const snapshot = Number(match[1]);
	const offset = Number(match[2]);
	if (
		!Number.isSafeInteger(snapshot) ||
		snapshot < 1 ||
		snapshot > Date.now() ||
		!Number.isSafeInteger(offset) ||
		offset > MAX_ACTIVITY_OFFSET
	)
		throw new Error("cursor must be a valid next-page cursor.");
	return { snapshot, offset };
};

const nextPageCursor = (
	hasMore: boolean,
	snapshot: number,
	offset: number,
	count: number,
): string | null =>
	hasMore && offset + count <= MAX_ACTIVITY_OFFSET
		? `${snapshot}:${offset + count}`
		: null;

type Credentials = RelayCredentials;

interface ServerRequest {
	type: "request";
	requestId: string;
	method: string;
	params: unknown;
}

export type RelayState = "idle" | "connecting" | "connected" | "offline";

let socket: WebSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = BACKOFF_MIN_MS;
let connecting = false;

const status: {
	state: RelayState;
	installationId: string | null;
	lastError: string | null;
} = {
	state: "idle",
	installationId: null,
	lastError: null,
};

export const getRelayStatus = () => ({ ...status, relayUrl: RELAY_URL });

/** Query provider-specific OAuth grants, not the always-on relay WebSocket. */
export const getAssistantConnections =
	async (): Promise<AssistantConnections> => {
		const credentials = await loadCredentials();
		if (!credentials) return { chatgpt: false, claude: false, order: [] };
		return await fetchAssistantConnections(HTTP_BASE, credentials.token);
	};

/** Check current extension socket routing and OAuth grants without exposing credentials. */
export const runRelaySanityCheck = async () => {
	let roundTrip: { ok: boolean; status?: number; error?: string };
	try {
		const credentials = await loadCredentials();
		if (!credentials) throw new Error("credentials_missing");
		const response = await pingRelay(
			HTTP_BASE,
			credentials.installationId,
			credentials.token,
		);
		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			result?: { pong?: boolean };
			error?: { message?: string };
		} | null;
		roundTrip = {
			ok: response.ok && body?.ok === true && body.result?.pong === true,
			status: response.status,
			...(!response.ok || body?.ok !== true || body.result?.pong !== true
				? { error: body?.error?.message ?? "relay_ping_failed" }
				: {}),
		};
	} catch (error) {
		roundTrip = {
			ok: false,
			error: error instanceof Error ? error.message : "relay_ping_failed",
		};
	}

	let assistants: AssistantConnections | { error: string };
	try {
		assistants = await getAssistantConnections();
	} catch (error) {
		assistants = {
			error:
				error instanceof Error ? error.message : "connection_status_failed",
		};
	}
	const result = { relay: getRelayStatus(), roundTrip, assistants };
	if (process.env.NODE_ENV !== "production")
		logger.debug("relay sanity check", {
			state: result.relay.state,
			roundTrip: roundTrip.ok,
			chatgptConnected: "chatgpt" in assistants ? assistants.chatgpt : null,
		});
	return result;
};

/**
 * Prove this extension owns a one-time OAuth authorization transaction. The
 * authorization page sees only success; its JavaScript never sees this token.
 */
export const approveAuthorizationTransaction = async (
	transactionId: string,
): Promise<void> => {
	const { token } = await ensureCredentials();
	await approveAuthorization(HTTP_BASE, transactionId, token);
};

/**
 * Credentials survive Chrome and service-worker restarts. Only an absent record
 * creates a new installation; bad or expired saved credentials must fail closed
 * instead of silently breaking the user's existing ChatGPT connection.
 */
const loadCredentials = async (): Promise<Credentials | null> => {
	const stored = await chrome.storage.local.get(STORAGE_KEY);
	const creds = stored[STORAGE_KEY] as Partial<Credentials> | undefined;
	if (!creds) return null;
	if (
		typeof creds.installationId !== "string" ||
		!creds.installationId ||
		typeof creds.token !== "string" ||
		!creds.token
	) {
		throw new Error(
			"Stored Tabot relay credential is invalid. Reconnect Tabot.",
		);
	}
	return { installationId: creds.installationId, token: creds.token };
};

const register = async (): Promise<Credentials> => {
	const creds = await registerInstallation(HTTP_BASE);
	await chrome.storage.local.set({ [STORAGE_KEY]: creds });
	return creds;
};

const ensureCredentials = async (): Promise<Credentials> =>
	(await loadCredentials()) ?? register();

const send = (message: unknown) => {
	if (socket?.readyState === WebSocket.OPEN)
		socket.send(JSON.stringify(message));
};

// --- Local activity search -------------------------------------------------
// Shared helper resets failed opens; do not cache a rejected promise here.
const getDb = getStorageDb;

const searchActivity = async (params: unknown) => {
	const input = params as {
		query?: unknown;
		limit?: unknown;
		cursor?: unknown;
	} | null;
	const query = typeof input?.query === "string" ? input.query.trim() : "";
	if (!query || query.length > MAX_ACTIVITY_QUERY_CHARS)
		throw new Error("query must contain 1 to 200 characters.");
	const requestedLimit = input?.limit;
	if (
		requestedLimit !== undefined &&
		(!Number.isSafeInteger(requestedLimit) ||
			(requestedLimit as number) < 1 ||
			(requestedLimit as number) > ACTIVITY_RESULT_LIMIT)
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const limit = (requestedLimit as number | undefined) ?? ACTIVITY_RESULT_LIMIT;
	const { snapshot, offset } = decodePageCursor(input?.cursor);
	const page = await getDb().then((db) =>
		db.searchHistory(query, { limit: limit + 1, offset, to: snapshot }),
	);
	const results = page.slice(0, limit);
	return {
		count: results.length,
		nextCursor: nextPageCursor(
			page.length > limit,
			snapshot,
			offset,
			results.length,
		),
		results: projectActivitySearchResults(results),
	};
};

const findActivityMatches = async (params: unknown) => {
	const input = params as {
		anchors?: unknown;
		limit?: unknown;
		cursor?: unknown;
		maxGapHours?: unknown;
	} | null;
	const anchors = input?.anchors;
	if (
		!Array.isArray(anchors) ||
		anchors.length < 1 ||
		anchors.length > 8 ||
		anchors.some((source: unknown) => {
			if (!source || typeof source !== "object") return true;
			const reference = source as Record<string, unknown>;
			return (
				(reference.kind !== "event" && reference.kind !== "page") ||
				typeof reference.id !== "string" ||
				!reference.id.length ||
				reference.id.length > 64
			);
		})
	)
		throw new Error("anchors must contain 1 to 8 valid activity items.");
	const requestedLimit = input?.limit;
	if (
		requestedLimit !== undefined &&
		(!Number.isSafeInteger(requestedLimit) ||
			(requestedLimit as number) < 1 ||
			(requestedLimit as number) > ACTIVITY_RESULT_LIMIT)
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const limit = (requestedLimit as number | undefined) ?? ACTIVITY_RESULT_LIMIT;
	const requestedGap = input?.maxGapHours;
	if (
		requestedGap !== undefined &&
		(!Number.isSafeInteger(requestedGap) ||
			(requestedGap as number) < 1 ||
			(requestedGap as number) > 720)
	)
		throw new Error("maxGapHours must be an integer from 1 to 720.");
	const maxGapMs =
		((requestedGap as number | undefined) ?? 168) * 60 * 60 * 1_000;
	const { snapshot, offset } = decodePageCursor(input?.cursor);
	const references = anchors as { kind: "event" | "page"; id: string }[];
	const db = await getDb();
	const seeds = await Promise.all(
		references.map((source) =>
			source.kind === "event"
				? db.findEvent(source.id)
				: db.getPageObservation(source.id),
		),
	);
	if (seeds.some((seed) => !seed))
		throw new Error(
			"one or more selected activity items are no longer available.",
		);
	const anchorRecords = seeds as StoredIngestRecord[];
	const origins = [
		...new Set(
			anchorRecords.flatMap((source) => {
				const origin = safeRecallUrl(source.url)?.origin;
				return origin ? [origin] : [];
			}),
		),
	];
	const pageKeys = [
		...new Set(
			anchorRecords.flatMap((source) =>
				"kind" in source && source.kind === "page-observation"
					? [source.pageKey]
					: [],
			),
		),
	];
	const rows = await db.readRelatedActivity(
		anchorRecords.map((source) => source.timestamp),
		pageKeys,
		origins,
		anchorRecords.map((source) => source.id),
		maxGapMs,
		limit,
		offset,
		snapshot,
	);
	const page = rows.slice(0, limit);
	const results = page.map((source) => {
		const origin = safeRecallUrl(source.url)?.origin ?? null;
		const isPage = "kind" in source && source.kind === "page-observation";
		const matches = anchorRecords.flatMap((seed) => {
			const seedOrigin = safeRecallUrl(seed.url)?.origin;
			const reasons = [
				...(isPage &&
				"kind" in seed &&
				seed.kind === "page-observation" &&
				seed.pageKey === source.pageKey
					? ["same_page"]
					: []),
				...(origin && origin === seedOrigin ? ["same_site"] : []),
				...(Math.abs(source.timestamp - seed.timestamp) <= maxGapMs
					? ["within_time_window"]
					: []),
			];
			return reasons.length ? [{ id: seed.id, reasons }] : [];
		});
		return {
			id: source.id,
			kind: isPage ? "page" : "event",
			timestamp: source.timestamp,
			site: origin,
			matchedBy: [...new Set(matches.flatMap((match) => match.reasons))],
			matchedAnchorIds: matches.map((match) => match.id),
		};
	});
	return {
		count: page.length,
		nextCursor: nextPageCursor(
			rows.length > limit,
			snapshot,
			offset,
			page.length,
		),
		matches: results,
	};
};

const getActivityTimeline = async (params: unknown) => {
	const related = (await findActivityMatches(params)) as {
		count: number;
		nextCursor: string | null;
		matches: {
			id: string;
			kind: "event" | "page";
			timestamp: number;
			site: string | null;
			matchedBy: string[];
			matchedAnchorIds: string[];
		}[];
	};
	const input = params as { anchors: { kind: "event" | "page"; id: string }[] };
	const db = await getDb();
	const seeds = await Promise.all(
		input.anchors.map((source) =>
			source.kind === "event"
				? db.findEvent(source.id)
				: db.getPageObservation(source.id),
		),
	);
	if (seeds.some((seed) => !seed))
		throw new Error(
			"one or more selected activity items are no longer available.",
		);
	const seedSteps = (seeds as StoredIngestRecord[]).map((source) => {
		const isPage = "kind" in source && source.kind === "page-observation";
		return {
			id: source.id,
			kind: isPage ? "page" : "event",
			timestamp: source.timestamp,
			site: safeRecallUrl(source.url)?.origin ?? null,
			role: "anchor",
		};
	});
	return {
		count: related.count,
		nextCursor: related.nextCursor,
		items: [
			...seedSteps,
			...related.matches.map((result) => ({ ...result, role: "match" })),
		].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)),
	};
};

const noteResult = async (
	note: PageNote | DashboardNoteResult,
	sessions: ReturnType<typeof sessionize>,
) => {
	const session = "origin" in note ? sessionForNote(note, sessions) : undefined;
	const [{ redacted: text }, { redacted: title }] = await Promise.all([
		sensitiveDataRedactor.redact(note.text),
		sensitiveDataRedactor.redact(note.title ?? ""),
	]);
	return {
		id: note.id,
		text: text.slice(0, 4_000),
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		origin: new URL("origin" in note ? note.origin : note.url).origin,
		host: note.host,
		site: deriveSiteDomain(note.host),
		title: title || null,
		session: session
			? {
					start: session.startTimestamp,
					end: session.endTimestamp,
					durationMs: session.duration,
					sites: session.domains,
				}
			: "session" in note
				? note.session
				: null,
	};
};

const pageReference = (page: LibraryPage) =>
	createLibraryPageReference(page.site, page.url);

const listLibrary = async (params: unknown, level: "sites" | "pages") => {
	if (!params || typeof params !== "object" || Array.isArray(params))
		throw new Error("Invalid library request.");
	const input = params as Record<string, unknown>;
	if (
		Object.keys(input).some(
			(key) =>
				!["query", "site", "from", "to", "limit", "cursor"].includes(key),
		)
	)
		throw new Error("Invalid library request.");
	const { snapshot, offset } = decodePageCursor(input.cursor);
	const limit = input.limit ?? ACTIVITY_RESULT_LIMIT;
	if (
		typeof limit !== "number" ||
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > ACTIVITY_RESULT_LIMIT
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const request = {
		level,
		query: input.query,
		site: input.site,
		from: input.from,
		to: input.to,
		limit,
		offset,
	};
	if (!isLibraryRequest(request))
		throw new Error("Invalid library scope, query or time range.");
	request.to = Math.min(request.to ?? snapshot, snapshot);
	if (!isLibraryRequest(request))
		throw new Error("Time range starts after the cursor snapshot.");
	const data = await (await getDb()).browseLibrary(request);
	return {
		total: data.total,
		count: data.sites.length + data.pages.length,
		nextCursor: nextPageCursor(
			data.hasMore,
			snapshot,
			offset,
			data.sites.length + data.pages.length,
		),
		...(level === "sites"
			? {
					sites: data.sites.map(({ site, pageCount, noteCount, lastSeen }) => ({
						site,
						pageCount,
						noteCount,
						lastSeen,
					})),
				}
			: {
					pages: await Promise.all(
						data.pages.map(async (page) => ({
							pageRef: await pageReference(page),
							site: page.site,
							host: page.host,
							firstSeen: page.firstSeen,
							lastSeen: page.lastSeen,
							noteCount: page.noteCount,
							captureAvailable: page.pageExcerptAvailable,
						})),
					),
				}),
	};
};

const getReferencedPageNotes = async (input: Record<string, unknown>) => {
	if (
		typeof input.pageRef !== "string" ||
		!/^[a-z0-9.%A-F-]{1,765}:[a-f0-9]{64}$/.test(input.pageRef)
	)
		throw new Error(
			"pageRef must be a page reference returned by list_site_pages.",
		);
	let site: string;
	try {
		site = decodeURIComponent(
			input.pageRef.slice(0, input.pageRef.lastIndexOf(":")),
		);
	} catch {
		throw new Error("Invalid page reference.");
	}
	const { snapshot, offset } = decodePageCursor(input.cursor);
	const limit = input.limit ?? ACTIVITY_RESULT_LIMIT;
	if (
		typeof limit !== "number" ||
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > ACTIVITY_RESULT_LIMIT
	)
		throw new Error("limit must be an integer from 1 to 8.");
	if (!isLibraryRequest({ level: "pages", site }))
		throw new Error("Invalid page reference site.");
	const db = await getDb();
	// ponytail: scan this site's pages to resolve private references; add a local ref index if this becomes slow.
	for (let pageOffset = 0; ; pageOffset += 20) {
		const batch = await db.browseLibrary({
			level: "pages",
			site,
			to: snapshot,
			limit: 20,
			offset: pageOffset,
		});
		for (const page of batch.pages) {
			if ((await pageReference(page)) !== input.pageRef) continue;
			const data = await db.browseLibrary({
				level: "notes",
				url: page.url,
				limit,
				offset,
				to: snapshot,
			});
			return {
				found: true,
				pageRef: input.pageRef,
				site,
				host: page.host,
				total: data.total,
				count: data.notes.length,
				nextCursor: nextPageCursor(
					data.hasMore,
					snapshot,
					offset,
					data.notes.length,
				),
				notes: await Promise.all(
					data.notes.map((note) => noteResult(note, [])),
				),
			};
		}
		if (!batch.hasMore) break;
	}
	return {
		found: false,
		pageRef: input.pageRef,
		site,
		total: 0,
		count: 0,
		nextCursor: null,
		notes: [],
	};
};

const searchNotes = async (params: unknown) => {
	const input = params as {
		query?: unknown;
		from?: unknown;
		to?: unknown;
		site?: unknown;
		limit?: unknown;
		cursor?: unknown;
	} | null;
	const query = typeof input?.query === "string" ? input.query.trim() : "";
	if (!query || query.length > MAX_ACTIVITY_QUERY_CHARS)
		throw new Error("query must contain 1 to 200 characters.");
	if (
		input?.from !== undefined &&
		(typeof input.from !== "number" ||
			!Number.isFinite(input.from) ||
			input.from < 0)
	)
		throw new Error("from must be a timestamp.");
	if (
		input?.to !== undefined &&
		(typeof input.to !== "number" ||
			!Number.isFinite(input.to) ||
			input.to < 0 ||
			(typeof input.from === "number" && input.to < input.from))
	)
		throw new Error("to must be a timestamp at or after from.");
	if (
		input?.site !== undefined &&
		(typeof input.site !== "string" || input.site.length > 253)
	)
		throw new Error("site must be a domain.");
	const requestedLimit = input?.limit ?? ACTIVITY_RESULT_LIMIT;
	if (
		!Number.isSafeInteger(requestedLimit) ||
		(requestedLimit as number) < 1 ||
		(requestedLimit as number) > ACTIVITY_RESULT_LIMIT
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const limit = requestedLimit as number;
	const { snapshot, offset } = decodePageCursor(input?.cursor);
	const db = await getDb();
	const [notes, events] = await Promise.all([
		db.searchNotes(query, {
			from: input.from as number | undefined,
			to: Math.min((input.to as number | undefined) ?? snapshot, snapshot),
			domain: input.site as string | undefined,
			limit: limit + 1,
			offset,
		}),
		db.readEvents(),
	]);
	const sessions = sessionize(events as StoredTabEvent[]);
	const page = notes.slice(0, limit);
	return {
		count: page.length,
		nextCursor: nextPageCursor(
			notes.length > limit,
			snapshot,
			offset,
			page.length,
		),
		notes: await Promise.all(page.map((note) => noteResult(note, sessions))),
	};
};

const getPageNotes = async (params: unknown) => {
	if (!params || typeof params !== "object" || Array.isArray(params))
		throw new Error("Invalid page notes request.");
	const input = params as Record<string, unknown>;
	if (
		Object.keys(input).some(
			(key) => !["url", "pageRef", "limit", "cursor"].includes(key),
		) ||
		(input.url === undefined) === (input.pageRef === undefined)
	)
		throw new Error("Provide exactly one of url or pageRef.");
	if (input.pageRef !== undefined) return getReferencedPageNotes(input);
	if (typeof input?.url !== "string" || input.url.length > 2_048)
		throw new Error("url must be an http or https page URL.");
	let parsed: URL;
	try {
		parsed = new URL(input.url);
	} catch {
		throw new Error("url must be an http or https page URL.");
	}
	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
		parsed.username ||
		parsed.password
	)
		throw new Error("url must be an http or https page URL.");
	const requestedLimit = input.limit ?? ACTIVITY_RESULT_LIMIT;
	if (
		!Number.isSafeInteger(requestedLimit) ||
		(requestedLimit as number) < 1 ||
		(requestedLimit as number) > ACTIVITY_RESULT_LIMIT
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const limit = requestedLimit as number;
	const { snapshot, offset } = decodePageCursor(input.cursor);
	const pageKey = await createCaptureIdentity([
		"page-resource:v1",
		canonicalPageUrl(parsed.href),
	]);
	const db = await getDb();
	const [notes, events] = await Promise.all([
		db.listPageNotes(pageKey),
		db.readEvents(),
	]);
	const sessions = sessionize(events as StoredTabEvent[]);
	const eligibleNotes = notes.filter((note) => note.createdAt <= snapshot);
	const candidates = eligibleNotes.slice(offset, offset + limit + 1);
	const page = candidates.slice(0, limit);
	const [{ redacted: title }] = await Promise.all([
		sensitiveDataRedactor.redact(page[0]?.title ?? ""),
	]);
	return {
		found: page.length > 0,
		origin: parsed.origin,
		host: parsed.hostname,
		title: title || null,
		count: page.length,
		nextCursor: nextPageCursor(
			candidates.length > limit,
			snapshot,
			offset,
			page.length,
		),
		notes: await Promise.all(page.map((note) => noteResult(note, sessions))),
	};
};

const getSiteNotes = async (params: unknown) => {
	const input = params as { site?: unknown } | null;
	if (
		typeof input?.site !== "string" ||
		!input.site.trim() ||
		input.site.length > 253
	)
		throw new Error("site must be a domain.");
	let site: string;
	try {
		const parsed = new URL(
			input.site.includes("://") ? input.site : `https://${input.site}`,
		);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
			throw new Error("site must be a domain.");
		site = deriveSiteDomain(parsed.hostname);
	} catch {
		throw new Error("site must be a domain.");
	}
	const db = await getDb();
	const [notes, events] = await Promise.all([
		db.listNotesForSite(site),
		db.readEvents(),
	]);
	const sessions = sessionize(events as StoredTabEvent[]);
	return {
		site,
		count: notes.length,
		notes: await Promise.all(notes.map((note) => noteResult(note, sessions))),
	};
};

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
	[SEARCH_NOTES_METHOD]: searchNotes,
	[GET_PAGE_NOTES_METHOD]: getPageNotes,
	[GET_SITE_NOTES_METHOD]: getSiteNotes,
	[LIST_SITES_METHOD]: (params) => listLibrary(params, "sites"),
	[LIST_SITE_PAGES_METHOD]: (params) => listLibrary(params, "pages"),
	[SEARCH_ACTIVITY_METHOD]: searchActivity,
	[FIND_ACTIVITY_MATCHES_METHOD]: findActivityMatches,
	[GET_ACTIVITY_TIMELINE_METHOD]: getActivityTimeline,
};

const handleRequest = async (message: ServerRequest) => {
	if (message.method === "ping") {
		send({
			type: "response",
			requestId: message.requestId,
			result: { pong: true, at: Date.now() },
		});
		return;
	}
	const handler = handlers[message.method];
	if (!handler) {
		send({
			type: "response",
			requestId: message.requestId,
			error: {
				code: "unimplemented",
				message: `Method not implemented: ${message.method}`,
			},
		});
		return;
	}
	try {
		const result = await handler(message.params);
		send({ type: "response", requestId: message.requestId, result });
	} catch (error) {
		send({
			type: "response",
			requestId: message.requestId,
			error: {
				code: "request_failed",
				message:
					error instanceof Error ? error.message : "Tabot request failed.",
			},
		});
	}
};

const onMessage = (event: MessageEvent) => {
	if (typeof event.data !== "string") return;
	if (event.data === "pong") return;
	let parsed: ServerRequest;
	try {
		parsed = JSON.parse(event.data) as ServerRequest;
	} catch {
		return;
	}
	if (parsed?.type === "request" && parsed.requestId)
		void handleRequest(parsed);
};

const stopHeartbeat = () => {
	if (heartbeat) clearInterval(heartbeat);
	heartbeat = null;
};

const startHeartbeat = () => {
	stopHeartbeat();
	heartbeat = setInterval(() => {
		if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
	}, HEARTBEAT_MS);
};

const scheduleReconnect = () => {
	if (reconnectTimer) return;
	const delay = backoffMs + Math.floor(Math.random() * 500);
	if (process.env.NODE_ENV !== "production")
		logger.debug("relay reconnect scheduled", { delayMs: delay });
	backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		void connect();
	}, delay);
};

const teardown = () => {
	stopHeartbeat();
	socket = null;
};

const connect = async (): Promise<void> => {
	if (connecting || socket) return;
	connecting = true;
	status.state = "connecting";
	if (process.env.NODE_ENV !== "production")
		logger.debug("relay connecting", { relayUrl: RELAY_URL });
	try {
		const { installationId, token } = await ensureCredentials();
		status.installationId = installationId;
		// Browsers cannot attach an Authorization header to WebSocket upgrades.
		// A subprotocol keeps this bearer credential out of URLs and request logs.
		const ws = new WebSocket(WS_URL, token);
		socket = ws;
		ws.onopen = () => {
			backoffMs = BACKOFF_MIN_MS;
			status.state = "connected";
			status.lastError = null;
			startHeartbeat();
			logger.info("relay connected", {
				relayUrl: RELAY_URL,
				...(process.env.NODE_ENV !== "production"
					? { installationTag: installationId.slice(-8) }
					: {}),
			});
		};
		ws.onmessage = onMessage;
		ws.onerror = () => {
			status.lastError = "socket error";
			if (process.env.NODE_ENV !== "production")
				logger.warn("relay socket error", { relayUrl: RELAY_URL });
		};
		ws.onclose = (event) => {
			teardown();
			status.state = "offline";
			status.lastError = `socket closed (${event.code})`;
			if (process.env.NODE_ENV !== "production")
				logger.warn("relay disconnected", {
					relayUrl: RELAY_URL,
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
				});
			scheduleReconnect();
		};
	} catch (error) {
		status.state = "offline";
		status.lastError =
			error instanceof Error ? error.message : "connect failed";
		logger.warn("relay connect failed", { error: status.lastError });
		scheduleReconnect();
	} finally {
		connecting = false;
	}
};

/** Start (and keep alive) the relay connection. Safe to call repeatedly. */
export const startRelay = (): void => {
	void connect();
};
