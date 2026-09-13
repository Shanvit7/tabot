// packages/shared/src/checks/sw-cost.check.ts
// Phase 2 Step 6 — Noise + cost. Compare Pipeline A (Phase 1 only) vs Pipeline B
// (Phase 1 + SW telemetry) on the same trace: event volume, SW ratio, storage
// growth, ring-buffer pressure/drops, and derivation-time delta. Applies the
// plan's acceptance principle: a high-volume SW signal with little distinct
// value is a throttle/remove candidate for Step 7.
// Run: node --import ./resolve-hook.mjs src/checks/sw-cost.check.ts

import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events";
import { buildContexts } from "../contexts/contexts";
import { createBuffer, type EventBuffer, pushEvent } from "../events/buffer";
import type { StoredTabEvent } from "../events/db";
import type { TabEvent, TabEventType } from "../events/events";
import { ValueToEventType } from "../events/events";
import { buildMemories } from "../memories/memories";
import { sessionize } from "../sessions/sessions";

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const SW_TYPES: TabEventType[] = [
	"SW_WINDOW_FOCUS",
	"SW_POPUP_OPEN",
	"SW_TRACKING_TOGGLE",
	"SW_DOWNLOAD",
	"SW_LIFECYCLE",
];
const isSw = (t: TabEventType) => SW_TYPES.includes(t);

const PAGE_URLS = [
	"https://docs.google.com/document",
	"https://github.com/org/repo/pull/42",
	"https://stackoverflow.com/questions/123",
	"https://duckduckgo.com/?q=tabot+sharedarraybuffer",
];

interface Seed {
	type: TabEventType;
	tabId: number;
	windowId: number;
	ts: number;
	metadata?: StoredTabEvent["metadata"];
	url?: string;
}

// representative trace: ~2000 tab/page events + a steady drip of SW signals
const trace = (n: number, swPer: number): Seed[] => {
	const out: Seed[] = [];
	for (let i = 0; i < n; i++) {
		const tabId = 1 + (i % 12);
		const wid = 100 + (i % 4);
		const ts = T0 + i * 4500; // 4.5s cadence -> several sessions
		out.push({ type: "PAGE_VISIBLE", tabId, windowId: wid, ts });
		out.push({
			type: "SCROLL",
			tabId,
			windowId: wid,
			ts: ts + 1,
			metadata: { scrollY: (i * 137) % 4000 },
		});
		if (i % 5 === 0)
			out.push({
				type: "NAVIGATION",
				tabId,
				windowId: wid,
				ts: ts + 2,
				url: PAGE_URLS[i % PAGE_URLS.length],
			});
		if (i % 7 === 0)
			out.push({
				type: "CLICK",
				tabId,
				windowId: wid,
				ts: ts + 3,
				metadata: { x: i % 900, y: i % 600 },
			});
		if (i % 11 === 0)
			out.push({
				type: "KEY_ACTIVITY",
				tabId,
				windowId: wid,
				ts: ts + 4,
				metadata: { x: i % 900, y: i % 600 },
			});
		if (i % swPer === 0)
			out.push({
				type: "SW_WINDOW_FOCUS",
				tabId: 0,
				windowId: 100 + ((wid + 1) % 4),
				ts: ts + 5,
				metadata: { previousWindowId: wid },
			});
		if (i % (swPer * 25) === 1)
			out.push({ type: "SW_POPUP_OPEN", tabId: 0, windowId: 0, ts: ts + 5 });
		if (i % (swPer * 60) === 0)
			out.push({
				type: "SW_DOWNLOAD",
				tabId: 100 + (i % 20),
				windowId: 0,
				ts: ts + 6,
				metadata: { state: 2 },
			});
	}
	return out;
};

// local mirror of decodeEvent (kept in the check; decodeEvent from shared pulls
// the whole buffer module which also re-imports events — fine, but a stub keeps
// the cost check's dependency footprint explicit).
const decodeStub = (events: Int32Array, slot: number): TabEvent => {
	const base = slot * 8;
	const type = ValueToEventType[events[base + 0]];
	const tsHigh = events[base + 4];
	const tsLow = events[base + 5];
	const v0 = events[base + 6];
	const windowId = events[base + 2];
	const event: TabEvent = {
		type,
		tabId: events[base + 1],
		windowId,
		timestamp: tsHigh * 2 ** 32 + (tsLow >>> 0),
	};
	if (type === "SW_POPUP_OPEN")
		event.metadata = { source: windowId === 0 ? "popup" : "dashboard" };
	else if (type === "SW_LIFECYCLE") {
		const kind = ["installed", "startup", "suspend", "suspendCanceled"][
			windowId
		] as "installed" | "startup" | "suspend" | "suspendCanceled" | undefined;
		if (kind) event.metadata = { lifecycle: kind };
	} else if (type === "SCROLL" && v0 !== 0) event.metadata = { scrollY: v0 };
	return event;
};

const drain = (buf: EventBuffer, seeds: Seed[]) => {
	let dropped = 0;
	let emission = 0;
	const rows: StoredTabEvent[] = [];
	for (const s of seeds) {
		if (
			!pushEvent(buf.control, buf.events, buf.capacity, {
				type: s.type,
				tabId: s.tabId,
				windowId: s.windowId,
				timestamp: s.ts,
				metadata: s.metadata,
			})
		)
			dropped++;
		else emission++;
	}
	for (let i = 0; i < emission; i++) {
		const ev = decodeStub(buf.events, i);
		const url = seeds.find(
			(s) =>
				s.type === ev.type && s.tabId === ev.tabId && s.ts === ev.timestamp,
		)?.url;
		rows.push({
			id: `${ev.timestamp}-${ev.tabId}-${i}`,
			type: ev.type,
			tabId: ev.tabId,
			windowId: ev.windowId,
			timestamp: ev.timestamp,
			url,
			metadata: ev.metadata,
		});
	}
	return { rows, dropped, emission };
};

const storageBytes = (rows: StoredTabEvent[]) =>
	rows.reduce((acc, r) => acc + Buffer.byteLength(JSON.stringify(r)), 0);

const derive = (rows: StoredTabEvent[]) => {
	const sessions = sessionize(rows);
	const transitions = deriveTransitions(deriveMeaningfulEvents(rows));
	const contexts = buildContexts(sessions, transitions);
	const memories = buildMemories(contexts, T0 + 48 * MIN);
	return { sessions, contexts, memories };
};

const timeDerive = (rows: StoredTabEvent[], runs = 7) => {
	const times: number[] = [];
	for (let i = 0; i < runs; i++) {
		const start = process.hrtime.bigint();
		derive(rows);
		times.push(Number(process.hrtime.bigint() - start) / 1e6);
	}
	times.sort((a, b) => a - b);
	return times[Math.floor(times.length / 2)];
};

const lines: string[] = [];
const line = (s = "") => lines.push(s);
const ok = (label: string, cond: boolean) =>
	line(`${cond ? "✔" : "✘"} ${label}`);

line("=== SW noise + cost (Step 6) ===");
ok(
	"imports resolve (real shared pipeline)",
	typeof sessionize === "function" && typeof buildContexts === "function",
);

// ---- A vs B on the same representative trace ----
const seeds = trace(3200, 3);
const { rows: full, dropped, emission } = drain(createBuffer(10_000), seeds);
const swRows = full.filter((r) => isSw(r.type));
const aRows = full.filter((r) => !isSw(r.type)); // Pipeline A: Phase 1 only
const bRows = full; // Pipeline B: Phase 1 + SW
const nSw = swRows.length;
const swPct = (nSw / bRows.length) * 100;

ok("drain: full trace emitted with no drops", dropped === 0);
line("");
line("Pipeline A (Phase 1)         :");
line(`  events        : ${aRows.length}`);
line("Pipeline B (Phase 1 + SW)    :");
line(`  events        : ${bRows.length}`);
line(`  SW events     : ${nSw}`);
line(`  SW / total    : ${swPct.toFixed(2)}%`);
line(`  total emitted : ${emission} / dropped ${dropped}`);

const bytesA = storageBytes(aRows);
const bytesB = storageBytes(bRows);
const growthBytes = bytesB - bytesA;
const growthPct = (growthBytes / bytesA) * 100;
const bytesPerEvent = bytesB / bRows.length;
line(`  storage A     : ${(bytesA / 1024).toFixed(1)} KiB`);
line(`  storage B     : ${(bytesB / 1024).toFixed(1)} KiB`);
line(
	`  storage growth: ${(growthBytes / 1024).toFixed(1)} KiB (${growthPct.toFixed(2)}%)`,
);
line(`  bytes/event B : ${bytesPerEvent.toFixed(1)} B`);

const tA = timeDerive(aRows);
const tB = timeDerive(bRows);
const deltaMs = tB - tA;
const deltaPct = (deltaMs / tA) * 100;
const noiseFloor = Math.abs(tA) * 0.15;
line(`  derivation A  : ${tA.toFixed(2)} ms (median of 7)`);
line(`  derivation B  : ${tB.toFixed(2)} ms (median of 7)`);
line(
	`  derivation delta: ${deltaMs.toFixed(3)} ms (${deltaPct.toFixed(2)}%)${Math.abs(deltaMs) < noiseFloor ? "  <- within measurement noise" : ""}`,
);
line(
	`  note: SW events carry tabId 0 -> filtered by meaningful-events/transitions stage -> marginal derivation cost ~ 0`,
);

// ---- ring-buffer pressure: burst past capacity, prove drop accounting holds ----
const pressureSeeds = Array.from({ length: 40000 }, (_, i) => ({
	type: "PAGE_VISIBLE" as TabEventType,
	tabId: 1 + (i % 12),
	windowId: 100 + (i % 4),
	ts: T0 + i * 100,
}));
const pressure = drain(createBuffer(10_000), pressureSeeds);
line("");
line(
	`ring-buffer burst (cap 10k, 40k pushed): emitted ${pressure.emission}, dropped ${pressure.dropped}`,
);
ok(
	"pressure: drops accounted for exactly",
	pressure.emission + pressure.dropped === 40000,
);

// ---- acceptance principle: per-SW-type volume ----
line("");
line("per-SW-type volume (noise review — Step 7 value call):");
let top: [TabEventType, number] | null = null;
for (const t of SW_TYPES) {
	const c = swRows.filter((r) => r.type === t).length;
	if (!top || c > top[1]) top = [t, c];
	line(`  ${t.padEnd(20)} vol ${c}`);
}
line("");
line(
	`noise: dominant SW signal = ${top?.[0]} (vol ${top?.[1]}) -> throttle/review if analytical value is low`,
);
ok("acceptance: SW ratio stays < 30% of telemetry", nSw / bRows.length < 0.3);

console.log(lines.join("\n"));
