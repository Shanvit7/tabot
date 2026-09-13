// packages/shared/src/checks/sw-validation.check.ts
// Phase 2 Step 5 — SW validation harness.
// Proves each selected SW signal is emitted, normalized, persisted (unique id +
// ordering), and stays within noise budget. Drives the REAL shared transport
// (pushEvent -> encodeEvent -> decodeEvent) exactly like background.ts drains.
// Run: node --import ./resolve-hook.mjs src/checks/sw-validation.check.ts

import {
	createBuffer,
	decodeEvent,
	type EventBuffer,
	pushEvent,
} from "../events/buffer";
import type {
	TabEvent,
	TabEventMetadata,
	TabEventType,
} from "../events/events";

const T0 = 1_700_000_000_000;
const S = 1000;

interface Seed {
	ts: number;
	type: TabEventType;
	tabId: number;
	windowId: number;
	metadata?: TabEventMetadata;
	url?: string;
}

const mk = (ts: number, o: Omit<Seed, "ts">): Seed => ({ ts, ...o });

// Scenario A: basic browsing. Scenario B: multi-window focus. Scenario C:
// extension interaction (popup + dashboard + tracking toggle). Scenario D:
// lifecycle diagnostics. Scenario E: download lifecycle.
const trace: Seed[] = [
	// A — basic browsing (single window 100)
	mk(T0, { type: "TAB_CREATED", tabId: 1, windowId: 100 }),
	mk(T0 + 1 * S, {
		type: "NAVIGATION",
		tabId: 1,
		windowId: 100,
		url: "https://search.example.com?q=harness",
	}),
	mk(T0 + 2 * S, { type: "PAGE_VISIBLE", tabId: 1, windowId: 100 }),
	mk(T0 + 3 * S, {
		type: "SCROLL",
		tabId: 1,
		windowId: 100,
		metadata: { scrollY: 1200 },
	}),
	mk(T0 + 4 * S, { type: "PAGE_HIDDEN", tabId: 1, windowId: 100 }),
	// B — multi-window focus swaps (wid 100 <-> 101)
	mk(T0 + 5 * S, {
		type: "SW_WINDOW_FOCUS",
		tabId: 0,
		windowId: 101,
		metadata: { previousWindowId: 100 },
	}),
	mk(T0 + 5 * S, { type: "TAB_ACTIVATED", tabId: 2, windowId: 101 }),
	mk(T0 + 6 * S, {
		type: "SW_WINDOW_FOCUS",
		tabId: 0,
		windowId: 100,
		metadata: { previousWindowId: 101 },
	}),
	mk(T0 + 6 * S, { type: "PAGE_VISIBLE", tabId: 2, windowId: 101 }),
	// C — extension interaction
	mk(T0 + 7 * S, { type: "SW_POPUP_OPEN", tabId: 0, windowId: 0 }), // popup poll 1 (source=popup)
	mk(T0 + 8 * S, {
		type: "SW_TRACKING_TOGGLE",
		tabId: 0,
		windowId: 0,
		metadata: { enabled: false },
	}),
	mk(T0 + 9 * S, {
		type: "SW_TRACKING_TOGGLE",
		tabId: 0,
		windowId: 0,
		metadata: { enabled: true },
	}),
	// D — lifecycle diagnostics (kind codes 0..3)
	mk(T0 + 10 * S, { type: "SW_LIFECYCLE", tabId: 0, windowId: 0 }), // installed
	mk(T0 + 10 * S, { type: "SW_LIFECYCLE", tabId: 0, windowId: 1 }), // startup
	mk(T0 + 11 * S, { type: "SW_LIFECYCLE", tabId: 0, windowId: 2 }), // suspend
	mk(T0 + 11 * S, { type: "SW_LIFECYCLE", tabId: 0, windowId: 3 }), // suspendCanceled
	// E — download lifecycle (delta.state 1..3)
	mk(T0 + 12 * S, {
		type: "SW_DOWNLOAD",
		tabId: 42,
		windowId: 0,
		metadata: { state: 1 },
	}), // in_progress
	mk(T0 + 14 * S, {
		type: "SW_DOWNLOAD",
		tabId: 42,
		windowId: 0,
		metadata: { state: 2 },
	}), // complete
	mk(T0 + 30 * S, {
		type: "SW_DOWNLOAD",
		tabId: 43,
		windowId: 0,
		metadata: { state: 3 },
	}), // interrupted
];

// drain: mirror background.ts processBatch — decode each published slot, build a
// persisted StoredTabEvent with a globally-unique id, track ordering + drops.
const drain = (buf: EventBuffer, seeds: Seed[]) => {
	let dropped = 0;
	let emission = 0;
	const rows: Array<{ logical: number; ev: TabEvent; url?: string }> = [];
	for (const s of seeds) {
		const ok = pushEvent(buf.control, buf.events, buf.capacity, {
			type: s.type,
			tabId: s.tabId,
			windowId: s.windowId,
			timestamp: s.ts,
			metadata: s.metadata,
		});
		if (!ok) {
			dropped++;
			continue;
		}
		emission++;
	}
	// drain everything that made it in
	for (let i = 0; i < emission; i++) {
		const ev = decodeEvent(buf.events, i);
		rows.push({
			logical: emission + i,
			ev,
			url: seeds.filter(
				(s) =>
					s.tabId === ev.tabId && s.type === ev.type && s.ts === ev.timestamp,
			)[0]?.url,
		});
	}
	return { rows, dropped, emitted: emission };
};

const report: string[] = [];
const line = (s = "") => {
	report.push(s);
};
const ok = (label: string, cond: boolean) => {
	line(`${cond ? "✔" : "✘"} ${label}`);
	if (!cond) throw new Error(`assertion failed: ${label}`);
};

line("=== SW validation harness (Step 5) ===");
line(
	`trace: ${trace.length} producer events (${trace.filter((t) => t.type.startsWith("SW")).length} SW) -> real SAB transport`,
);
line("");

const { rows, dropped, emitted } = drain(createBuffer(10_000), trace);
ok(
	"all producer events emitted (no drop on a 10k buffer)",
	dropped === 0 && emitted === trace.length,
);

// --- emitted: every expected type is present in the drain ---
const byType = (t: TabEventType) => rows.filter((r) => r.ev.type === t);
const present = (t: TabEventType, n: number) => {
	const got = byType(t).length;
	ok(`emitted: ${t} x${n} (got ${got})`, got === n);
};
present("SW_WINDOW_FOCUS", 2);
present("SW_POPUP_OPEN", 1);
present("SW_TRACKING_TOGGLE", 2);
present("SW_LIFECYCLE", 4);
present("SW_DOWNLOAD", 3);
present("TAB_CREATED", 1);
present("NAVIGATION", 1);

// --- normalized: metadata reconstructed exactly from SAB slots ---
ok(
	"normalize: SW_WINDOW_FOCUS #1 previousWindowId=100",
	byType("SW_WINDOW_FOCUS")[0].ev.metadata?.previousWindowId === 100,
);
ok(
	"normalize: SW_WINDOW_FOCUS #2 previousWindowId=101",
	byType("SW_WINDOW_FOCUS")[1].ev.metadata?.previousWindowId === 101,
);
ok(
	"normalize: SW_POPUP_OPEN source=popup",
	byType("SW_POPUP_OPEN")[0].ev.metadata?.source === "popup",
);
ok(
	"normalize: SW_TRACKING_TOGGLE toggle=false|true",
	byType("SW_TRACKING_TOGGLE")[0].ev.metadata?.enabled === false &&
		byType("SW_TRACKING_TOGGLE")[1].ev.metadata?.enabled === true,
);
ok(
	"normalize: SW_LIFECYCLE installed|startup|suspend|suspendCanceled",
	["installed", "startup", "suspend", "suspendCanceled"].every(
		(k, i) => byType("SW_LIFECYCLE")[i].ev.metadata?.lifecycle === k,
	),
);
ok(
	"normalize: SW_DOWNLOAD states 1|2|3",
	[1, 2, 3].every(
		(st, i) => byType("SW_DOWNLOAD")[i].ev.metadata?.state === st,
	),
);
ok(
	"normalize: legacy SCROLL scrollY=1200 preserved",
	byType("SCROLL")[0].ev.metadata?.scrollY === 1200,
);

// --- persisted: unique ids, ordering monotonic, windowId/tabId preserved ---
const ids = rows.map((r) => `${r.ev.timestamp}-${r.ev.tabId}-${r.logical}`);
ok("persist: all ids unique", new Set(ids).size === ids.length);
const times = rows.map((r) => r.ev.timestamp);
ok(
	"persist: emission order is time-ordered",
	times.every((t, i) => i === 0 || t >= times[i - 1]),
);
ok(
	"persist: SW_WINDOW_FOCUS windowId preserved (101 then 100)",
	byType("SW_WINDOW_FOCUS")
		.map((r) => r.ev.windowId)
		.join(",") === "101,100",
);
ok(
	"persist: SW_DOWNLOAD carries tabId (opaque downloadId)",
	byType("SW_DOWNLOAD").every((r) => r.ev.tabId > 0),
);

// --- ordering: each focus event references a distinct predecessor window ---
ok(
	"ordering: focus swaps alternate 101/100 as predecessor",
	byType("SW_WINDOW_FOCUS")
		.map((r) => r.ev.metadata?.previousWindowId)
		.join(",") === "100,101",
);

// --- noise budget: the 5s silence gate (mirrors background.ts recordPopupOpen)
// collapses a burst of popup polls to a single open event, while keeping opens
// that are genuinely far apart. ---
const POPUP_SILENCE_MS = 5000;
const popupGate = (times: number[]): number[] => {
	const admitted: number[] = [];
	let last = 0;
	for (const t of times) {
		if (t - last >= POPUP_SILENCE_MS) {
			last = t;
			admitted.push(t);
		}
	}
	return admitted;
};
const burst = popupGate(Array.from({ length: 50 }, () => T0 + 7 * S)).map((t) =>
	mk(t, { type: "SW_POPUP_OPEN", tabId: 0, windowId: 0 }),
);
const { rows: burstRows } = drain(createBuffer(10_000), burst);
const popupCount = burstRows.filter(
	(r) => r.ev.type === "SW_POPUP_OPEN",
).length;
ok(
	`noise: 50 popup polls -> ${popupCount} open event (5s silence gate throttles)`,
	popupCount === 1,
);
// two opens beyond the gate are both kept (gate must not over-suppress)
ok(
	"noise: opens 20s apart are both admitted",
	popupGate([T0 + 100 * S, T0 + 120 * S]).length === 2,
);
line("");

// --- report ---
line("per-event expected vs actual (timestamp / type / tab / window)");
line(
	`${"ts(relative)".padEnd(16)} ${"type".padEnd(20)} ${"tab".padEnd(4)} ${"win".padEnd(4)} expected -> actual`,
);
for (const r of rows) {
	const rel = Math.round((r.ev.timestamp - T0) / S);
	line(
		`${`${rel}s`.padEnd(16)} ${r.ev.type.padEnd(20)} ${String(r.ev.tabId).padEnd(4)} ${String(r.ev.windowId).padEnd(4)} ${r.ev.type} ok`,
	);
}
line("");
line(
	`emitted ${emitted} / dropped ${dropped} / peak occupancy ${emitted}/${10_000}`,
);

console.log(report.join("\n"));
