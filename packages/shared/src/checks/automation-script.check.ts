import assert from "node:assert/strict";
import {
	isWorkflowAutomationScript,
	isWorkflowScriptDraft,
	isWorkflowScriptSaveGrant,
} from "../workflows/automation-script";

const origin = "https://www.google.com";
const script = {
	version: 1,
	name: "Search a topic",
	description: "Open search and verify its results page.",
	trigger: "manual",
	origins: [origin],
	inputs: [{ key: "query", label: "Search query", required: true }],
	steps: [
		{ type: "navigate", url: origin },
		{
			type: "fill",
			origin,
			target: { label: "Search query" },
			input: "query",
		},
		{
			type: "verify",
			origin,
			target: { role: "heading", name: "Search results" },
			condition: "visible",
		},
	],
} as const;

assert.equal(isWorkflowAutomationScript(script), true);
assert.equal(
	isWorkflowAutomationScript({ ...script, code: 'fetch("https://bad")' }),
	false,
);
assert.equal(
	isWorkflowAutomationScript({
		...script,
		steps: [{ type: "navigate", url: "https://other.example/" }],
	}),
	false,
);
assert.equal(
	isWorkflowAutomationScript({
		...script,
		steps: [{ type: "navigate", url: `${origin}/search?q=private` }],
	}),
	false,
);
assert.equal(
	isWorkflowAutomationScript({
		...script,
		inputs: [{ key: "password", label: "Account password", required: true }],
	}),
	false,
);
assert.equal(
	isWorkflowAutomationScript({
		...script,
		steps: Array(26).fill(script.steps[0]),
	}),
	false,
);
assert.equal(
	isWorkflowScriptDraft({
		id: "local-draft",
		candidateId: "handwired-v1-1234abcd",
		savedAt: Date.now(),
		status: "draft",
		script,
	}),
	true,
);
assert.equal(
	isWorkflowScriptSaveGrant({
		token: "12345678-1234-1234-1234-123456789012",
		candidateId: "handwired-v1-1234abcd",
		expiresAt: Date.now() + 60_000,
		origins: [origin],
		handoffDigest: "a".repeat(64),
	}),
	true,
);
assert.equal(
	isWorkflowScriptSaveGrant({
		token: "12345678-1234-1234-1234-123456789012",
		candidateId: "handwired-v1-1234abcd",
		expiresAt: Date.now() + 60_000,
		origins: ["https://unreviewed.example"],
		handoffDigest: "invalid",
	}),
	false,
);
console.log("Workflow script validation passed.");
