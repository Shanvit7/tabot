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
let noteDispatches = 0;
const relatedActivity = {
	count: 1,
	nextCursor: null,
	matches: [
		{
			id: "related-id",
			kind: "page",
			matchedBy: ["same_site"],
			matchedAnchorIds: ["source-id"],
		},
	],
};
const activity = {
	count: 1,
	nextCursor: "1700000000000:3",
	results: [
		{
			site: "https://example.test",
			anchors: [{ kind: "event", id: "opaque-id", timestamp: 1 }],
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
				if (method === "search_notes" || method === "get_page_notes") {
					noteDispatches++;
					assert.deepEqual(
						params,
						method === "search_notes"
							? { query: "OAuth setup", limit: 4 }
							: { url: "https://example.test/docs" },
					);
					return Response.json({
						ok: true,
						result: {
							count: 1,
							notes: [
								{ id: "note-id", text: "OAuth setup", host: "example.test" },
							],
						},
					});
				}
				if (method === "search_activity") {
					dispatches++;
					assert.deepEqual(params, {
						query: "auth callback",
						limit: 3,
						...(dispatches === 2 ? { cursor: "1700000000000:3" } : {}),
					});
					return Response.json({
						ok: true,
						result:
							dispatches === 1 ? activity : { ...activity, nextCursor: null },
					});
				}
				relatedDispatches++;
				assert.ok(
					["find_activity_matches", "get_activity_timeline"].includes(method),
				);
				assert.deepEqual(params, {
					anchors: [{ kind: "page", id: "source-id" }],
					limit: 2,
				});
				return Response.json({
					ok: true,
					result:
						method === "get_activity_timeline"
							? { ...relatedActivity, items: relatedActivity.matches }
							: relatedActivity,
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
	[
		"search_activity",
		"find_activity_matches",
		"search_notes",
		"get_site_notes",
		"get_page_notes",
		"get_activity_timeline",
		"get_pending_workflow_handoff",
		"save_workflow_script",
	],
);
const searchTool = list.body.result.tools.find(
	(tool) => tool.name === "search_activity",
);
const saveTool = list.body.result.tools.find(
	(tool) => tool.name === "save_workflow_script",
);
assert.deepEqual(searchTool.inputSchema.required, ["query"]);
assert.equal(searchTool.inputSchema.properties.limit.maximum, 8);
assert.match(searchTool.inputSchema.properties.cursor.pattern, /\\d/);
assert.deepEqual(list.body.result.tools[2].inputSchema.required, ["query"]);
assert.deepEqual(list.body.result.tools[3].inputSchema.required, ["site"]);
assert.deepEqual(list.body.result.tools[4].inputSchema.required, ["url"]);
assert.deepEqual(list.body.result.tools[5].inputSchema.required, ["anchors"]);
assert.equal(
	list.body.result.tools[5].inputSchema.properties.anchors.maxItems,
	8,
);
assert.equal(
	list.body.result.tools[5].inputSchema.properties.maxGapHours.maximum,
	720,
);
assert.deepEqual(saveTool.inputSchema.required, [
	"candidateId",
	"grantToken",
	"handoffDigest",
	"script",
]);
assert.equal(saveTool.annotations.readOnlyHint, false);
assert.equal(saveTool.annotations.destructiveHint, false);
assert.doesNotMatch(saveTool.description, /run the script/i);
const result = await rpc("tools/call", {
	name: "search_activity",
	arguments: { query: "auth callback", limit: 3 },
});
const firstPage = JSON.parse(result.body.result.content[0].text);
assert.equal(firstPage.count, 1);
assert.equal(firstPage.nextCursor, "1700000000000:3");
const nextPage = await rpc("tools/call", {
	name: "search_activity",
	arguments: { query: "auth callback", limit: 3, cursor: firstPage.nextCursor },
});
assert.equal(JSON.parse(nextPage.body.result.content[0].text).nextCursor, null);
assert.equal(dispatches, 2);
const notesResult = await rpc("tools/call", {
	name: "search_notes",
	arguments: { query: "OAuth setup", limit: 4 },
});
assert.equal(JSON.parse(notesResult.body.result.content[0].text).count, 1);
const pageNotesResult = await rpc("tools/call", {
	name: "get_page_notes",
	arguments: { url: "https://example.test/docs" },
});
assert.equal(
	JSON.parse(pageNotesResult.body.result.content[0].text).notes[0].id,
	"note-id",
);
assert.equal(noteDispatches, 2);
const relatedResult = await rpc("tools/call", {
	name: "find_activity_matches",
	arguments: {
		anchors: [{ kind: "page", id: "source-id" }],
		limit: 2,
	},
});
assert.deepEqual(
	JSON.parse(relatedResult.body.result.content[0].text).matches[0].matchedBy,
	["same_site"],
);
assert.equal(relatedDispatches, 1);
const trailResult = await rpc("tools/call", {
	name: "get_activity_timeline",
	arguments: {
		anchors: [{ kind: "page", id: "source-id" }],
		limit: 2,
	},
});
assert.ok(JSON.parse(trailResult.body.result.content[0].text).items);
assert.equal(relatedDispatches, 2);
const invalidRelated = await rpc("tools/call", {
	name: "find_activity_matches",
	arguments: {
		anchors: [{ kind: "page", id: "source-id" }],
		maxGapHours: 721,
	},
});
assert.ok(invalidRelated.body.error || invalidRelated.body.result?.isError);
assert.equal(relatedDispatches, 2, "invalid activity inputs never dispatch");
const invalid = await rpc("tools/call", {
	name: "search_activity",
	arguments: { query: "x".repeat(201) },
});
assert.ok(invalid.body.error || invalid.body.result?.isError);
assert.equal(dispatches, 2, "invalid queries never dispatch");
assert.equal(
	(
		await rpc(
			"tools/call",
			{ name: "search_activity", arguments: { query: "ok" } },
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
	"MCP surface check passed: paginated search + local activity, bounded inputs, OAuth, and no legacy tools.",
);
