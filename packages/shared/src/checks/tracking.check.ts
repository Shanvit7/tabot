import assert from "node:assert/strict";
import {
	createTrackingClient,
	type TrackingMessage,
} from "../tracking/tracking";

const messages: TrackingMessage[] = [];
let enabled = true;
const client = createTrackingClient(async (message) => {
	messages.push(message);
	if (message.type === "GET_TRACKING") return { enabled };
	enabled = message.enabled;
	return { enabled };
});

assert.equal(await client.read(), true);
assert.equal(await client.set(false), false);
assert.deepEqual(messages, [
	{ type: "GET_TRACKING" },
	{ type: "SET_TRACKING", enabled: false },
]);
await assert.rejects(
	createTrackingClient(async () => ({ enabled: "true" })).read(),
	/tracking-status-unavailable/,
);
await assert.rejects(
	createTrackingClient(async () => ({ enabled: true })).set(false),
	/tracking-update-failed/,
);
console.log(
	"shared tracking client: read, update, and response validation passed",
);
