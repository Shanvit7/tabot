import { strict as assert } from "node:assert";
import {
	computeActivityStats,
	computePlaceStats,
	dayKeyOf,
} from "./activity-flow-stats.ts";

const at = (day, hour, minute) =>
	new Date(2026, 0, day, hour, minute, 0, 0).getTime();
const now = new Date(2026, 0, 15, 12, 0, 0, 0).getTime();

// Empty period: nothing to count, but the week strip still has 7 slots.
const empty = computeActivityStats([], now);
assert.equal(empty.activeDays, 0);
assert.equal(empty.streakDays, 0);
assert.equal(empty.distinctSites, 0);
assert.equal(empty.returningSites, 0);
assert.equal(empty.focusMs, 0);
assert.equal(empty.busiestHour, null);
assert.equal(empty.week.length, 7);
assert.equal(
	empty.week.every((day) => !day.active),
	true,
);

const samples = [
	{ origin: "a", timestamp: at(13, 9, 0) },
	{ origin: "a", timestamp: at(14, 9, 0) },
	{ origin: "a", timestamp: at(15, 9, 0) },
	{ origin: "a", timestamp: at(15, 9, 3) }, // 3 min later → same focus run
	{ origin: "b", timestamp: at(15, 10, 0) },
	{ origin: "c", timestamp: at(15, 10, 10) },
];
const stats = computeActivityStats(samples, now);
assert.equal(stats.activeDays, 3, "three distinct active days");
assert.equal(stats.streakDays, 3, "13,14,15 = a 3-day streak");
assert.equal(stats.distinctSites, 3);
assert.equal(stats.returningSites, 1, "only 'a' spans two+ days");
assert.equal(stats.focusMs, 3 * 60 * 1000, "a 3-minute run on 'a'");
assert.equal(stats.focusOrigin, "a");
assert.equal(stats.busiestHour, 9);
assert.equal(stats.busiestHourEvents, 4);
assert.equal(stats.week.at(-1)?.active, true, "today is active");
assert.equal(stats.week.at(-1)?.events, 4);

// The 5-minute gap is a boundary, not a bridge.
const split = computeActivityStats(
	[
		{ origin: "x", timestamp: at(15, 9, 0) },
		{ origin: "x", timestamp: at(15, 9, 6) },
	],
	now,
);
assert.equal(split.focusMs, 0, "a 6-minute gap breaks the run");

// A missing today means the streak is broken, not zero-length.
const yesterdayOnly = computeActivityStats(
	[{ origin: "x", timestamp: at(14, 9, 0) }],
	now,
);
assert.equal(yesterdayOnly.streakDays, 0);

assert.equal(dayKeyOf(at(13, 9, 0)), dayKeyOf(at(13, 23, 0)));

console.log("activity-flow.check: all assertions passed ✔");

// Place stats: time = gap to next event (capped), visits = separate stretches.
const places = computePlaceStats([
	{ origin: "a", timestamp: at(15, 9, 0) },
	{ origin: "b", timestamp: at(15, 9, 2) },
	{ origin: "a", timestamp: at(15, 9, 3) },
	{ origin: "a", timestamp: at(16, 9, 0) }, // 23h gap → capped at 5 min
]);
assert.deepEqual(places.get("a"), { activeMs: 7 * 60000, visits: 3, days: 2 });
assert.deepEqual(places.get("b"), { activeMs: 60000, visits: 1, days: 1 });
