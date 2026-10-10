/// <reference types="chrome" />

import {
	activityMetricsResponse,
	type BrowserContext,
	buildActivityMetrics,
	createEventsDb,
	getContextById,
	getContexts,
	getEventsBetween,
	getMemories,
	getMemoryById,
	isAiReadyContext,
	logger,
	type Memory,
	parseActivityMetricsInput,
	readyContextsInRange,
	sanitizeDerived,
	searchContextsCore,
	summarizeContextCore,
} from "@tabot/shared";

/**
 * Extension ↔ relay connection.
 *
 * Owns: installation identity, authenticated WebSocket, heartbeat, exponential
 * backoff reconnect, request/response correlation, and the local context query
 * handlers. Context results are sanitized here before responding.
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

/** Relay method names — must match mcp-server lib/tools.ts. */
const SEARCH_CONTEXT_METHOD = "search_context";
const GET_RECENT_CONTEXT_METHOD = "get_recent_context";
const GET_CURRENT_CONTEXT_METHOD = "get_current_context";
const GET_CONTEXT_METHOD = "get_context";
const GET_MEMORY_METHOD = "get_memory";
const LIST_RECURRING_PATTERNS_METHOD = "list_recurring_patterns";
const GET_ACTIVITY_METRICS_METHOD = "get_activity_metrics";
const SEARCH_RESULT_LIMIT = 8;
const RECENT_RESULT_LIMIT = 20;
const MAX_HOURS = 168; // 7 days — keep in step with mcp-server lib/tools.ts

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

/** Query saved OAuth grants, not the always-on relay WebSocket. Never register just to check. */
export const getAssistantConnection = async (): Promise<{
	connected: boolean;
}> => {
	const credentials = await loadCredentials();
	if (!credentials) return { connected: false };
	const response = await fetch(`${HTTP_BASE}/connection`, {
		headers: { Authorization: `Bearer ${credentials.token}` },
		signal: AbortSignal.timeout(5_000),
	});
	if (!response.ok)
		throw new Error(`connection status failed: ${response.status}`);
	const body: unknown = await response.json();
	if (
		!body ||
		typeof body !== "object" ||
		!("connected" in body) ||
		typeof body.connected !== "boolean"
	) {
		throw new Error("Invalid connection status response");
	}
	return { connected: body.connected };
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

// --- Local context execution -----------------------------------------------
// Runs inside the extension against the local Dexie store, then passes the
// result through the privacy boundary before it leaves the device.
let dbPromise: ReturnType<typeof createEventsDb> | null = null;
const getDb = () => (dbPromise ??= createEventsDb());

// The privacy boundary, applied once: derived contexts in → externally-safe
// copy out. Only concise fields are returned — no raw telemetry.
const sanitizeContexts = async (
	contexts: BrowserContext[],
): Promise<BrowserContext[]> =>
	(
		await sanitizeDerived({
			events: [],
			sessions: [],
			contexts,
			memories: [],
			live: null,
		})
	).contexts;

const projectContext = (c: BrowserContext) => ({
	id: c.id,
	title: c.primaryDomain || "browsing context",
	startTimestamp: c.startTimestamp,
	endTimestamp: c.endTimestamp,
	durationMinutes: Math.round(c.duration / 60_000),
	sessionCount: c.sessionCount,
	sites: c.domains.map((d) => d.domain),
	summary: summarizeContextCore(c).observation,
	aiReady: isAiReadyContext(c),
});

const searchContext = async (params: unknown) => {
	const query =
		typeof (params as { query?: unknown } | null)?.query === "string"
			? ((params as { query: string }).query ?? "").trim()
			: "";
	const rawHours = (params as { hours?: unknown } | null)?.hours;
	const since =
		typeof rawHours === "number" &&
		Number.isInteger(rawHours) &&
		rawHours >= 1 &&
		rawHours <= MAX_HOURS
			? Date.now() - rawHours * 3_600_000
			: undefined;
	const now = Date.now();
	// ponytail: full local derivation preserves episode-based IDs for get_context(id);
	// index stable contexts only if profiling shows relay timeout on large histories.
	const contexts = readyContextsInRange(
		await getContexts(await getDb()),
		since,
		now,
	);
	const matches = searchContextsCore(contexts, query, SEARCH_RESULT_LIMIT);
	const sanitized = await sanitizeContexts(matches.map((m) => m.context));
	return {
		query,
		count: sanitized.length,
		contexts: sanitized.map(projectContext),
	};
};

const getRecentContext = async (params: unknown) => {
	const raw = (params as { hours?: unknown } | null)?.hours;
	const hours =
		typeof raw === "number" && Number.isFinite(raw)
			? Math.min(Math.max(Math.trunc(raw), 1), MAX_HOURS)
			: 24;
	const now = Date.now();
	// Derive before filtering: slicing source events changes episode boundaries and ids.
	const contexts = await getContexts(await getDb());
	const selected = readyContextsInRange(
		contexts,
		now - hours * 3_600_000,
		now,
	).slice(-RECENT_RESULT_LIMIT);
	const sanitized = await sanitizeContexts(selected);
	return {
		hours,
		count: sanitized.length,
		contexts: sanitized.map(projectContext),
	};
};

const currentContext = async () => {
	const contexts = await getContexts(await getDb());
	const now = Date.now();
	const context = readyContextsInRange(contexts, now - 24 * 3_600_000, now).at(
		-1,
	);
	if (!context) return { found: false, context: null };
	const [sanitized] = await sanitizeContexts([context]);
	return { found: true, context: projectContext(sanitized) };
};

const getContext = async (params: unknown) => {
	const id = (params as { id?: unknown } | null)?.id;
	if (typeof id !== "string" || !id.trim() || id.length > 256)
		return { found: false, context: null };
	const context = await getContextById(await getDb(), id);
	if (!context) return { found: false, context: null };
	const [sanitized] = await sanitizeContexts([context]);
	return { found: true, context: projectContext(sanitized) };
};

// Origin-only evidence: no page paths, credentials, internal URLs or arbitrary fields.
const originEvidence = (values: string[], limit: number) => {
	const mapped = values.map((value) => {
		try {
			const url = new URL(value);
			return (url.protocol === "http:" || url.protocol === "https:") &&
				url.origin.length <= 256
				? url.origin
				: null;
		} catch {
			return null;
		}
	});
	const origins = mapped.filter(
		(origin, index): origin is string =>
			origin !== null && origin !== mapped[index - 1],
	);
	return {
		origins: origins.slice(0, limit),
		truncated: origins.length > limit || mapped.includes(null),
	};
};

const projectMemory = (m: Memory) => {
	const contextIds = m.contextIds.filter((id) => id.length <= 256).slice(-100);
	const domains = originEvidence(
		[...new Set(m.occurrences.flatMap((o) => o.domains))],
		20,
	);
	const orderedOrigins = originEvidence(m.fingerprint.orderedOrigins, 50);
	const memory = {
		id: m.id,
		kind: m.kind,
		observation: m.observation.slice(0, 2_000),
		firstSeen: m.firstSeen,
		lastSeen: m.lastSeen,
		contextCount: m.contextCount,
		contextIds,
		strength: Math.round(m.strength * 100) / 100,
		confidence: Math.round(m.confidence * 100) / 100,
		occurrenceCount: m.evidence.occurrenceCount,
		sharedDomains: m.evidence.sharedDomains,
		domains: domains.origins,
		orderedOrigins: orderedOrigins.origins,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		evidenceNotes:
			"Fingerprint and occurrence sequences show derived first-occurrence ordering, not a complete navigation trace or proof of an exact repeated workflow. Occurrence bounds span observed periods, not continuous attention. Confidence is heuristic similarity, not probability of intent. Only recent bounded evidence is returned; origins remain visible.",
		occurrences: m.occurrences
			.toSorted((a, b) => a.startTimestamp - b.startTimestamp)
			.slice(-20)
			.map((o) => {
				const sites = originEvidence([...new Set(o.domains)], 20);
				const sequence = originEvidence(o.sequence, 50);
				// The stored occurrence contextId encodes a range, not a get_context lookup id.
				const [firstId, lastId = firstId] = o.contextId.split("..");
				const first = m.contextIds.indexOf(firstId);
				const last = m.contextIds.indexOf(lastId);
				const supporting =
					first >= 0 && last >= first
						? m.contextIds.slice(first, last + 1)
						: [];
				const occurrenceContextIds = supporting
					.filter((id) => id.length <= 256)
					.slice(-20);
				return {
					contextIds: occurrenceContextIds,
					startTimestamp: o.startTimestamp,
					endTimestamp: o.endTimestamp,
					domains: sites.origins,
					sequence: sequence.origins,
					truncated: {
						domains: sites.truncated,
						sequence: sequence.truncated,
						contextIds:
							first < 0 ||
							last < first ||
							supporting.length > occurrenceContextIds.length,
					},
				};
			}),
		truncated: {
			observation: m.observation.length > 2_000,
			contextIds: m.contextIds.length > contextIds.length,
			domains: domains.truncated,
			orderedOrigins: orderedOrigins.truncated,
			occurrences: m.occurrences.length > 20,
			responseBudget: false,
		},
	};
	// ponytail: reserialize capped evidence; use streaming if these limits grow.
	while (JSON.stringify(memory).length > 60_000) {
		memory.truncated.responseBudget = true;
		if (memory.occurrences.length) {
			memory.occurrences.shift(); // Keep newest supporting periods.
			memory.truncated.occurrences = true;
		} else if (memory.contextIds.length) {
			memory.contextIds.shift();
			memory.truncated.contextIds = true;
		} else {
			throw new Error("Pattern evidence exceeds response budget.");
		}
	}
	return memory;
};

const listRecurringPatterns = async (params: unknown) => {
	if (!params || typeof params !== "object" || Array.isArray(params))
		throw new Error("Expected pattern query object.");
	const value = (params as { limit?: unknown }).limit;
	const limit = value === undefined ? 10 : value;
	if (
		typeof limit !== "number" ||
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > 20
	) {
		throw new Error("limit must be an integer from 1 to 20.");
	}
	// getMemories derives from at most 500 contexts; read all candidates before recurrent filtering.
	const candidates = (await getMemories(await getDb(), 500))
		.filter((m) => m.kind === "recurrent")
		.toSorted((a, b) => b.lastSeen - a.lastSeen || b.strength - a.strength);
	const sanitized = (
		await sanitizeDerived({
			events: [],
			sessions: [],
			contexts: [],
			memories: candidates.slice(0, limit),
			live: null,
		})
	).memories;
	const response = {
		scope: { contextLimit: 500, exhaustiveHistory: false },
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		availablePatterns: candidates.length,
		patterns: sanitized.map((m) => {
			const p = projectMemory(m);
			return {
				id: p.id,
				observation: p.observation,
				firstSeen: p.firstSeen,
				lastSeen: p.lastSeen,
				occurrenceCount: p.occurrenceCount,
				contextCount: p.contextCount,
				confidence: p.confidence,
				domains: p.domains,
				orderedOrigins: p.orderedOrigins,
				truncated: {
					observation: p.truncated.observation,
					domains: p.truncated.domains,
					orderedOrigins: p.truncated.orderedOrigins,
				},
			};
		}),
		truncated: candidates.length > limit,
		evidenceNotes:
			"Discovery covers the latest 500 local contexts, not exhaustive history. Fingerprint ordering is representative; confidence is heuristic similarity, not probability of intent. Call get_memory for supporting occurrence evidence. Empty results are not proof of no routines.",
	};
	while (JSON.stringify(response).length > 60_000) response.patterns.pop();
	response.truncated = candidates.length > response.patterns.length;
	return response;
};

const getMemory = async (params: unknown) => {
	const id =
		typeof (params as { id?: unknown } | null)?.id === "string"
			? ((params as { id: string }).id ?? "").trim()
			: "";
	if (!id || id.length > 256)
		throw new Error("id must contain 1 to 256 characters.");
	const memory = await getMemoryById(await getDb(), id);
	if (!memory) return { id, found: false, memory: null };
	const sanitized = (
		await sanitizeDerived({
			events: [],
			sessions: [],
			contexts: [],
			memories: [memory],
			live: null,
		})
	).memories[0];
	return { id, found: true, memory: projectMemory(sanitized) };
};

const getActivityMetrics = async (params: unknown) => {
	const { from, to, origin } = parseActivityMetricsInput(params);
	const events = await getEventsBetween(await getDb(), from, to);
	// Do not filter by site before calculating time: other sites bound its visits.
	return activityMetricsResponse(
		buildActivityMetrics(events, from, to),
		origin,
	);
};

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
	[SEARCH_CONTEXT_METHOD]: searchContext,
	[GET_RECENT_CONTEXT_METHOD]: getRecentContext,
	[GET_CURRENT_CONTEXT_METHOD]: currentContext,
	[GET_CONTEXT_METHOD]: getContext,
	[GET_MEMORY_METHOD]: getMemory,
	[LIST_RECURRING_PATTERNS_METHOD]: listRecurringPatterns,
	[GET_ACTIVITY_METRICS_METHOD]: getActivityMetrics,
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
