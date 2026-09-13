import {
	buildExportJsonl,
	type Derived,
	derive,
	filterDerived,
	fmtIso,
	type StatsSnapshot,
	type StoredTabEvent,
} from "@tabot/shared";

// --- Message transport (extension ↔ web; same extId pattern as metrics used) ---

type ChromeSend = (...args: unknown[]) => unknown;
const chromeSend = (): ChromeSend | null => {
	const g = globalThis as unknown as {
		chrome?: { runtime?: { sendMessage?: ChromeSend } };
	};
	return g.chrome?.runtime?.sendMessage ?? null;
};

const configuredExtensionId = import.meta.env.VITE_TABOT_EXTENSION_ID?.trim();

const getExtId = (): string | undefined => configuredExtensionId || undefined;

const send = (
	msg: Record<string, unknown>,
	cb: (res: unknown) => void,
): void => {
	const s = chromeSend();
	let done = false;
	const finish = (res: unknown) => {
		if (done) return;
		done = true;
		cb(res);
	};
	// No chrome runtime (plain web page, extension absent) — resolve null once
	// so callers never hang on an unresolved promise.
	if (!s) {
		finish(null);
		return;
	}
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

export type StatsRange = "today" | "7d" | "30d" | "all";

export const rangeStart = (r: StatsRange): number => {
	if (r === "all") return 0;
	const d = new Date();
	if (r === "today") d.setHours(0, 0, 0, 0);
	else d.setDate(d.getDate() - (r === "7d" ? 7 : 30));
	return d.getTime();
};

export const fetchEvents = (): Promise<StoredTabEvent[] | null> =>
	new Promise((resolve) => {
		send({ type: "GET_EVENTS" }, (res) => {
			resolve((res as StoredTabEvent[]) || null);
		});
	});

// --- Export (Part C of docs/export-spec.md) ---
// Derivation + JSONL building live in @tabot/shared (shared with the extension
// popup "Share Context"); this module re-exports them for the dashboard route.

export { buildExportJsonl, type Derived, derive, filterDerived };

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

// `msAgo` is a duration in ms since the event happened (not a timestamp).
export const formatAgo = (msAgo: number): string => {
	if (!msAgo) return "never";
	const d = Math.round(msAgo / 1000);
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
