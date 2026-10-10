import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import { buildExportJsonl, derive } from "../share/export";

const MIN = 60_000;
const T0 = 1_700_000_000_000;
const ev = (
	minute: number,
	type: StoredTabEvent["type"],
	tabId = 1,
	url = "https://superdm.com",
): StoredTabEvent => ({
	id: `${minute}-${type}-${tabId}`,
	timestamp: T0 + minute * MIN,
	type,
	tabId,
	windowId: 1,
	url,
});
const total = (events: StoredTabEvent[]) =>
	derive(events).contexts.reduce((sum, context) => sum + context.duration, 0);

// Five minutes viewed, tab left open for 91 minutes with background refreshes.
const events = [ev(0, "TAB_ACTIVATED")];
for (let minute = 0.5; minute < 5; minute += 0.5)
	events.push(ev(minute, "PAGE_VISIBLE"));
events.push(ev(5, "PAGE_HIDDEN"));
for (let minute = 6; minute <= 91; minute++) {
	events.push(ev(minute, "TAB_UPDATED"));
	events.push(ev(minute, "NAVIGATION", 2, "https://linkedin.com/feed"));
	events.push(ev(minute, "SCROLL", 2, "https://linkedin.com/feed"));
}
const derived = derive(events);
assert.equal(derived.sessions.length, 1);
assert.equal(derived.sessions[0].duration, 5 * MIN);
assert.equal(total(events), 5 * MIN);
assert.equal(derived.contexts[0].episodes?.[0].duration, 5 * MIN);
assert.ok(
	derived.contexts.every(
		(context) =>
			!context.domains.some((domain) => domain.domain.includes("linkedin")),
	),
);
assert.equal(derived.live?.activeTabId, 0);
assert.equal(derived.live?.currentUrl, undefined);
assert.deepEqual(derive(events).sessions, derived.sessions);

// Redundant foreground title/loading updates cannot extend a legacy session.
assert.equal(
	total([
		ev(0, "TAB_ACTIVATED"),
		ev(1, "CLICK"),
		...events.filter((e) => e.type === "TAB_UPDATED"),
	]),
	MIN,
);

// Short hidden gap may stay in one session, but never adds active time.
const hidden = derive([
	ev(0, "TAB_ACTIVATED"),
	ev(1, "PAGE_HIDDEN"),
	ev(1.5, "PAGE_VISIBLE"),
	ev(2, "CLICK"),
]);
assert.equal(hidden.sessions.length, 1);
assert.equal(hidden.sessions[0].duration, 1.5 * MIN);
assert.equal(hidden.sessions[0].wallDuration, 2 * MIN);
assert.equal(hidden.contexts[0].duration, 1.5 * MIN);

// One coherent episode can group disjoint sessions. Duration excludes gaps.
const disjoint = [
	ev(0, "TAB_ACTIVATED"),
	ev(1, "CLICK"),
	ev(10, "TAB_ACTIVATED"),
	ev(11, "CLICK"),
];
assert.equal(total(disjoint), 2 * MIN);
assert.equal(derive(disjoint).sessions.length, 2);

const eightSessions = Array.from({ length: 8 }, (_, index) => {
	const start = index * ((91 - 0.625) / 7);
	return [ev(start, "TAB_ACTIVATED"), ev(start + 0.625, "CLICK")];
}).flat();
assert.equal(derive(eightSessions).sessions.length, 8);
assert.ok(Math.abs(total(eightSessions) - 5 * MIN) < 1);
assert.equal(derive([ev(0, "PAGE_HIDDEN")]).sessions.length, 0);

// A return sample can precede Chrome's activation event; ordinary excursions
// still stay one session while only the viewed tab owns each interval.
const excursion = [
	ev(0, "TAB_ACTIVATED"),
	...Array.from({ length: 6 }, (_, index) =>
		ev(1 + index * 2, "PAGE_VISIBLE", 2, "https://linkedin.com"),
	),
	ev(12.5, "PAGE_VISIBLE"),
	ev(13, "CLICK"),
];
assert.equal(derive(excursion).sessions.length, 1);

// Foreground switch owns dwell time through the switch, not last interaction.
const switched = [
	ev(0, "TAB_ACTIVATED"),
	ev(1, "TAB_ACTIVATED", 2, "https://linkedin.com"),
	ev(2, "PAGE_HIDDEN", 2, "https://linkedin.com"),
];
assert.equal(total(switched), 2 * MIN);
assert.equal(derive(switched).live?.activeTabId, 0);

// Browser unfocused: even still-visible tabs cannot claim activity.
const unfocused = [
	ev(0, "TAB_ACTIVATED"),
	ev(1, "CLICK"),
	{ ...ev(2, "SW_WINDOW_FOCUS", 0), windowId: -1 },
	ev(3, "CLICK"),
	ev(4, "PAGE_VISIBLE"),
];
assert.equal(total(unfocused), MIN); // no terminal page sample; old trace stays conservative
assert.equal(derive(unfocused).live?.activeTabId, 0);

// A selected tab in another window is not foreground. Background navigation
// cannot replace current URL or create a transition/domain in derived context.
const background = [
	ev(0, "TAB_ACTIVATED"),
	ev(1, "CLICK"),
	{ ...ev(2, "SW_WINDOW_FOCUS", 0), windowId: 1 },
	{ ...ev(3, "TAB_ACTIVATED", 2, "https://linkedin.com"), windowId: 2 },
	ev(4, "PAGE_VISIBLE"),
];
assert.equal(derive(background).live?.activeTabId, 1);
assert.equal(derive(background).live?.currentUrl, "https://superdm.com");
assert.equal(total(background), 2 * MIN); // focus marker stops unobserved dwell

const manifest = JSON.parse(buildExportJsonl(derived).split("\n")[0]).manifest;
assert.equal(manifest.derivationSchemaVersion, 9);
assert.ok(manifest.durationSemantics.wallDuration.includes("not active time"));
console.log("foreground.check: all assertions passed");
