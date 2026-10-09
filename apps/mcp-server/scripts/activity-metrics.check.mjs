// Local HTTP MCP check. No Worker deployment, real credentials, or browser history.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
	activityMetricsResponse,
	buildActivityMetrics,
	parseActivityMetricsInput,
} from "../../../packages/shared/src/activities/metrics.ts";

// Node has no Cloudflare runtime; only the unused base class needs a stand-in.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "cloudflare:workers")
			return {
				url: "data:text/javascript,export class DurableObject {}",
				shortCircuit: true,
			};
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (error.code === "ERR_UNSUPPORTED_DIR_IMPORT")
				return nextResolve(`${specifier}/index.ts`, context);
			throw error;
		}
	},
});
const [{ default: app }, { consentPage }] = await Promise.all([
	import("../src/index.ts"),
	import("../src/consent-page.tsx"),
]);
const consentHtml = consentPage({
	clientName: "<img src=x onerror=alert(1)>",
	extensionId: "test-extension",
	transactionId: "test-transaction",
}).toString();
assert.match(consentHtml, /&lt;img/);
assert.doesNotMatch(consentHtml, /<img src=x/);
assert.match(consentHtml, /runtime\.sendMessage/);
const from = Date.now() - 60_000;
const to = from + 50_000;
const events = [0, 1, 2].map((index) => ({
	id: `raw-${index}`,
	type: "NAVIGATION",
	tabId: 1,
	windowId: 1,
	timestamp: from + index * 10_000,
	url: index === 1 ? "https://b.test/private" : "https://a.test/?q=secret",
}));
let dispatches = 0;
let offline = false;
const env = {
	TABOT_AUTH: {
		idFromName: (name) => name,
		get: () => ({
			verifyAccessToken: async (token) =>
				token === "allowed" ? { installationId: "authorized-profile" } : null,
		}),
	},
	TABOT_INSTALLATION: {
		idFromName: (id) => {
			assert.equal(id, "authorized-profile");
			return id;
		},
		get: () => ({
			fetch: async (request) => {
				dispatches++;
				const { method, params } = await request.json();
				assert.ok(
					[
						"get_activity_metrics",
						"list_recurring_patterns",
						"get_memory",
					].includes(method),
				);
				if (offline)
					return Response.json({
						ok: false,
						error: { message: "Tabot extension is currently offline." },
					});
				if (method === "list_recurring_patterns") {
					assert.deepEqual(params, { limit: 1 });
					return Response.json({
						ok: true,
						result: {
							patterns: [{ id: "pattern-1", occurrenceCount: 2 }],
							truncated: false,
						},
					});
				}
				if (method === "get_memory") {
					assert.deepEqual(params, { id: "pattern-1" });
					return Response.json({
						ok: true,
						result: {
							id: "pattern-1",
							found: true,
							memory: {
								id: "pattern-1",
								occurrences: [
									{
										contextIds: ["context-1"],
										sequence: ["https://a.test", "https://b.test"],
										startTimestamp: from,
										endTimestamp: to,
									},
								],
							},
						},
					});
				}
				try {
					const input = parseActivityMetricsInput(params);
					return Response.json({
						ok: true,
						result: activityMetricsResponse(
							buildActivityMetrics(events, input.from, input.to),
							input.origin,
						),
					});
				} catch (error) {
					return Response.json({
						ok: false,
						error: { message: error.message },
					});
				}
			},
		}),
	},
};
let id = 0;
const rpc = async (method, params, token = "allowed") => {
	const response = await app.request(
		"https://test.invalid/mcp",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
		},
		env,
	);
	const text = await response.text();
	const data = text.startsWith("event:")
		? text
				.split("\n")
				.find((line) => line.startsWith("data:"))
				.slice(5)
				.trim()
		: text;
	return { status: response.status, body: JSON.parse(data) };
};
const list = await rpc("tools/list", {});
assert.equal(list.status, 200);
const tool = list.body.result.tools.find(
	(entry) => entry.name === "get_activity_metrics",
);
assert.ok(tool);
assert.deepEqual(tool.inputSchema.required, ["from", "to"]);
assert.equal(tool.annotations.readOnlyHint, true);
assert.equal(tool.annotations.destructiveHint, false);
assert.equal(list.body.result.tools.length, 7, "existing tools retained");
const patternsTool = list.body.result.tools.find(
	(entry) => entry.name === "list_recurring_patterns",
);
assert.ok(patternsTool);
assert.equal(patternsTool.annotations.readOnlyHint, true);
assert.equal(patternsTool.annotations.destructiveHint, false);
assert.equal(patternsTool.inputSchema.properties.limit.maximum, 20);
assert.match(
	list.body.result.tools.find((entry) => entry.name === "get_memory")
		.description,
	/occurrence timestamps/,
);
const call = (args, token) =>
	rpc("tools/call", { name: "get_activity_metrics", arguments: args }, token);
const result = await call({
	from,
	to,
	origin: "https://a.test",
	installationId: "untrusted-profile",
});
assert.equal(result.body.result.isError, undefined);
const metrics = JSON.parse(result.body.result.content[0].text);
assert.equal(metrics.sites.length, 1);
assert.equal(metrics.sites[0].estimatedActiveMs, 10_000);
assert.doesNotMatch(JSON.stringify(metrics), /secret|private|raw-/);
const before = dispatches;
for (const args of [
	{ from: to, to: from },
	{ from },
	{ from: -1, to },
	{ from, to, origin: "https://a.test/private" },
]) {
	const invalid = await call(args);
	assert.ok(invalid.body.error || invalid.body.result?.isError);
}
assert.equal(dispatches, before, "invalid schemas never dispatched");
for (const token of ["", "wrong"])
	assert.equal((await call({ from, to }, token)).status, 401);
assert.equal(dispatches, before, "unauthorized requests never dispatched");
assert.equal(
	(await call({ from, to: Date.now() + 60_000 })).body.result.isError,
	true,
	"device rejects future bounds",
);
assert.equal(
	JSON.parse((await call({ from: 0, to: 1 })).body.result.content[0].text)
		.summary.distinctSites,
	0,
);
const discover = (args, token) =>
	rpc(
		"tools/call",
		{ name: "list_recurring_patterns", arguments: args },
		token,
	);
const discovered = await discover({
	limit: 1,
	installationId: "untrusted-profile",
});
assert.deepEqual(JSON.parse(discovered.body.result.content[0].text).patterns, [
	{ id: "pattern-1", occurrenceCount: 2 },
]);
const memory = await rpc("tools/call", {
	name: "get_memory",
	arguments: { id: "pattern-1" },
});
assert.deepEqual(
	JSON.parse(memory.body.result.content[0].text).memory.occurrences[0].sequence,
	["https://a.test", "https://b.test"],
);
const beforePatterns = dispatches;
for (const limit of [0, 21, -1, 1.5, "2", null]) {
	const invalid = await discover({ limit });
	assert.ok(invalid.body.error || invalid.body.result?.isError);
}
for (const token of ["", "wrong"]) {
	assert.equal((await discover({ limit: 1 }, token)).status, 401);
	assert.equal(
		(
			await rpc(
				"tools/call",
				{ name: "get_memory", arguments: { id: "pattern-1" } },
				token,
			)
		).status,
		401,
	);
}
assert.equal(
	dispatches,
	beforePatterns,
	"invalid or unauthorized pattern requests never dispatched",
);
offline = true;
const patternFailure = await discover({ limit: 1 });
assert.equal(patternFailure.body.result.isError, true);
assert.match(patternFailure.body.result.content[0].text, /offline/);
const failed = await call({ from, to });
assert.equal(failed.body.result.isError, true);
assert.match(failed.body.result.content[0].text, /offline/);
console.log(
	"MCP checks passed: JSX consent rendering, escaped client name, metrics, patterns, auth, dispatch, and offline results.",
);
