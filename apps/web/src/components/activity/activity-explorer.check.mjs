import assert from "node:assert/strict";
import {
	buildActivityExplorer,
	TRAILS_PER_MAP,
	trailWindow,
} from "./activity-explorer.ts";

const start = new Date(2026, 9, 20, 9).getTime();
const route = [
	"https://github.com/project",
	"https://developer.mozilla.org/docs",
	"https://github.com/project",
];
const events = [0, 1].flatMap((session) =>
	route.map((url, index) => ({
		id: `${session}-${index}`,
		type: "TAB_ACTIVATED",
		tabId: index + 1,
		windowId: 1,
		timestamp: start + session * 10 * 60_000 + index * 60_000,
		url,
	})),
);
const model = buildActivityExplorer(events, start - 1, start + 20 * 60_000);
assert.equal(
	model.trails.length,
	2,
	"five-minute break makes separate browsing stretches",
);
assert.deepEqual(
	model.trails.map((trail) => trail.stops.length),
	[3, 3],
	"consecutive return to a site stays visible",
);
assert.equal(
	model.timeline.length,
	4,
	"transitions derive only from observed website changes",
);
assert.equal(
	new Set(model.timeline.map((item) => item.id)).size,
	4,
	"transition evidence remains uniquely addressable",
);
assert.equal(
	model.patterns.every((pattern) => pattern.occurrences.length > 1),
	true,
	"only repeated occurrences appear as patterns",
);
assert.equal(
	model.patterns.every((pattern) => pattern.inference === null),
	true,
	"pattern derivation makes no intent inference",
);
const busyEvents = Array.from({ length: 7 * 12 * 24 }, (_, index) => {
	const day = Math.floor(index / (12 * 24));
	const trail = Math.floor(index / 24) % 12;
	const stop = index % 24;
	return {
		id: `stress-${index}`,
		type: "TAB_ACTIVATED",
		tabId: index + 1,
		windowId: 1,
		timestamp: new Date(2026, 9, 14 + day, 6 + trail).getTime() + stop * 30_000,
		url: `https://site-${index}.example/page`,
	};
});
const busy = buildActivityExplorer(
	busyEvents,
	new Date(2026, 9, 14).getTime(),
	new Date(2026, 9, 21).getTime(),
);
assert.equal(
	busy.trails.length,
	84,
	"large history retains separate observed sessions",
);
assert.equal(
	new Set(
		busy.trails.flatMap((trail) => trail.stops.map((stop) => stop.origin)),
	).size,
	2016,
	"large history retains every distinct website",
);
assert.equal(TRAILS_PER_MAP, 6, "map overview stays paginated");
assert.equal(
	trailWindow(busy.trails[0].stops, 8).stops.length,
	8,
	"replay shows bounded stop windows",
);
assert.equal(
	trailWindow(busy.trails[0].stops, 8).start,
	7,
	"overlapping windows preserve checkpoint boundary",
);
console.log(
	"Activity explorer check passed: session boundaries, observed transitions, recurrence evidence, no inferred intent, 2,016-site stress fixture, bounded trails.",
);
