import assert from "node:assert/strict";
import { buildSignalGarden } from "./activity-signal-garden.ts";

const now = new Date(2026, 9, 20, 15).getTime();
const today = new Date(2026, 9, 20, 12).getTime();
const yesterday = new Date(2026, 9, 19, 12).getTime();
const earlier = new Date(2026, 9, 15, 12).getTime();
const nodes = Array.from({ length: 12 }, (_, index) => ({
	id: `https://site-${index}.test`,
	label: `Site ${index}`,
	activeMs: 60_000,
	lastSeen: today - index,
}));
const links = Array.from({ length: 7 }, (_, index) => ({
	source: nodes[index].id,
	target: nodes[index + 1].id,
	count: 100 - index,
	lastAt: [
		today,
		today - 60_000,
		yesterday,
		yesterday - 60_000,
		earlier,
		earlier - 60_000,
		earlier - 120_000,
	][index],
}));
const garden = buildSignalGarden(
	{ nodes, links, from: 0, to: now, totalMs: 0, stats: {} },
	8,
	now,
);
assert.equal(garden.sites.length, 8, "website nodes stay capped");
assert.equal(
	garden.transitions.length,
	7,
	"only observed transitions stay in graph",
);
assert.ok(garden.times.length <= 3, "time groups stay capped");
assert.ok(
	garden.transitions.every(
		(link) =>
			garden.sites.some((site) => site.id === link.source) &&
			garden.sites.some((site) => site.id === link.target),
	),
);
assert.deepEqual(
	garden.times.map((time) => time.label),
	["Today", "Yesterday", "Earlier"],
);
assert.equal(garden.transitions[0].label, "Site 0 → Site 1");
console.log(
	"Signal Garden projection: bounded nodes and observed relationships passed.",
);
