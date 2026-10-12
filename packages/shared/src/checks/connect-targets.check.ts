import assert from "node:assert/strict";
import {
	chatGptConnectPromptUrl,
	resolveChatGptConnectUrl,
} from "../share/targets.ts";

const prompt = new URL(chatGptConnectPromptUrl()).searchParams.get("q") ?? "";
assert.doesNotMatch(prompt, /Plugin Creator/);
assert.match(prompt, /Add button at the top right, then Add custom MCP server/);
assert.doesNotMatch(prompt, /\+ button/);
assert.match(prompt, /Name Tabot/);
assert.match(
	prompt,
	/Search and recall your locally stored Chrome browsing context/,
);
assert.match(prompt, /recurring browsing patterns/);
assert.match(prompt, /Server URL \(not Tunnel\)/);
assert.match(prompt, /Authentication to OAuth/);
assert.match(prompt, /Advanced OAuth settings unchanged/);
assert.match(prompt, /risk warning and check the acknowledgment/);
assert.match(prompt, /separate step to add\/create\/install/);
assert.doesNotMatch(prompt, /plugin_asdk_app/);
assert.match(prompt, /https:\/\/tabot-mcp\.shanvit7\.workers\.dev\/mcp/);

const originalFetch = globalThis.fetch;
try {
	globalThis.fetch = async () =>
		Response.json({ marketplaceUrl: "https://chatgpt.com/g/tabot" });
	assert.equal(await resolveChatGptConnectUrl(), "https://chatgpt.com/g/tabot");

	globalThis.fetch = async () =>
		Response.json({ marketplaceUrl: "https://evil.example/phishing" });
	assert.equal(await resolveChatGptConnectUrl(), chatGptConnectPromptUrl());

	globalThis.fetch = async () => {
		throw new Error("offline");
	};
	assert.equal(await resolveChatGptConnectUrl(), chatGptConnectPromptUrl());
} finally {
	globalThis.fetch = originalFetch;
}

console.log("ChatGPT connect targets: ok");
