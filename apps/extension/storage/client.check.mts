import assert from "node:assert/strict";
import { mock } from "node:test";
import { getStorageDb } from "./client";

const originalChrome = globalThis.chrome;
let exists = false;
let creates = 0;
let pings = 0;
let reloading = 0;
let hangRequests = false;
let failCreate = true;
globalThis.chrome = {
	offscreen: {
		hasDocument: async () => exists,
		createDocument: async () => {
			creates++;
			if (failCreate) throw new Error("startup-check-failure");
			assert.equal(
				exists,
				false,
				"concurrent requests must share document creation",
			);
			exists = true;
		},
	},
	runtime: {
		sendMessage: async (message: { kind: string; requestId: number }) => {
			assert.equal(exists, true);
			if (message.kind === "TABOT_STORAGE_PING") {
				pings++;
				return reloading-- > 0 ? undefined : { ready: true };
			}
			if (hangRequests) return new Promise(() => {});
			assert.ok(reloading < 0, "request cannot overtake owner readiness");
			return { requestId: message.requestId, ok: true, value: 7 };
		},
	},
} as unknown as typeof chrome;
try {
	const db = await getStorageDb();
	await assert.rejects(db.countEvents(), /startup-check-failure/);
	failCreate = false;
	assert.deepEqual(
		await Promise.all([db.countEvents(), db.countEvents()]),
		[7, 7],
	);
	assert.equal(creates, 2);
	exists = false;
	assert.equal(
		await db.countEvents(),
		7,
		"existing facade must recover closed document",
	);
	assert.equal(creates, 3);
	const beforeReload = pings;
	reloading = 2;
	assert.equal(
		await db.countEvents(),
		7,
		"existing document must re-handshake after reload",
	);
	assert.equal(pings - beforeReload, 3);
	hangRequests = true;
	mock.timers.enable({ apis: ["setTimeout"] });
	const timedOut = db.countEvents();
	for (let i = 0; i < 10; i++) await Promise.resolve();
	exists = false; // Simulate owner disappearance while RPC has no reply.
	mock.timers.tick(10_000);
	await assert.rejects(timedOut, /storage-response-timeout/);
	mock.timers.reset();
	hangRequests = false;
	const beforeTimeoutRecovery = creates;
	assert.equal(
		await db.countEvents(),
		7,
		"existing facade recovers after timeout",
	);
	assert.equal(creates, beforeTimeoutRecovery + 1);
	console.log(
		"storage-client: startup retry, reload, timeout and owner-loss recovery passed",
	);
} finally {
	globalThis.chrome = originalChrome;
}
