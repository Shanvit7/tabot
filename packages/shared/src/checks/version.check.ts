import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TABOT_VERSION } from "../version";

const readJson = (path: string) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Record<
		string,
		unknown
	>;

const extension = readJson("../../../../apps/extension/package.json");
const extensionManifest = extension.manifest as Record<string, unknown>;
const mcpServer = readJson("../../../../apps/mcp-server/package.json");
const plugin = readJson(
	"../../../../apps/mcp-server/submission/tabot-plugin/plugin.json",
);

assert.equal(
	extension.version,
	TABOT_VERSION,
	"extension package version is out of sync",
);
assert.equal(
	extensionManifest.version,
	TABOT_VERSION,
	"extension manifest version is out of sync",
);
assert.equal(
	mcpServer.version,
	TABOT_VERSION,
	"MCP package version is out of sync",
);
assert.equal(
	plugin.version,
	TABOT_VERSION,
	"ChatGPT plugin version is out of sync",
);

console.info(`Tabot version ${TABOT_VERSION} is in sync.`);
