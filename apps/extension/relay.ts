/// <reference types="chrome" />

import {
	type BrowserContext,
	createEventsDb,
	getContextById,
	getContexts,
	getMemoryById,
	isAiReadyContext,
	logger,
	type Memory,
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
	activityCount: c.totalEventCount,
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

const projectMemory = (m: Memory) => ({
	id: m.id,
	kind: m.kind,
	observation: m.observation,
	firstSeen: m.firstSeen,
	lastSeen: m.lastSeen,
	contextCount: m.contextCount,
	contextIds: m.contextIds,
	totalEventCount: m.totalEventCount,
	strength: Math.round(m.strength * 100) / 100,
	confidence: Math.round(m.confidence * 100) / 100,
	occurrenceCount: m.evidence.occurrenceCount,
	sharedDomains: m.evidence.sharedDomains,
	domains: [...new Set(m.occurrences.flatMap((o) => o.domains))],
});

const getMemory = async (params: unknown) => {
	const id =
		typeof (params as { id?: unknown } | null)?.id === "string"
			? ((params as { id: string }).id ?? "").trim()
			: "";
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

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
	[SEARCH_CONTEXT_METHOD]: searchContext,
	[GET_RECENT_CONTEXT_METHOD]: getRecentContext,
	[GET_CURRENT_CONTEXT_METHOD]: currentContext,
	[GET_CONTEXT_METHOD]: getContext,
	[GET_MEMORY_METHOD]: getMemory,
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
