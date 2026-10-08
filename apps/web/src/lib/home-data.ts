import {
	buildExportJsonl,
	derive,
	exportFilename,
	filterDerived,
	type StatsSnapshot,
	type StoredTabEvent,
	sanitizeDerived,
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
	timeoutMs = 800,
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
	try {
		if (extId)
			(s as (a: string, b: unknown, c: (r: unknown) => void) => void)(
				extId,
				msg,
				finish,
			);
		else (s as (a: unknown, b: (r: unknown) => void) => void)(msg, finish);
	} catch {
		finish(null);
	}
	// timeout fallback: if the extension never responds, resolve with null once
	setTimeout(() => finish(null), timeoutMs);
};

export const fetchStats = (): Promise<StatsSnapshot | null> =>
	new Promise((resolve) => {
		send({ type: "GET_STATS" }, (res) =>
			resolve((res as StatsSnapshot) || null),
		);
	});

export const fetchAssistantConnection = (): Promise<boolean | null> =>
	new Promise((resolve) => {
		send(
			{ type: "GET_ASSISTANT_CONNECTION" },
			(res) => {
				resolve(
					res &&
						typeof res === "object" &&
						"connected" in res &&
						typeof res.connected === "boolean"
						? res.connected
						: null,
				);
			},
			6_000,
		);
	});

export type StatsRange = "5m" | "1h" | "6h" | "today" | "7d" | "30d" | "all";

const ROLLING_HOURS: Partial<Record<StatsRange, number>> = {
	"5m": 5 / 60,
	"1h": 1,
	"6h": 6,
};

export const rangeStart = (r: StatsRange): number => {
	if (r === "all") return 0;
	const d = new Date();
	const hours = ROLLING_HOURS[r];
	if (hours) return Date.now() - hours * 60 * 60 * 1000;
	if (r === "today") d.setHours(0, 0, 0, 0);
	else d.setDate(d.getDate() - (r === "7d" ? 7 : 30));
	return d.getTime();
};

export const fetchEvents = (): Promise<StoredTabEvent[] | null> =>
	new Promise((resolve) => {
		send({ type: "GET_EVENTS" }, (res) => {
			resolve(Array.isArray(res) ? res : null);
		});
	});

// --- Export (Part C of docs/export-spec.md) ---
// Derivation + JSONL building live in @tabot/shared (shared with the extension
// popup "Share Context"); this module re-exports them for the Home route.

export {
	buildExportJsonl,
	derive,
	exportFilename,
	filterDerived,
	sanitizeDerived,
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

export const formatDuration = (ms: number): string => {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
};
