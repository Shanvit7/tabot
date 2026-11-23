import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const readJson = (path) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const extension = readJson("../apps/extension/package.json");
const mcp = readJson("../apps/mcp-server/package.json");
const version = extension.version;
assert.match(version, /^\d+\.\d+\.\d+$/, "Extension version must use semver.");
assert.equal(mcp.version, version, "Extension and MCP versions must match.");

const sharedPath = new URL(
	"../packages/shared/src/version.ts",
	import.meta.url,
);
const sharedSource = readFileSync(sharedPath, "utf8");
assert.match(sharedSource, /export const TABOT_VERSION = "[^"]+";/);
writeFileSync(
	sharedPath,
	sharedSource.replace(
		/export const TABOT_VERSION = "[^"]+";/,
		`export const TABOT_VERSION = "${version}";`,
	),
);

const pluginPath = new URL(
	"../apps/mcp-server/submission/tabot-plugin/plugin.json",
	import.meta.url,
);
const pluginSource = readFileSync(pluginPath, "utf8");
const pluginVersionPattern = /^(\s*"version"\s*:\s*")[^"]+("\s*,?)/m;
assert.match(pluginSource, pluginVersionPattern);
writeFileSync(
	pluginPath,
	pluginSource.replace(pluginVersionPattern, `$1${version}$2`),
);
