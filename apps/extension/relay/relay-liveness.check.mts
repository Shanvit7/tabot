// Fake sockets + controlled clock: half-open sockets and lost reconnect timers.
import assert from "node:assert/strict";
import { mock } from "node:test";
import * as shared from "@tabot/shared";

mock.module("@tabot/shared", { namedExports: shared });
mock.module("../storage/client", {
	namedExports: { getStorageDb: async () => ({}) },
});

const sockets: TestSocket[] = [];
class TestSocket {
	static OPEN = 1;
	readyState = 1;
	sent: string[] = [];
	closed: number | null = null;
	onopen?: () => void;
	onclose: ((event: { code: number }) => void) | null = null;
	constructor() {
		sockets.push(this);
	}
	send(message: string) {
		this.sent.push(message);
	}
	close(code: number) {
		this.closed = code;
	}
}
const alarms: { name: string; info: unknown }[] = [];
let onAlarm: (alarm: { name: string }) => void = () => {};
const originalChrome = globalThis.chrome;
const originalWebSocket = globalThis.WebSocket;
globalThis.chrome = {
	storage: {
		local: {
			set: async () => {},
			get: async () => ({
				tabot_relay_credentials: { installationId: "test", token: "test" },
			}),
		},
	},
	alarms: {
		create: async (name: string, info: unknown) => {
			alarms.push({ name, info });
		},
		onAlarm: { addListener: (fn: typeof onAlarm) => (onAlarm = fn) },
	},
} as unknown as typeof chrome;
globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
const flush = () => new Promise((resolve) => setImmediate(resolve));

try {
	mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
	const { getRelayStatus, startRelay } = await import("./relay");
	startRelay();
	await flush();
	assert.equal(sockets.length, 1);
	assert.ok(alarms.some((a) => a.name === "tabot-relay-keepalive"));
	sockets[0].onopen?.();
	assert.equal(getRelayStatus().state, "connected");

	// First tick pings; pong never arrives => second tick drops the half-open socket.
	mock.timers.tick(25_000);
	assert.deepEqual(sockets[0].sent, ["ping"]);
	mock.timers.tick(25_000);
	assert.equal(sockets[0].closed, 4000);
	assert.equal(getRelayStatus().state, "offline");
	assert.equal(getRelayStatus().lastError, "heartbeat timeout");

	// Reconnect timer lost with the service worker: the alarm must reconnect.
	await flush();
	if (sockets.length === 1) {
		onAlarm({ name: "tabot-relay-keepalive" });
		await flush();
	}
	assert.equal(sockets.length, 2);

	// A stale socket's late close must not tear down its replacement.
	sockets[1].onopen?.();
	sockets[0].onclose?.({ code: 1006 });
	assert.equal(getRelayStatus().state, "connected");
	console.log(
		"Relay liveness passed: pong watchdog, alarm reconnect, stale close.",
	);
} finally {
	mock.timers.reset();
	mock.restoreAll();
	globalThis.chrome = originalChrome;
	globalThis.WebSocket = originalWebSocket;
}
