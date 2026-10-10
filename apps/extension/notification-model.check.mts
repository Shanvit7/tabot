import assert from "node:assert/strict";
import type { BrowserContext, Memory } from "@tabot/shared";
import {
	isNotifiableEpisode,
	nextNotifiableMemory,
} from "./notification-model";

const now = 1_800_000_000_000;
const episode: NonNullable<BrowserContext["episodes"]>[number] = {
	id: "episode",
	anchorIds: [],
	startTimestamp: now - 15 * 60_000,
	endTimestamp: now,
	duration: 15 * 60_000,
	sessionIds: ["session"],
	domains: ["example.com"],
	totalEventCount: 20,
	totalInteractionCount: 5,
	totalNavigationCount: 2,
	primaryDomain: "example.com",
	boundaryType: "end",
	homeOrigin: "example.com",
	domainEvents: { "example.com": 20 },
	trajectorySegmented: true,
};
assert.equal(isNotifiableEpisode(episode), true);
assert.equal(isNotifiableEpisode({ ...episode, duration: 9 * 60_000 }), false);
assert.equal(isNotifiableEpisode({ ...episode, totalEventCount: 9 }), false);
assert.equal(
	isNotifiableEpisode({ ...episode, totalInteractionCount: 4 }),
	false,
);

const memory = (kind: Memory["kind"], lastSeen: number) =>
	({ kind, lastSeen }) as Memory;
const old = memory("recurrent", now - 25 * 60 * 60_000);
const seen = memory("recurrent", now - 2 * 60 * 60_000);
const single = memory("single", now - 60 * 60_000);
const fresh = memory("recurrent", now - 45 * 60_000);
assert.equal(
	nextNotifiableMemory([old, seen, single, fresh], now - 3 * 60 * 60_000, now),
	fresh,
);
assert.equal(nextNotifiableMemory([fresh], fresh.lastSeen, now), undefined);
assert.equal(nextNotifiableMemory([fresh], 0, now - 20 * 60_000), undefined);
console.log("Notification candidate checks passed.");
