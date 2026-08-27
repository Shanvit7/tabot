import {
	type BrowserContext,
	buildContexts,
	buildLiveContext,
	buildMemories,
	deriveMeaningfulEvents,
	deriveTransitions,
	findSimilarContextsCore,
	findSimilarMemoriesCore,
	type LiveBrowserContext,
	type Memory,
	type Session,
	type StatsSnapshot,
	type StoredTabEvent,
	sessionize,
} from "@tabot/shared";

// --- Message transport (extension ↔ web; same extId pattern as metrics used) ---

type ChromeSend = (...args: unknown[]) => unknown;
const chromeSend = (): ChromeSend | null => {
	const g = globalThis as unknown as {
		chrome?: { runtime?: { sendMessage?: ChromeSend } };
	};
	return g.chrome?.runtime?.sendMessage ?? null;
};

const getExtId = (): string | undefined => {
	try {
		return localStorage.getItem("tabot_extension_id") || undefined;
	} catch {
		return undefined;
	}
};

const send = (
	msg: Record<string, unknown>,
	cb: (res: unknown) => void,
): void => {
	const s = chromeSend();
	if (!s) return;
	let done = false;
	const finish = (res: unknown) => {
		if (done) return;
		done = true;
		cb(res);
	};
	const extId = getExtId();
	if (extId)
		(s as (a: string, b: unknown, c: (r: unknown) => void) => void)(
			extId,
			msg,
			finish,
		);
	else (s as (a: unknown, b: (r: unknown) => void) => void)(msg, finish);
	// timeout fallback: if the extension never responds, resolve with null once
	setTimeout(() => finish(null), 800);
};

export const fetchStats = (): Promise<StatsSnapshot | null> =>
	new Promise((resolve) => {
		send({ type: "GET_STATS" }, (res) =>
			resolve((res as StatsSnapshot) || null),
		);
	});

export const fetchCounts = (): Promise<number | null> =>
	new Promise((resolve) => {
		send({ type: "GET_COUNTS" }, (res) => {
			const v = res as { dexieCount?: number; rxdbCount?: number } | undefined;
			const n = v?.dexieCount ?? v?.rxdbCount;
			resolve(typeof n === "number" ? n : null);
		});
	});

export const fetchEvents = (): Promise<StoredTabEvent[] | null> =>
	new Promise((resolve) => {
		send({ type: "GET_EVENTS" }, (res) => {
			resolve((res as StoredTabEvent[]) || null);
		});
	});

// --- Derivation (in-memory, from fetched raw events; pure @tabot/shared fns) ---

export interface Derived {
	events: StoredTabEvent[];
	sessions: Session[];
	contexts: BrowserContext[];
	memories: Memory[];
	live: LiveBrowserContext | null;
}

export const derive = (events: StoredTabEvent[]): Derived => {
	const sessions = sessionize(events);
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	const contexts = buildContexts(sessions, transitions);
	const memories = buildMemories(contexts);

	// Live context: current context = most recent, similar = pure cores (no db)
	const currentContext = contexts[contexts.length - 1];
	const relatedContexts = currentContext
		? findSimilarContextsCore(currentContext, contexts, 3)
		: [];
	const relatedMemories = currentContext
		? findSimilarMemoriesCore(currentContext, memories, 3)
		: [];
	const live = buildLiveContext({
		currentContext,
		events,
		relatedContexts,
		relatedMemories,
	});

	return { events, sessions, contexts, memories, live };
};

// --- Export (Part C of docs/export-spec.md) ---

const fmtIso = (ts: number): string => new Date(ts).toISOString();

export const EXPORT_THRESHOLDS = {
	session: {
		inactivityThresholdMs: 300000,
		visibilityGapThresholdMs: 120000,
		tabAbsenceThresholdMs: 600000,
		windowCloseThresholdMs: 30000,
	},
	context: {
		gapThresholdMs: 1800000,
		excursionReturnWindowMs: 300000, // T3 short-gap window + excursion bound
		excursionActivityMin: 2,
		consecutiveTransitionCount: 2,
		relationshipEvidenceCutoffMs: 900000,
		maxContextSpanMs: 5400000,
		episodeGapMs: 1800000, // V6: max gap between anchors within one episode
		strongWeight: 0.5, // V6: min edge weight for episode continuity
	},
	memory: {
		minContexts: 2,
		singleContextMinEvents: 500,
		maxSignatureDomains: 6,
		staleMs: 604800000,
		maxMemories: 50,
	},
} as const;

export const buildExportJsonl = (d: Derived): string => {
	const eventLines = d.events.map((e) =>
		JSON.stringify({
			record: "event",
			...e, // canonical StoredTabEvent (its own `type` is the event type)
		}),
	);
	const sessionLines = d.sessions.map((s) =>
		JSON.stringify({
			record: "session",
			...s,
		}),
	);
	const contextLines = d.contexts.map((c) =>
		JSON.stringify({
			record: "context",
			...c,
		}),
	);
	const memoryLines = d.memories.map((m) =>
		JSON.stringify({
			record: "memory",
			...m, // canonical Memory (its own `kind` is single|recurrent)
		}),
	);

	const manifest = {
		manifest: {
			format: "tabot-export",
			version: 1,
			exportedAt: new Date().toISOString(),
			source: "tabot-web@0.0.1",
			telemetrySchemaVersion: 1,
			derivationSchemaVersion: 6,
			graph: {
				enabled: true,
				nodeGranularity: "activity-anchor",
				relationshipCutoffMs: 900000,
				algorithm: "temporal-weighted-local-graph",
			},
			thresholds: EXPORT_THRESHOLDS,
			counts: {
				events: d.events.length,
				sessions: d.sessions.length,
				contexts: d.contexts.length,
				memories: d.memories.length,
			},
			coverage: {
				firstEventAt:
					d.events.length > 0 ? fmtIso(d.events[0].timestamp) : undefined,
				lastEventAt:
					d.events.length > 0
						? fmtIso(d.events[d.events.length - 1].timestamp)
						: undefined,
			},
		},
	};

	return [
		JSON.stringify(manifest),
		...eventLines,
		...sessionLines,
		...contextLines,
		...memoryLines,
	].join("\n");
};

export const buildExportCsv = (d: Derived): string => {
	if (d.sessions.length === 0) return "";
	const header =
		"sessionId,start,end,durationMs,eventCount,interactionCount,navigationCount,tabSwitchCount,domains";
	const rows = d.sessions.map((s) =>
		[
			s.id,
			fmtIso(s.startTimestamp),
			fmtIso(s.endTimestamp),
			s.duration,
			s.eventCount,
			s.interactionCount,
			s.navigationCount,
			s.tabSwitchCount,
			s.domains.map((x) => x.domain).join("|"),
		].join(","),
	);
	return [header, ...rows].join("\n");
};

export const downloadFile = (
	filename: string,
	content: string,
	mime: string,
): void => {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// --- Shared formatters ---

export const formatAgo = (ts: number): string => {
	if (!ts) return "never";
	const d = Math.round((Date.now() - ts) / 1000);
	if (d < 2) return "just now";
	if (d < 60) return `${d}s ago`;
	return `${Math.round(d / 60)}m ago`;
};

export const formatDuration = (ms: number): string => {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
};
