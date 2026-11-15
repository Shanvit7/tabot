import assert from "node:assert/strict";
import { homeAmbient } from "../components/features/home/ambient.ts";

// Run: node src/checks/ambient.check.mjs
const frame = homeAmbient.default();
const first = frame(0, { paper: true });
assert.match(first, /[·•●]/u);
assert.doesNotMatch(first, /[^ ·•●\n]/u);
const rows = first.split("\n");
const columns = (row) =>
	[...row].flatMap((glyph, column) => ("·•●".includes(glyph) ? [column] : []));
assert.equal(rows.length, homeAmbient.meta.rows);
assert.ok(rows.slice(0, 40).every((row) => !/[·•●]/u.test(row)));
assert.ok(rows.slice(40).some((row) => /[·•●]/u.test(row)));
const centroid = (row) =>
	columns(row).reduce((sum, column) => sum + column, 0) / columns(row).length;
assert.ok(
	centroid(rows[40]) < centroid(rows.at(-1)),
	"Side-starting curves must fan toward bottom edge",
);
assert.notEqual(first, frame(3, { paper: true }), "Contours must be alive");
assert.equal(first, frame(48, { paper: true }), "Loop must have no jump");
assert.equal(
	first,
	frame(0, { paper: false }),
	"No inverted dot cloud in dark mode",
);
console.log("Ambient contours: dot-only, continuous, animated, seamless loop.");
