// Run: node apps/web/src/checks/extension-connection.check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import "../../../../packages/shared/resolve-hook.mjs";

const configuredId = "a".repeat(32);
const discoveredId = "b".repeat(32);
let scenario = 0;
let env;
const constantsUrl = new URL("../lib/constants.ts", import.meta.url).href;
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "~/lib/constants")
			return {
				url: `${constantsUrl}?scenario=${scenario}`,
				shortCircuit: true,
			};
		if (specifier === "@tanstack/react-start")
			return {
				url: "data:text/javascript,export const createClientOnlyFn = fn => fn;",
				shortCircuit: true,
			};
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.startsWith(constantsUrl))
			return {
				format: "module",
				source: readFileSync(new URL(constantsUrl), "utf8").replaceAll(
					"import.meta.env",
					JSON.stringify(env),
				),
				shortCircuit: true,
			};
		return nextLoad(url, context);
	},
});

const originals = {
	chrome: globalThis.chrome,
	window: globalThis.window,
	location: globalThis.location,
};
try {
	const scenarios = [
		[
			"https://shanvit7.github.io/tabot/",
			false,
			configuredId,
			[discoveredId],
			discoveredId,
			discoveredId,
		],
		[
			"http://localhost:3000/",
			true,
			undefined,
			[discoveredId],
			discoveredId,
			discoveredId,
		],
		[
			"http://localhost:3001/home",
			true,
			configuredId,
			[configuredId],
			undefined,
			configuredId,
		],
		[
			"https://shanvit7.github.io/tabot/",
			false,
			configuredId,
			[configuredId, discoveredId],
			discoveredId,
			configuredId,
		],
		[
			"http://localhost:3000/",
			true,
			"invalid",
			[discoveredId],
			discoveredId,
			discoveredId,
		],
		[
			"http://localhost:3002/",
			true,
			undefined,
			[discoveredId],
			discoveredId,
			undefined,
		],
		[
			"https://shanvit7.github.io/other",
			false,
			undefined,
			[discoveredId],
			discoveredId,
			undefined,
		],
		["http://localhost:3000/", true, configuredId, [], undefined, undefined],
	];
	const runScenario = async ([
		url,
		development,
		configured,
		installed,
		bridgeId,
		expected,
	]) => {
		scenario++;
		env = { DEV: development, VITE_TABOT_EXTENSION_ID: configured };
		const listeners = new Set();
		const posted = [];
		const location = { href: url, origin: new URL(url).origin };
		const window = {
			location,
			addEventListener: (_type, listener) => listeners.add(listener),
			removeEventListener: (_type, listener) => listeners.delete(listener),
			postMessage(data, targetOrigin) {
				assert.equal(targetOrigin, location.origin);
				posted.push(data);
				queueMicrotask(() => {
					if (data.type === "TABOT_DISCOVER_EXTENSION") {
						for (const listener of [...listeners]) {
							for (const event of [
								{
									source: {},
									origin: location.origin,
									data: {
										type: "TABOT_EXTENSION_READY",
										extensionId: "c".repeat(32),
									},
								},
								{
									source: window,
									origin: "https://evil.example",
									data: {
										type: "TABOT_EXTENSION_READY",
										extensionId: "c".repeat(32),
									},
								},
								{
									source: window,
									origin: location.origin,
									data: {
										type: "TABOT_EXTENSION_READY",
										extensionId: "invalid",
									},
								},
							])
								listener(event);
						}
					}
					for (const listener of [...listeners])
						listener({ source: window, origin: location.origin, data });
				});
			},
		};
		globalThis.window = window;
		globalThis.location = location;
		const calls = [];
		let pingResponse = { ok: true };
		let dataResponse = { eventCount: 1, pageCount: 1 };
		let assistantResponse = { chatgpt: true, claude: false };
		let relayHealthUnavailable = false;
		const runtime = {
			id: bridgeId,
			sendMessage(id, message, callback) {
				calls.push({ id, type: message.type });
				if (!installed.includes(id)) {
					runtime.lastError = {
						message:
							"Could not establish connection. Receiving end does not exist.",
					};
					callback(undefined);
					delete runtime.lastError;
				} else if (message.type === "TABOT_PING") callback(pingResponse);
				else if (message.type === "GET_ASSISTANT_CONNECTIONS")
					callback(assistantResponse);
				else if (
					message.type === "GET_RELAY_HEALTH" &&
					relayHealthUnavailable
				) {
					runtime.lastError = {
						message:
							"Could not establish connection. Receiving end does not exist.",
					};
					callback(undefined);
					delete runtime.lastError;
				} else callback(dataResponse);
			},
		};
		globalThis.chrome = { runtime };
		await import(
			`../../../extension/contents/dashboard-discovery.ts?scenario=${scenario}`
		);
		const bridge = [...listeners][0];
		// Discovery never responds to foreign windows/origins or arbitrary messages.
		for (const event of [
			{
				source: {},
				origin: location.origin,
				data: { type: "TABOT_DISCOVER_EXTENSION" },
			},
			{
				source: window,
				origin: "https://evil.example",
				data: { type: "TABOT_DISCOVER_EXTENSION" },
			},
			{ source: window, origin: location.origin, data: { type: "GET_COUNTS" } },
		])
			bridge(event);
		assert.deepEqual(posted, []);
		assert.deepEqual(calls, []);

		const client = await import(`../lib/history.ts?scenario=${scenario}`);
		if (expected) {
			assert.equal((await client.readHistoryCounts()).pageCount, 1);
			assert.equal(calls.at(-1).id, expected);
		}
		assert.equal(await client.isTabotConnected(), Boolean(expected));
		assert.ok(calls.every(({ id }) => /^[a-p]{32}$/.test(id)));
		if (!expected) {
			await assert.rejects(
				client.readHistoryCounts(),
				client.ExtensionUnavailableError,
			);
			assert.deepEqual(await client.readRelayHealth(), {
				reachable: false,
				health: null,
				assistants: null,
			});
			return;
		}
		calls.length = 0;
		await client.readHistoryCounts();
		assert.deepEqual(calls, [{ id: expected, type: "GET_COUNTS" }]);
		// Valid legacy search rows stay readable; absent totals are unknown, not zero.
		dataResponse = {
			results: [],
			notes: [],
			searchStatus: { mode: "keyword", indexing: false, model: "not-loaded" },
		};
		const legacy = await client.searchRetainedPages("example");
		assert.equal(legacy.resultsTotal, null);
		assert.equal(legacy.notesTotal, null);
		dataResponse = { ...dataResponse, resultsTotal: 0, notesTotal: 0 };
		assert.equal((await client.searchRetainedPages("example")).resultsTotal, 0);
		// Sequential: invalid cases share mutable dataResponse.
		await [-1, 1.5, "0", null, Infinity].reduce(
			(previous, invalid) =>
				previous.then(async () => {
					const valid = dataResponse;
					dataResponse = { ...valid, resultsTotal: invalid };
					await assert.rejects(
						client.searchRetainedPages("example"),
						/incompatible/,
					);
					dataResponse = valid;
				}),
			Promise.resolve(),
		);
		dataResponse = {
			...dataResponse,
			results: [{ url: "javascript:alert(1)" }],
		};
		await assert.rejects(client.searchRetainedPages("example"), /incompatible/);
		// Storage errors must not select another database or retry a mutation.
		dataResponse = { ok: false, code: "storage-unavailable" };
		calls.length = 0;
		await assert.rejects(
			client.purgeStoredData(),
			/could not read local storage/,
		);
		assert.deepEqual(calls, [{ id: expected, type: "PURGE_DATA" }]);
		await [null, {}, { ok: false }, { ok: "true" }].reduce(
			(chain, response) =>
				chain.then(async () => {
					pingResponse = response;
					assert.equal(await client.isTabotConnected(), false);
				}),
			Promise.resolve(),
		);
		pingResponse = { ok: true };
		assert.equal(await client.isTabotConnected(), true);
		if (scenario === 1) {
			relayHealthUnavailable = true;
			assistantResponse = { chatgpt: false, claude: false };
			calls.length = 0;
			const unauthorized = await client.readRelayHealth();
			assert.equal(unauthorized.reachable, true);
			assert.equal(unauthorized.assistants?.chatgpt, false);
			assert.equal(
				calls.some(({ type }) => type === "GET_RELAY_HEALTH"),
				false,
			);

			assistantResponse = { chatgpt: true, claude: false };
			calls.length = 0;
			const oldExtension = await client.readRelayHealth();
			assert.equal(oldExtension.reachable, true);
			assert.equal(oldExtension.assistants?.chatgpt, true);
			assert.equal(oldExtension.health, null);
			assert.ok(calls.some(({ type }) => type === "GET_RELAY_HEALTH"));
		}
	};
	await scenarios.reduce(
		(chain, values) => chain.then(() => runScenario(values)),
		Promise.resolve(),
	);
} finally {
	hooks.deregister();
	Object.assign(globalThis, originals);
}
console.log(
	"Extension discovery: dynamic IDs, prod/dev origins, routing, recovery, and failure checks passed",
);
