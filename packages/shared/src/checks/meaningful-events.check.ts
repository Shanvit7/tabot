// packages/shared/src/meaningful-events.check.ts
// Runnable self-check for meaningful-events.ts — phase 3 spec steps 2-4 fixtures.
// Run: node --import ./resolve-hook.mjs src/meaningful-events.check.ts

import assert from "node:assert/strict";
import {
	type ActivityRef,
	activityRef,
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";

const T0 = 1_700_000_000_000;

const ev = (
	timestamp: number,
	type: StoredTabEvent["type"],
	tabId: number,
	url?: string,
	windowId = 1,
): StoredTabEvent => ({
	id: `${timestamp}-${tabId}`,
	type,
	tabId,
	windowId,
	timestamp,
	url,
});

// Fixture E — TAB_UPDATED storm: 100 redundant + 1 real navigation → 1 meaningful transition
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://a.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://a.com"),
	];
	for (let i = 0; i < 100; i++) {
		events.push(ev(T0 + 10 + i, "TAB_UPDATED", 1, "https://a.com"));
	}
	events.push(ev(T0 + 200, "NAVIGATION", 1, "https://b.com"));

	const derived = deriveMeaningfulEvents(events);
	// identity already established by TAB_CREATED/TAB_ACTIVATED → every redundant update collapses
	assert.equal(
		derived.filter((d) => d.type === "TAB_UPDATED").length,
		0,
		"fixture E: 100 redundant TAB_UPDATED all collapse (no state change)",
	);
	const transitions = deriveTransitions(derived);
	assert.equal(
		transitions.length,
		1,
		"fixture E: 1 real navigation → 1 transition",
	);
	assert.equal(transitions[0]?.from.exactUrl, "https://a.com");
	assert.equal(transitions[0]?.to.exactUrl, "https://b.com");
}

// onUpdated echo of webNavigation — same url, same tab → single transition
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://a.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://a.com"),
		ev(T0 + 100, "NAVIGATION", 1, "https://b.com"),
		ev(T0 + 101, "TAB_UPDATED", 1, "https://b.com"), // echo of the same navigation
		ev(T0 + 300, "NAVIGATION", 1, "https://c.com"),
	];
	const derived = deriveMeaningfulEvents(events);
	assert.equal(
		derived.filter((d) => d.type === "TAB_UPDATED").length,
		0,
		"TAB_UPDATED echo of NAVIGATION is redundant",
	);
	const transitions = deriveTransitions(derived);
	assert.equal(
		transitions.length,
		2,
		"a→b→c = 2 transitions, echo not double-counted",
	);
	assert.deepEqual(
		transitions.map((t) => t.to.exactUrl),
		["https://b.com", "https://c.com"],
	);
}

// Real url change — TAB_UPDATED with a genuinely new identity stays meaningful
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://a.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://a.com"),
		ev(T0 + 100, "TAB_UPDATED", 1, "https://b.com"), // real change, no NAVIGATION
	];
	const derived = deriveMeaningfulEvents(events);
	assert.equal(
		derived.filter((d) => d.type === "TAB_UPDATED").length,
		1,
		"TAB_UPDATED with new url stays meaningful",
	);
	assert.equal(deriveTransitions(derived).length, 1);
}

// URL identity — distinguishes same-domain different-page
{
	const a = activityRef("https://github.com/project-a") as ActivityRef;
	const b = activityRef("https://github.com/project-b") as ActivityRef;
	assert.notEqual(
		a.pathname,
		b.pathname,
		"same domain, different page → different pathname",
	);
	assert.equal(a.origin, b.origin, "origin preserved");

	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://github.com/project-a"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://github.com/project-a"),
		ev(T0 + 100, "NAVIGATION", 1, "https://github.com/project-b"),
	];
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	assert.equal(
		transitions.length,
		1,
		"github.com/project-a → github.com/project-b is a real transition",
	);
}

// Tab switch — TAB_ACTIVATED across tabs, gapsMs retained
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://a.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://a.com"),
		ev(T0 + 5000, "TAB_ACTIVATED", 2, "https://b.com"),
		ev(T0 + 7000, "TAB_ACTIVATED", 1, "https://a.com"),
	];
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	assert.equal(transitions.length, 2);
	const a2b = transitions.find(
		(t) => t.from.exactUrl === "https://a.com",
	) as NonNullable<(typeof transitions)[number]>;
	assert.equal(a2b.tabSwitch, true, "tab switch detected");
	assert.equal(a2b.gapsMs.length, 1);
	assert.equal(a2b.gapsMs[0], 4999, "temporal proximity retained (ms)");
	const b2a = transitions.find(
		(t) => t.from.exactUrl === "https://b.com",
	) as NonNullable<(typeof transitions)[number]>;
	assert.equal(b2a.returns, true, "return A→B→A detected");
}

// Scroll spam — no self-transitions from non-navigational events
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://a.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://a.com"),
		ev(T0 + 100, "SCROLL", 1, "https://a.com"),
		ev(T0 + 200, "SCROLL", 1, "https://a.com"),
		ev(T0 + 300, "CLICK", 1, "https://a.com"),
	];
	assert.equal(
		deriveTransitions(deriveMeaningfulEvents(events)).length,
		0,
		"no self-transitions",
	);
}

// Determinism — identical raw input → identical derived output, twice
{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://a.com"),
		ev(T0 + 1, "TAB_ACTIVATED", 1, "https://a.com"),
		ev(T0 + 10, "TAB_UPDATED", 1, "https://a.com"),
		ev(T0 + 10, "TAB_UPDATED", 1, "https://a.com"),
		ev(T0 + 100, "NAVIGATION", 1, "https://b.com"),
	];
	const a = deriveMeaningfulEvents(events);
	const b = deriveMeaningfulEvents(events);
	assert.deepEqual(a, b, "deterministic derivation");
	assert.deepEqual(
		deriveTransitions(a),
		deriveTransitions(b),
		"deterministic transitions",
	);
}

// Empty input
assert.deepEqual(deriveMeaningfulEvents([]), [], "empty → []");
assert.deepEqual(deriveTransitions([]), [], "empty → []");

logger.info("meaningful-events.check: all assertions passed ✔");
