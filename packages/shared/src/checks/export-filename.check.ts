// packages/shared/src/checks/export-filename.check.ts
// Runnable self-check for the export filename convention: what it is, the data
// range it covers, then a unique generation id. The range must reflect the
// actual data (not the requested filter) and the prefix must stay glob-matchable
// for the `~/Downloads/tabot-export-*.jsonl` CLI hint (share/targets.ts).
// Run: node --import ./resolve-hook.mjs src/checks/export-filename.check.ts

import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db.ts";
import { logger } from "../lib/logger.ts";
import { exportFilename } from "../share/export.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 1, 9, 15, 0); // 2026-09-01T09:15:00Z
const NOW = Date.UTC(2026, 8, 18, 14, 32, 5, 123); // 2026-09-18T14:32:05.123Z

const ev = (timestamp: number): StoredTabEvent => ({
	id: `${timestamp}`,
	type: "NAVIGATION",
	tabId: 1,
	windowId: 1,
	timestamp,
});

{
	// multi-day range, deliberately out of order → min/max must still hold
	const events = [
		ev(T0 + 3 * 24 * 60 * MIN),
		ev(T0),
		ev(T0 + 17 * 24 * 60 * MIN),
	];
	assert.equal(
		exportFilename(events, "jsonl", NOW),
		"tabot-export-2026-09-01_to_2026-09-18-20260918T143205123Z.jsonl",
	);
}

{
	// single-day range still states from/to (equal), never one bare date
	const singleDay = exportFilename([ev(T0), ev(T0 + 5 * MIN)], "jsonl", NOW);
	assert.equal(
		singleDay,
		"tabot-export-2026-09-01_to_2026-09-01-20260918T143205123Z.jsonl",
	);
	assert.equal(singleDay.split(".").length, 2, `extra dots: ${singleDay}`);
}

{
	// no data → range segment omitted instead of a misleading "undefined"
	const out = exportFilename([], "jsonl", NOW);
	assert.equal(out, "tabot-export-20260918T143205123Z.jsonl");
	assert.ok(!out.includes("undefined"), `leaked undefined: ${out}`);
	assert.ok(!out.includes("NaN"), `leaked NaN: ${out}`);
}

{
	// uniqueness: same instant + different instant both produce distinct names.
	// Millisecond resolution is the only uniqueness source — no random suffix.
	const same = exportFilename([ev(T0)], "jsonl", NOW);
	assert.notEqual(
		exportFilename([ev(T0)], "jsonl", NOW + 1),
		same,
		"two exports in the same second collided",
	);
}

{
	// filename safety + glob compatibility with share/targets.ts
	const out = exportFilename([ev(T0)], "jsonl", NOW);
	assert.ok(!/[:*?"<>|\\/]/.test(out), `unsafe chars in filename: ${out}`);
	assert.ok(out.startsWith("tabot-export-"), `prefix lost: ${out}`);
	assert.ok(out.endsWith(".jsonl"), `extension lost: ${out}`);
	// must stay selectable by the consumers that glob for the newest export:
	// share/targets.ts `tabot-export-*.jsonl` and v5regression's ^tabot-export-.*\.jsonl$
	assert.match(out, /^tabot-export-.*\.jsonl$/);
}

logger.info("export-filename.check: all assertions passed ✔");
