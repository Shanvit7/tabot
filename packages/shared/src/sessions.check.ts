// packages/shared/src/sessions.check.ts
// Runnable self-check for sessionize() — covers docs/tech.md §9.1 scenarios + §9.2 rebuild consistency.
// Run: node packages/shared/src/sessions.check.ts  (Node 24+ strips types natively)

import assert from "node:assert/strict";
import type { StoredTabEvent } from "./db.ts";
import { logger } from "./logger.ts";
import { sessionize } from "./sessions.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;

const ev = (
	timestamp: number,
	type: StoredTabEvent["type"],
	tabId: number,
	windowId = 1,
	url?: string,
): StoredTabEvent => ({
	id: `${timestamp}-${tabId}-${windowId}`,
	type,
	tabId,
	windowId,
	timestamp,
	url,
});

const T0 = Date.now() - 24 * HOUR;

// 1. Continuous browsing (20 min, 5 tabs, constant interaction) → 1 session
{
	const events = [
		ev(T0, "TAB_CREATED", 1, 1, "https://github.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, 1),
		ev(T0 + 2, "SCROLL", 1, 1),
		ev(T0 + 60_000, "CLICK", 1, 1),
		ev(T0 + 120_000, "TAB_ACTIVATED", 2, 1, "https://youtube.com"),
		ev(T0 + 180_000, "SCROLL", 2, 1),
		ev(T0 + 240_000, "TAB_ACTIVATED", 3, 1, "https://docs.google.com"),
		ev(T0 + 300_000, "KEY_ACTIVITY", 3, 1),
	];
	const sessions = sessionize(events);
	assert.equal(
		sessions.length,
		1,
		"scenario 1: continuous browsing → 1 session",
	);
	assert.ok(
		sessions[0]?.tabs.length >= 3,
		"scenario 1: multiple tabs participate",
	);
}

// 2. 1-hour idle between bursts → 2 sessions
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://a.com"),
		ev(T0 + 60_000, "CLICK", 1, 1),
		ev(T0 + HOUR + 60_000, "TAB_ACTIVATED", 2, 1, "https://b.com"),
		ev(T0 + HOUR + 120_000, "CLICK", 2, 1),
	];
	assert.equal(
		sessionize(events).length,
		2,
		"scenario 2: 1h idle → 2 sessions",
	);
}

// 3. Minimize browser 30s → 1 session (visibility gap < threshold)
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://a.com"),
		ev(T0 + 60_000, "PAGE_HIDDEN", 1, 1),
		ev(T0 + 90_000, "PAGE_VISIBLE", 1, 1),
		ev(T0 + 100_000, "CLICK", 1, 1),
	];
	assert.equal(
		sessionize(events).length,
		1,
		"scenario 3: 30s hidden → 1 session",
	);
}

// 4. Minimize browser 10 min → 2 sessions (visibility gap ≥ threshold)
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://a.com"),
		ev(T0 + 60_000, "PAGE_HIDDEN", 1, 1),
		ev(T0 + 10 * MIN + 1, "PAGE_VISIBLE", 1, 1),
		ev(T0 + 10 * MIN + 2, "CLICK", 1, 1),
	];
	assert.equal(
		sessionize(events).length,
		2,
		"scenario 4: 10min hidden → 2 sessions",
	);
}

// 5. Tab A silent 15 min then active again → boundary (tab absence)
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://a.com"),
		ev(T0 + 60_000, "TAB_ACTIVATED", 2, 1, "https://b.com"),
		ev(T0 + 15 * MIN + 60_000, "TAB_ACTIVATED", 1, 1, "https://a.com"),
	];
	assert.equal(
		sessionize(events).length,
		2,
		"scenario 5: tab absence → boundary",
	);
}

// 6. Rapid tab switching (20 switches, 1 min) → 1 session
{
	const events = [];
	for (let i = 0; i < 20; i++) {
		events.push(ev(T0 + i * 3000, "TAB_ACTIVATED", i % 3, 1));
	}
	assert.equal(
		sessionize(events as StoredTabEvent[]).length,
		1,
		"scenario 6: rapid switching → 1 session",
	);
}

// 7. Long reading (10 min, few events) → 1 session, low intensity
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://read.com"),
		ev(T0 + 240_000, "SCROLL", 1, 1),
		ev(T0 + 480_000, "SCROLL", 1, 1),
	];
	const s = sessionize(events);
	assert.equal(s.length, 1, "scenario 7: long reading → 1 session");
	assert.ok(
		(s[0]?.interactionCount ?? 0) <= 3,
		"scenario 7: low interaction intensity",
	);
}

// 8. Multiple unrelated sites in one sitting → 1 session, 3 domains
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://github.com"),
		ev(T0 + 60_000, "TAB_ACTIVATED", 2, 1, "https://youtube.com"),
		ev(T0 + 120_000, "TAB_ACTIVATED", 3, 1, "https://docs.google.com"),
	];
	const sessions = sessionize(events);
	assert.equal(
		sessions.length,
		1,
		"scenario 8: multi-site sitting → 1 session",
	);
	assert.equal(
		sessions[0]?.domains.length,
		3,
		"scenario 8: 3 domains participate",
	);
}

// 9. Same site, different purposes, separated by > threshold → 2 sessions
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://github.com"),
		ev(T0 + 60_000, "CLICK", 1, 1),
		ev(T0 + HOUR, "TAB_ACTIVATED", 1, 1, "https://github.com"),
		ev(T0 + HOUR + 60_000, "CLICK", 1, 1),
	];
	assert.equal(
		sessionize(events).length,
		2,
		"scenario 9: gap > threshold → 2 sessions",
	);
}

// 10. Empty stream → no sessions
assert.deepEqual(sessionize([]), [], "scenario 10: empty → []");

// 11. Single event → 1 session, zero duration
{
	const s = sessionize([ev(T0, "TAB_ACTIVATED", 1, 1, "https://a.com")]);
	assert.equal(s.length, 1);
	assert.equal(s[0]?.eventCount, 1);
	assert.equal(s[0]?.duration, 0);
}

// 12. Rebuild consistency (§9.2): identical output on repeated runs
{
	const events = [
		ev(T0, "TAB_CREATED", 1, 1, "https://github.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, 1),
		ev(T0 + 2, "SCROLL", 1, 1),
		ev(T0 + 60_000, "CLICK", 1, 1),
		ev(T0 + HOUR, "TAB_ACTIVATED", 2, 1, "https://b.com"),
		ev(T0 + HOUR + 1, "SCROLL", 2, 1),
	];
	const a = sessionize(events);
	const b = sessionize(events);
	assert.deepEqual(a, b, "scenario 12: rebuild consistency");
}

// Fixture F — ordinary tab excursion must not fragment the session.
// Continuous activity (< 5m gaps) while tab 1 stays silent >10m, then return to it.
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://github.com"),
		ev(T0 + 60_000, "SCROLL", 1, 1),
		ev(T0 + 2 * MIN, "TAB_ACTIVATED", 2, 1, "https://google.com"),
		ev(T0 + 4 * MIN, "SCROLL", 2, 1),
		ev(T0 + 6 * MIN, "TAB_ACTIVATED", 3, 1, "https://linkedin.com"),
		ev(T0 + 7 * MIN, "CLICK", 3, 1),
		ev(T0 + 9 * MIN, "TAB_ACTIVATED", 2, 1, "https://google.com"),
		ev(T0 + 10 * MIN, "SCROLL", 2, 1),
		// A has been silent 11m (>10m) — returning is an excursion, not a boundary
		ev(T0 + 12 * MIN, "TAB_ACTIVATED", 1, 1, "https://github.com"),
		ev(T0 + 13 * MIN, "SCROLL", 1, 1),
	];
	const sessions = sessionize(events);
	assert.equal(
		sessions.length,
		1,
		"fixture F: excursion back to idle tab → 1 session",
	);
}

// Fixture F (pathological rapid switching) — A→B→C→B→A within minutes, zero inactivity → 1 session
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://a.com"),
		ev(T0 + 60_000, "TAB_ACTIVATED", 2, 1, "https://b.com"),
		ev(T0 + 120_000, "TAB_ACTIVATED", 3, 1, "https://c.com"),
		ev(T0 + 180_000, "TAB_ACTIVATED", 2, 1, "https://b.com"),
		ev(T0 + 240_000, "TAB_ACTIVATED", 1, 1, "https://a.com"),
	];
	assert.equal(
		sessionize(events).length,
		1,
		"fixture F: rapid A→B→C→B→A → 1 session",
	);
}

// Fixture G — long reading page (scroll/click, gaps under inactivity threshold) → stable single session
{
	const events = [
		ev(T0, "TAB_ACTIVATED", 1, 1, "https://read.com/article"),
		ev(T0 + 4 * MIN, "SCROLL", 1, 1),
		ev(T0 + 8 * MIN, "SCROLL", 1, 1),
		ev(T0 + 12 * MIN, "CLICK", 1, 1),
		ev(T0 + 16 * MIN, "SCROLL", 1, 1),
		ev(T0 + 20 * MIN, "SCROLL", 1, 1),
	];
	const sessions = sessionize(events);
	assert.equal(sessions.length, 1, "fixture G: long reading → 1 session");
}

logger.info("sessions.check: all assertions passed ✔");
