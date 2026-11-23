import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readJson = (path) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("release version stays aligned across product surfaces", () => {
	const extension = readJson("../apps/extension/package.json");
	const mcp = readJson("../apps/mcp-server/package.json");
	const plugin = readJson(
		"../apps/mcp-server/submission/tabot-plugin/plugin.json",
	);
	const source = readFileSync(
		new URL("../packages/shared/src/version.ts", import.meta.url),
		"utf8",
	);
	const sharedVersion = source.match(/TABOT_VERSION = "([^"]+)"/)?.[1];

	assert.equal(
		extension.manifest.version,
		undefined,
		"Plasmo derives manifest.version from the package version.",
	);
	assert.match(extension.version, /^\d+\.\d+\.\d+$/);
	assert.equal(
		mcp.version,
		extension.version,
		"MCP version must match extension.",
	);
	assert.equal(
		plugin.version,
		extension.version,
		"Plugin version must match extension.",
	);
	assert.equal(
		sharedVersion,
		extension.version,
		"Shared product version must match extension.",
	);
});
