import assert from "node:assert/strict";
import {
	type ConnectionState,
	deriveConnectionState,
	parseRelayHealth,
	type RelayHealth,
	type RelayState,
} from "../assistant-connections.ts";
import { logger } from "../lib/logger";

const health = (
	state: RelayState,
	chatgpt: boolean | null,
	roundTrip: RelayHealth["roundTrip"] = null,
): RelayHealth => ({
	relay: { state, error: null },
	roundTrip,
	assistants: chatgpt === null ? null : { chatgpt, claude: false, order: [] },
});

const cases: [boolean | null, RelayHealth | null, ConnectionState][] = [
	[null, null, "checking"],
	[false, null, "extension-unreachable"],
	[true, null, "auth-unknown"],
	[true, health("connected", null, { ok: true }), "auth-unknown"],
	[true, health("connected", false, { ok: true }), "not-authorized"],
	[true, health("connecting", true), "relay-connecting"],
	[true, health("idle", true), "relay-connecting"],
	[true, health("offline", true), "relay-offline"],
	[
		true,
		health("connected", true, { ok: false, status: 504 }),
		"round-trip-failed",
	],
	[true, health("connected", true), "round-trip-failed"],
	// "Connected" must need grant + live socket + working test request.
	[true, health("connected", true, { ok: true }), "healthy"],
];
for (const [reachable, h, expected] of cases)
	assert.equal(deriveConnectionState(reachable, h), expected);
assert.equal(
	deriveConnectionState(true, null, { chatgpt: false, claude: false }),
	"not-authorized",
);
assert.equal(
	deriveConnectionState(true, null, { chatgpt: true, claude: false }),
	"relay-status-unknown",
);

const valid = {
	relay: { state: "offline", error: "socket-closed" },
	roundTrip: null,
	assistants: { chatgpt: true, claude: false },
};
assert.equal(parseRelayHealth(valid)?.relay.error, "socket-closed");
assert.equal(
	parseRelayHealth({ ...valid, assistants: null })?.assistants,
	null,
);
assert.equal(
	parseRelayHealth({ ...valid, roundTrip: { ok: true, status: 200 } })
		?.roundTrip?.status,
	200,
);
for (const bad of [
	null,
	{},
	{ ...valid, relay: { state: "weird", error: null } },
	{ ...valid, relay: { state: "offline", error: "https://secret.example" } },
	{ ...valid, roundTrip: { ok: "yes" } },
])
	assert.equal(parseRelayHealth(bad), null);

logger.info("Assistant connection state: ok");
