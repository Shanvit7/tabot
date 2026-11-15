// Release guard for the pre-bumped path: package versions, shared TABOT_VERSION
// and the ChatGPT plugin manifest must agree, and no pending changeset may
// silently re-price this release (for example 0.2.5 -> 0.2.6).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const readJson = (path) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("release version is prepared consistently and Changesets cannot bump it", () => {
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
		assert.equal(
			version,
			"0.2.5",
			`${name} must stay on the prepared release version.`,
		);
	}
	assert.match(
		source,
		/TABOT_VERSION = "0\.2\.5"/,
		"shared TABOT_VERSION must match the prepared release.",
	);

	const pending = readdirSync(new URL("../.changeset", import.meta.url)).filter(
		(file) => file.endsWith(".md") && file !== "README.md",
	);
	assert.deepEqual(
		pending,
		[],
		"A pending changeset would produce 0.2.6; keep release notes in CHANGELOG.md.",
	);
});
