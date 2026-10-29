// Local MCP surface check. No Worker deployment, credentials, or browser history.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

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
const { default: app } = await import("../src/index.ts");
let dispatches = 0;
let relatedDispatches = 0;
const relatedEvidence = {
	ranker: "heuristic-v1",
	count: 1,
	nextCursor: null,
	candidatePoolLimited: false,
	results: [{ id: "related-id", kind: "page", signals: ["same_url"] }],
};
const evidence = {
	count: 1,
	nextCursor: "1700000000000:3",
	results: [
		{
			origin: "https://example.test",
			sources: [{ kind: "event", id: "opaque-id", timestamp: 1 }],
		},
	],
};
const env = {
	TABOT_PUBLIC_RATE_LIMITER: { limit: async () => ({ success: true }) },
	TABOT_API_RATE_LIMITER: { limit: async () => ({ success: true }) },
	TABOT_AUTH: {
		idFromName: (id) => id,
		get: () => ({
			verifyAccessToken: async (token) =>
				token === "allowed"
					? {
							installationId: "authorized-profile",
							resource: "https://test.invalid/mcp",
							scopes: ["tabot.context"],
						}
					: null,
		}),
	},
	TABOT_INSTALLATION: {
		idFromName: (id) => id,
		get: () => ({
			fetch: async (request) => {
				const { method, params } = await request.json();
				if (method === "search_evidence") {
					dispatches++;
					assert.deepEqual(params, {
						query: "auth callback",
						limit: 3,
						...(dispatches === 2 ? { cursor: "1700000000000:3" } : {}),
					});
					return Response.json({
						ok: true,
						result:
							dispatches === 1 ? evidence : { ...evidence, nextCursor: null },
					});
				}
				relatedDispatches++;
				assert.ok(["find_related_evidence", "get_evidence_trail"].includes(method));
				assert.deepEqual(params, {
					sources: [{ kind: "page", id: "source-id" }],
					limit: 2,
				});
				return Response.json({
					ok: true,
					result:
						method === "get_evidence_trail"
							? { ...relatedEvidence, trail: relatedEvidence.results }
							: relatedEvidence,
				});
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
assert.deepEqual(
	list.body.result.tools.map((tool) => tool.name),
	["search_evidence", "find_related_evidence", "get_evidence_trail"],
);
assert.deepEqual(list.body.result.tools[0].inputSchema.required, ["query"]);
assert.equal(list.body.result.tools[0].inputSchema.properties.limit.maximum, 8);
assert.match(
	list.body.result.tools[0].inputSchema.properties.cursor.pattern,
	/\\d/,
);
assert.deepEqual(list.body.result.tools[1].inputSchema.required, ["sources"]);
assert.equal(
	list.body.result.tools[1].inputSchema.properties.sources.maxItems,
	8,
);
assert.equal(
	list.body.result.tools[1].inputSchema.properties.maxGapHours.maximum,
	720,
);
const result = await rpc("tools/call", {
	name: "search_evidence",
	arguments: { query: "auth callback", limit: 3 },
});
const firstPage = JSON.parse(result.body.result.content[0].text);
assert.equal(firstPage.count, 1);
assert.equal(firstPage.nextCursor, "1700000000000:3");
const nextPage = await rpc("tools/call", {
	name: "search_evidence",
	arguments: { query: "auth callback", limit: 3, cursor: firstPage.nextCursor },
});
assert.equal(JSON.parse(nextPage.body.result.content[0].text).nextCursor, null);
assert.equal(dispatches, 2);
const relatedResult = await rpc("tools/call", {
	name: "find_related_evidence",
	arguments: {
		sources: [{ kind: "page", id: "source-id" }],
		limit: 2,
	},
});
assert.equal(
	JSON.parse(relatedResult.body.result.content[0].text).ranker,
	"heuristic-v1",
);
assert.equal(relatedDispatches, 1);
const trailResult = await rpc("tools/call", {
	name: "get_evidence_trail",
	arguments: {
		sources: [{ kind: "page", id: "source-id" }],
		limit: 2,
	},
});
assert.ok(JSON.parse(trailResult.body.result.content[0].text).trail);
assert.equal(relatedDispatches, 2);
const invalidRelated = await rpc("tools/call", {
	name: "find_related_evidence",
	arguments: {
		sources: [{ kind: "page", id: "source-id" }],
		maxGapHours: 721,
	},
});
assert.ok(invalidRelated.body.error || invalidRelated.body.result?.isError);
assert.equal(relatedDispatches, 2, "invalid relatedness inputs never dispatch");
const invalid = await rpc("tools/call", {
	name: "search_evidence",
	arguments: { query: "x".repeat(201) },
});
assert.ok(invalid.body.error || invalid.body.result?.isError);
assert.equal(dispatches, 2, "invalid queries never dispatch");
assert.equal(
	(
		await rpc(
			"tools/call",
			{ name: "search_evidence", arguments: { query: "ok" } },
			"bad",
		)
	).status,
	401,
);
assert.equal(dispatches, 2, "unauthorized calls never dispatch");
for (const obsolete of [
	"search_context",
	"get_recent_context",
	"get_current_context",
	"get_context",
	"get_memory",
	"list_recurring_patterns",
	"get_activity_metrics",
	"record_relatedness_feedback",
])
	assert.ok(!list.body.result.tools.some((tool) => tool.name === obsolete));
console.log(
	"MCP surface check passed: paginated search + related evidence, bounded inputs, OAuth, and no legacy tools.",
);
