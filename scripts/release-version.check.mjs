// Changesets bumps extension and MCP packages independently after feature PRs merge.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readJson = (path) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("release package versions are valid and Plasmo owns the extension version", () => {
	const extension = readJson("../apps/extension/package.json");
	const mcp = readJson("../apps/mcp-server/package.json");
	const plugin = readJson(
		"../apps/mcp-server/submission/tabot-plugin/plugin.json",
	);
	const source = readFileSync(
		new URL("../packages/shared/src/version.ts", import.meta.url),
		"utf8",
	);

	assert.equal(
		extension.manifest.version,
		undefined,
		"Plasmo derives manifest.version from the package version.",
	);
	for (const [name, version] of [
		["extension", extension.version],
		["mcp-server", mcp.version],
		["chatgpt plugin", plugin.version],
	]) {
		assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must use semver.`);
	}
	assert.equal(
		plugin.version,
		mcp.version,
		"The plugin version must match the MCP server.",
	);
	assert.match(
		source,
		/TABOT_VERSION = "\d+\.\d+\.\d+"/,
		"shared TABOT_VERSION must use semver.",
	);
});
