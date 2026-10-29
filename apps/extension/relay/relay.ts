/// <reference types="chrome" />

import {
	type AssistantConnections,
	extractRelatednessFeatures,
	generateRelatednessCandidatesForSeeds,
	logger,
	parseAssistantConnections,
	projectEvidenceSearchResults,
	type RelatednessEvidence,
	relatednessIdentityKeys,
	relatednessMatchSignals,
	safeRecallUrl,
	scoreRelatednessHeuristic,
} from "@tabot/shared";
import { getStorageDb } from "../storage/client";

/**
 * Extension ↔ relay connection.
 *
 * Owns: installation identity, authenticated WebSocket, heartbeat, exponential
 * backoff reconnect, request/response correlation, and local evidence search.
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
const SEARCH_EVIDENCE_METHOD = "search_evidence";
const FIND_RELATED_EVIDENCE_METHOD = "find_related_evidence";
const GET_EVIDENCE_TRAIL_METHOD = "get_evidence_trail";
const EVIDENCE_RESULT_LIMIT = 8;
const MAX_EVIDENCE_OFFSET = 999_999;
const RELATEDNESS_CANDIDATE_LIMIT = 1_000;
const RELATEDNESS_PAIR_LIMIT = 20_000;
const MAX_EVIDENCE_QUERY_CHARS = 200;

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

// --- Local evidence search -------------------------------------------------
// Shared helper resets failed opens; do not cache a rejected promise here.
const getDb = getStorageDb;

const searchEvidence = async (params: unknown) => {
	const input = params as {
		query?: unknown;
		limit?: unknown;
		cursor?: unknown;
	} | null;
	const query = typeof input?.query === "string" ? input.query.trim() : "";
	if (!query || query.length > MAX_EVIDENCE_QUERY_CHARS)
		throw new Error("query must contain 1 to 200 characters.");
	const requestedLimit = input?.limit;
	if (
		requestedLimit !== undefined &&
		(!Number.isSafeInteger(requestedLimit) ||
			(requestedLimit as number) < 1 ||
			(requestedLimit as number) > EVIDENCE_RESULT_LIMIT)
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const limit = (requestedLimit as number | undefined) ?? EVIDENCE_RESULT_LIMIT;
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
			offset > MAX_EVIDENCE_OFFSET
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
			page.length > limit && offset + results.length <= MAX_EVIDENCE_OFFSET
				? `${snapshot}:${offset + results.length}`
				: null,
		results: projectEvidenceSearchResults(results),
	};
};

const findRelatedEvidence = async (params: unknown) => {
	const input = params as {
		sources?: unknown;
		limit?: unknown;
		cursor?: unknown;
		maxGapHours?: unknown;
	} | null;
	const sources = input?.sources;
	if (
		!Array.isArray(sources) ||
		sources.length < 1 ||
		sources.length > 8 ||
		sources.some((source: unknown) => {
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
		throw new Error("sources must contain 1 to 8 valid evidence references.");
	const requestedLimit = input?.limit;
	if (
		requestedLimit !== undefined &&
		(!Number.isSafeInteger(requestedLimit) ||
			(requestedLimit as number) < 1 ||
			(requestedLimit as number) > EVIDENCE_RESULT_LIMIT)
	)
		throw new Error("limit must be an integer from 1 to 8.");
	const limit = (requestedLimit as number | undefined) ?? EVIDENCE_RESULT_LIMIT;
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
			offset > MAX_EVIDENCE_OFFSET
		)
			throw new Error("cursor must be a valid next-page cursor.");
	}
	const references = sources as { kind: "event" | "page"; id: string }[];
	const db = await getDb();
	const seeds = await Promise.all(
		references.map(async (source) =>
			source.kind === "event"
				? db.findEvent(source.id)
				: db.getPageObservation(source.id),
		),
	);
	if (seeds.some((seed) => !seed))
		throw new Error("one or more evidence references are no longer available.");
	const evidence = seeds as RelatednessEvidence[];
	const nearby = await db.readRelatednessEvidence(
		evidence.map((source) => source.timestamp),
		[...new Set(evidence.flatMap(relatednessIdentityKeys))],
		maxGapMs,
		RELATEDNESS_CANDIDATE_LIMIT,
		snapshot,
	);
	const evidenceById = new Map<string, RelatednessEvidence>();
	for (const source of [...evidence, ...nearby])
		evidenceById.set(source.id, source);
	const seedIds = new Set(evidence.map((source) => source.id));
	const ranked = new Map<
		string,
		{
			source: RelatednessEvidence;
			score: number;
			signals: string[];
			matchedSeedIds: Set<string>;
		}
	>();
	const pairs = generateRelatednessCandidatesForSeeds(
		[...evidenceById.values()],
		[...seedIds],
		{
			maxPairs: RELATEDNESS_PAIR_LIMIT,
			maxTemporalNeighbors: 64,
			maxTimeGapMs: maxGapMs,
		},
	);
	for (const pair of pairs) {
		const left = evidenceById.get(pair.sourceIds[0]);
		const right = evidenceById.get(pair.sourceIds[1]);
		if (!left || !right) continue;
		const leftIsSeed = seedIds.has(left.id);
		const rightIsSeed = seedIds.has(right.id);
		if (leftIsSeed === rightIsSeed) continue;
		const seed = leftIsSeed ? left : right;
		const candidate = leftIsSeed ? right : left;
		const features = extractRelatednessFeatures(seed, candidate).features;
		const signals = relatednessMatchSignals(features);
		if (!signals.length) continue;
		const score = scoreRelatednessHeuristic(features);
		const current = ranked.get(candidate.id);
		if (current) {
			current.matchedSeedIds.add(seed.id);
			if (score > current.score) {
				current.score = score;
				current.signals = signals;
			}
		} else {
			ranked.set(candidate.id, {
				source: candidate,
				score,
				signals,
				matchedSeedIds: new Set([seed.id]),
			});
		}
	}
	const results = [...ranked.values()]
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.source.timestamp - a.source.timestamp ||
				a.source.id.localeCompare(b.source.id),
		)
		.slice(offset, offset + limit + 1);
	const page = results.slice(0, limit);
	return {
		ranker: "heuristic-v1",
		count: page.length,
		nextCursor:
			results.length > limit ? `${snapshot}:${offset + page.length}` : null,
		candidatePoolLimited: nearby.length === RELATEDNESS_CANDIDATE_LIMIT,
		results: page.map(({ source, score, signals, matchedSeedIds }) => {
			const url = safeRecallUrl(source.url);
			const isPage = "kind" in source && source.kind === "page-observation";
			return {
				id: source.id,
				kind: isPage ? "page" : "event",
				timestamp: source.timestamp,
				origin: url?.origin ?? null,
				excerpt: isPage ? source.segments.join(" ").slice(0, 240) : "",
				score,
				signals,
				matchedSeedIds: [...matchedSeedIds],
			};
		}),
	};
};

const getEvidenceTrail = async (params: unknown) => {
	const related = (await findRelatedEvidence(params)) as {
		ranker: string;
		count: number;
		nextCursor: string | null;
		candidatePoolLimited: boolean;
		results: {
			id: string;
			kind: "event" | "page";
			timestamp: number;
			origin: string | null;
			excerpt: string;
			score: number;
			signals: string[];
			matchedSeedIds: string[];
		}[];
	};
	const input = params as { sources: { kind: "event" | "page"; id: string }[] };
	const db = await getDb();
	const seeds = await Promise.all(
		input.sources.map(async (source) =>
			source.kind === "event"
				? db.findEvent(source.id)
				: db.getPageObservation(source.id),
		),
	);
	if (seeds.some((seed) => !seed))
		throw new Error("one or more evidence references are no longer available.");
	const seedSteps = (seeds as RelatednessEvidence[]).map((source) => {
		const url = safeRecallUrl(source.url);
		const isPage = "kind" in source && source.kind === "page-observation";
		return {
			id: source.id,
			kind: isPage ? "page" : "event",
			timestamp: source.timestamp,
			origin: url?.origin ?? null,
			excerpt: isPage ? source.segments.join(" ").slice(0, 240) : "",
			role: "seed",
		};
	});
	return {
		ranker: related.ranker,
		count: related.count,
		nextCursor: related.nextCursor,
		candidatePoolLimited: related.candidatePoolLimited,
		trail: [
			...seedSteps,
			...related.results.map((result) => ({ ...result, role: "related" })),
		].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)),
	};
};

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
	[SEARCH_EVIDENCE_METHOD]: searchEvidence,
	[FIND_RELATED_EVIDENCE_METHOD]: findRelatedEvidence,
	[GET_EVIDENCE_TRAIL_METHOD]: getEvidenceTrail,
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
