import assert from "node:assert/strict";
import {
	AXIS_DAYS,
	buildMemoryMap,
	dayStartOf,
	MAX_ROWS,
	MIN_AXIS_DAYS,
} from "./memory-map.ts";

const DAY = 86_400_000;
const memory = (
	id,
	lastSeen,
	occurrenceDays,
	orderedOrigins = [],
	spanDays = 10,
) => ({
	id,
	firstSeen: lastSeen - spanDays * DAY,
	lastSeen,
	occurrences: occurrenceDays.map((timestamp) => ({
		startTimestamp: timestamp,
	})),
	fingerprint: {
		orderedOrigins,
		domains: [{ domain: "https://fallback.com", weight: 1 }],
	},
});

const now = dayStartOf(new Date(2026, 0, 15).getTime()) + 12 * 3600_000;
const today = dayStartOf(now);

// One pattern today and two days ago, one occurrence older than the window.
const map = buildMemoryMap(
	[
		memory(
			"a",
			now,
			[now, today - 2 * DAY, today - 40 * DAY],
			[
				"https://github.com",
				"https://github.com",
				"https://news.ycombinator.com",
			],
		),
		memory("b", today - DAY, [today - DAY], []),
	],
	now,
);

// Window spans the data (11 days here), ending on the newest lastSeen.
assert.equal(map.axis.length, 12);
assert.equal(map.axis[0], today - 11 * DAY);
assert.equal(map.axis[map.axis.length - 1], today);
assert.ok(map.axis.every((day, i) => i === 0 || day > map.axis[i - 1]));

const slots = map.axis.length;
const [first, second] = map.rows;
assert.equal(first.days[slots - 1], 1); // today
assert.equal(first.days[slots - 3], 1); // two days ago
assert.equal(
	first.days.reduce((a, b) => a + b, 0),
	2,
); // 40-day-old is outside
assert.equal(first.occurrenceCount, 3); // but still counted
assert.deepEqual(first.origins, [
	"https://github.com",
	"https://news.ycombinator.com",
]);
assert.equal(second.days[slots - 2], 1);
assert.deepEqual(second.origins, ["https://fallback.com"]); // no orderedOrigins

// Short spans pad to the minimum, long spans cap at the maximum.
assert.equal(
	buildMemoryMap([memory("c", now, [now], [], 0)], now).axis.length,
	MIN_AXIS_DAYS,
);
assert.equal(
	buildMemoryMap([memory("d", now, [now - 60 * DAY, now], [], 60)], now).axis
		.length,
	AXIS_DAYS,
);

// Rows are capped, and an empty store still yields an axis.
const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) =>
	memory(`m${i}`, now - i * DAY, [now - i * DAY]),
);
assert.equal(buildMemoryMap(many, now).rows.length, MAX_ROWS);
assert.equal(buildMemoryMap([], now).axis.length, MIN_AXIS_DAYS);
assert.equal(buildMemoryMap([], now).rows.length, 0);

console.log("memory-map.check: all assertions passed ✔");
