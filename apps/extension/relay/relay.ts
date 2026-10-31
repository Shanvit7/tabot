/// <reference types="chrome" />

import {
	type AssistantConnections,
	canonicalPageUrl,
	logger,
	type PageNote,
	parseAssistantConnections,
	piiRedactor,
	projectActivitySearchResults,
	type StoredIngestRecord,
	type StoredTabEvent,
	safeRecallUrl,
	sessionForNote,
	sessionize,
} from "@tabot/shared";
import { createCaptureIdentity } from "../ingestion/capture-identity";
import { getStorageDb } from "../storage/client";

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
const ACTIVITY_RESULT_LIMIT = 8;
const MAX_ACTIVITY_OFFSET = 999_999;
const MAX_ACTIVITY_QUERY_CHARS = 200;

interface Credentials {
	installationId: string;
	token: string;
}

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
		const response = await fetch(`${HTTP_BASE}/connection`, {
			headers: { Authorization: `Bearer ${credentials.token}` },
			signal: AbortSignal.timeout(5_000),
		});
		if (!response.ok)
			throw new Error(`connection status failed: ${response.status}`);
		const connections = parseAssistantConnections(await response.json());
		if (!connections) throw new Error("Invalid connection status response");
		return connections;
	};

/**
 * Prove this extension owns a one-time OAuth authorization transaction. The
 * authorization page sees only success; its JavaScript never sees this token.
 */
export const approveAuthorizationTransaction = async (
	transactionId: string,
): Promise<void> => {
	const { token } = await ensureCredentials();
	const response = await fetch(
		`${HTTP_BASE}/authorize/transactions/${encodeURIComponent(transactionId)}/approve`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		},
	);
	if (!response.ok)
		throw new Error(`authorization approval failed: ${response.status}`);
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
	const response = await fetch(`${HTTP_BASE}/installations`, {
		method: "POST",
	});
	if (!response.ok) throw new Error(`registration failed: ${response.status}`);
	const creds = (await response.json()) as Credentials;
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
	const cursor = input?.cursor;
	let snapshot = Date.now();
	let offset = 0;
	if (cursor !== undefined) {
		const match =
			typeof cursor === "string" && /^(\d{1,16}):(\d{1,6})$/.exec(cursor);
		if (!match) throw new Error("cursor must be a valid next-page cursor.");
		snapshot = Number(match[1]);
		offset = Number(match[2]);
		if (
			!Number.isSafeInteger(snapshot) ||
			snapshot < 1 ||
			snapshot > Date.now() ||
			!Number.isSafeInteger(offset) ||
			offset < 1 ||
			offset > MAX_ACTIVITY_OFFSET
		)
			throw new Error("cursor must be a valid next-page cursor.");
	}
	const page = await getDb().then((db) =>
		db.searchHistory(query, { limit: limit + 1, offset, to: snapshot }),
	);
	const results = page.slice(0, limit);
	return {
		count: results.length,
		nextCursor:
			page.length > limit && offset + results.length <= MAX_ACTIVITY_OFFSET
				? `${snapshot}:${offset + results.length}`
				: null,
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
	const requestedCursor = input?.cursor;
	let snapshot = Date.now();
	let offset = 0;
	if (requestedCursor !== undefined) {
		const match =
			typeof requestedCursor === "string" &&
			/^(\d{1,16}):([1-9]\d{0,5})$/.exec(requestedCursor);
		if (!match) throw new Error("cursor must be a valid next-page cursor.");
		snapshot = Number(match[1]);
		offset = Number(match[2]);
		if (
			!Number.isSafeInteger(snapshot) ||
			snapshot < 1 ||
			snapshot > Date.now() ||
			!Number.isSafeInteger(offset) ||
			offset > MAX_ACTIVITY_OFFSET
		)
			throw new Error("cursor must be a valid next-page cursor.");
	}
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
			preview: isPage ? source.segments.join(" ").slice(0, 240) : null,
			matchedBy: [...new Set(matches.flatMap((match) => match.reasons))],
			matchedAnchorIds: matches.map((match) => match.id),
		};
	});
	return {
		count: page.length,
		nextCursor:
			rows.length > limit ? `${snapshot}:${offset + page.length}` : null,
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
			preview: string | null;
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
			preview: isPage ? source.segments.join(" ").slice(0, 240) : null,
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
	note: PageNote,
	sessions: ReturnType<typeof sessionize>,
) => {
	const session = sessionForNote(note, sessions);
	const [{ redacted: text }, { redacted: title }] = await Promise.all([
		piiRedactor.redact(note.text),
		piiRedactor.redact(note.title ?? ""),
	]);
	return {
		id: note.id,
		text: text.slice(0, 4_000),
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		origin: new URL(note.origin).origin,
		host: note.host,
		title: title || null,
		session: session
			? {
					start: session.startTimestamp,
					end: session.endTimestamp,
					durationMs: session.duration,
					sites: session.domains,
				}
			: null,
	};
};

const searchNotes = async (params: unknown) => {
	const input = params as {
		query?: unknown;
		from?: unknown;
		to?: unknown;
		site?: unknown;
		limit?: unknown;
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
	const limit =
		input?.limit === undefined ? ACTIVITY_RESULT_LIMIT : input.limit;
	if (
		!Number.isSafeInteger(limit) ||
		(limit as number) < 1 ||
		(limit as number) > ACTIVITY_RESULT_LIMIT
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const db = await getDb();
	const [notes, events] = await Promise.all([
		db.searchNotes(query, {
			from: input.from as number | undefined,
			to: input.to as number | undefined,
			domain: input.site as string | undefined,
			limit: limit as number,
		}),
		db.readEvents(),
	]);
	const sessions = sessionize(events as StoredTabEvent[]);
	return {
		count: notes.length,
		notes: await Promise.all(notes.map((note) => noteResult(note, sessions))),
	};
};

const getPageNotes = async (params: unknown) => {
	const input = params as { url?: unknown } | null;
	if (typeof input?.url !== "string" || input.url.length > 2_048)
		throw new Error("url must be an http or https page URL.");
	let parsed: URL;
	try {
		parsed = new URL(input.url);
	} catch {
		throw new Error("url must be an http or https page URL.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
		throw new Error("url must be an http or https page URL.");
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
	const [{ redacted: title }] = await Promise.all([
		piiRedactor.redact(notes[0]?.title ?? ""),
	]);
	return {
		found: notes.length > 0,
		origin: parsed.origin,
		host: parsed.hostname,
		title: title || null,
		notes: await Promise.all(
			notes
				.slice(0, ACTIVITY_RESULT_LIMIT)
				.map((note) => noteResult(note, sessions)),
		),
	};
};

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
	[SEARCH_NOTES_METHOD]: searchNotes,
	[GET_PAGE_NOTES_METHOD]: getPageNotes,
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
			logger.info("relay connected", { installationId });
		};
		ws.onmessage = onMessage;
		ws.onerror = () => {
			status.lastError = "socket error";
		};
		ws.onclose = () => {
			teardown();
			status.state = "offline";
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
