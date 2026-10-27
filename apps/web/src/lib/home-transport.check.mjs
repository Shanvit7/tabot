import assert from "node:assert/strict";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const effects = [];
const state = [];
let stateIndex = 0;
const hookHarness = {
	useEffect: (effect) => effects.push(effect),
	useState: (initial) => {
		const index = stateIndex++;
		state[index] = initial;
		return [
			initial,
			(value) => {
				state[index] =
					typeof value === "function" ? value(state[index]) : value;
			},
		];
	},
};
const originalHarness = globalThis.__tabotHookHarness;
globalThis.__tabotHookHarness = hookHarness;
const server = await createServer({
	configFile: false,
	cacheDir: "node_modules/.vite-home-transport-check",
	root: fileURLToPath(new URL("../../", import.meta.url)),
	resolve: { alias: { "~": fileURLToPath(new URL("../", import.meta.url)) } },
	ssr: { noExternal: ["react"] },
	plugins: [
		{
			name: "hook-regression-harness",
			enforce: "pre",
			resolveId: (id, importer) =>
				id === "react" && importer?.endsWith("/hooks/use-home-data.ts")
					? "\0hook-react"
					: undefined,
			load: (id) =>
				id === "\0hook-react"
					? "export const {useEffect, useState} = globalThis.__tabotHookHarness;"
					: undefined,
		},
	],
	server: { middlewareMode: true },
	appType: "custom",
});
const originalChrome = globalThis.chrome;
const originalDocument = globalThis.document;
let cleanup;
const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};
try {
	const { fetchEventCount, fetchEvents, fetchStats } =
		await server.ssrLoadModule("/src/lib/home-data.ts");
	const { useHomeData } = await server.ssrLoadModule(
		"/src/hooks/use-home-data.ts",
	);
	mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
	const callbacks = new Map();
	const sent = new Map();
	globalThis.chrome = {
		runtime: {
			sendMessage: (...args) => {
				const [message, callback] = args.slice(-2);
				callbacks.set(message.type, callback);
				sent.set(message.type, (sent.get(message.type) ?? 0) + 1);
			},
		},
	};
	let settled = 0;
	const count = fetchEventCount().then((value) => {
		settled++;
		return value;
	});
	const events = fetchEvents().then((value) => {
		settled++;
		return value;
	});
	mock.timers.tick(1000);
	await Promise.resolve();
	assert.equal(
		settled,
		0,
		"healthy storage replies must not expire after 800 ms",
	);
	callbacks.get("GET_COUNTS")({ eventCount: 1 });
	const rows = [{ id: "delayed-history" }];
	callbacks.get("GET_EVENTS")(rows);
	assert.equal(await count, 1);
	assert.deepEqual(await events, rows);

	const stats = fetchStats();
	mock.timers.tick(801);
	assert.equal(await stats, null, "health probes keep short deadline");
	const timedOut = fetchEvents();
	mock.timers.tick(30_001);
	assert.equal(
		await timedOut,
		null,
		"missing storage reply must remain failure, not empty history",
	);
	callbacks.get("GET_EVENTS")([]); // Late response cannot replace timeout result.
	const failed = fetchEventCount();
	callbacks.get("GET_COUNTS")({ ok: false, code: "storage-unavailable" });
	assert.equal(await failed, null);
	const empty = fetchEvents();
	callbacks.get("GET_EVENTS")([]);
	assert.deepEqual(
		await empty,
		[],
		"successful empty history stays distinct from failure",
	);
	globalThis.chrome = undefined;
	assert.equal(await fetchEvents(), null);
	globalThis.chrome = {
		runtime: {
			sendMessage: (...args) => {
				const [message, callback] = args.slice(-2);
				callbacks.set(message.type, callback);
				sent.set(message.type, (sent.get(message.type) ?? 0) + 1);
			},
		},
	};
	sent.clear();
	globalThis.document = {
		hidden: false,
		addEventListener: () => {},
		removeEventListener: () => {},
	};
	// biome-ignore lint/correctness/useHookAtTopLevel: Harness injects React stubs to exercise polling without a browser.
	useHomeData();
	cleanup = effects[0]();
	callbacks.get("GET_STATS")({ health: "healthy" });
	mock.timers.tick(10_000);
	await flush();
	assert.equal(
		sent.get("GET_COUNTS"),
		1,
		"polling must not queue more reads during slow startup",
	);
	callbacks.get("GET_COUNTS")({ eventCount: 1 });
	await flush();
	assert.equal(sent.get("GET_EVENTS"), 1);
	mock.timers.tick(5_000);
	await flush();
	assert.equal(
		sent.get("GET_COUNTS"),
		1,
		"full-history read also holds polling guard",
	);
	callbacks.get("GET_EVENTS")(rows);
	await flush();
	assert.deepEqual(
		state[1],
		rows,
		"delayed successful history must reach dashboard",
	);
	mock.timers.tick(5_000);
	await flush();
	assert.equal(sent.get("GET_COUNTS"), 2, "polling resumes after completion");
	callbacks.get("GET_COUNTS")({ eventCount: 1 });
	await flush();
	assert.equal(
		sent.get("GET_EVENTS"),
		1,
		"unchanged counts reuse successful snapshot",
	);
	console.log(
		"home-transport: delayed replies, bounded timeout, empty/failure distinction and single-flight polling passed",
	);
} finally {
	cleanup?.();
	mock.timers.reset();
	globalThis.document = originalDocument;
	globalThis.__tabotHookHarness = originalHarness;
	globalThis.chrome = originalChrome;
	await server.close();
}
