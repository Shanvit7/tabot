import assert from "node:assert/strict";
import type { WorkflowCandidate } from "../workflows/discovery";
import {
	buildWorkflowHandoff,
	isWorkflowHandoff,
	workflowHandoffDigest,
} from "../workflows/workflow-handoff";

const candidate: WorkflowCandidate = {
	id: "handwired-v1-1234abcd",
	steps: [
		{ origin: "https://linkedin.com", host: "linkedin.com" },
		{ origin: "https://google.com", host: "google.com" },
		{ origin: "https://linkedin.com", host: "linkedin.com" },
	],
	occurrences: [
		{ sourceIds: ["a", "b"], startedAt: 100, timestamp: 200 },
		{ sourceIds: ["c", "d"], startedAt: 300, timestamp: 400 },
	],
	modelMatches: 4,
	firstAt: 100.5,
	lastAt: 400.25,
};

const payload = buildWorkflowHandoff(candidate);
assert.deepEqual(payload, {
	candidateId: candidate.id,
	sites: ["https://linkedin.com", "https://google.com", "https://linkedin.com"],
	occurrences: 2,
	modelMatches: 4,
	firstAt: 100.5,
	lastAt: 400.25,
	evidenceType: "site-navigation-only",
});
assert.equal(JSON.stringify(payload).includes("sourceIds"), false);
assert.equal(JSON.stringify(payload).includes("linkedin.com/feed"), false);

const handoffDigest = await workflowHandoffDigest(payload);
assert.match(handoffDigest, /^[a-f0-9]{64}$/);
assert.notEqual(
	await workflowHandoffDigest({
		...payload,
		occurrences: payload.occurrences + 1,
	}),
	handoffDigest,
);

const grant = {
	token: "123e4567-e89b-42d3-a456-426614174000",
	candidateId: candidate.id,
	expiresAt: Date.now() + 60_000,
	origins: [...new Set(payload.sites)],
	handoffDigest,
};
assert.equal(isWorkflowHandoff({ payload, grant }), true);
assert.equal(
	isWorkflowHandoff({
		payload,
		grant: { ...grant, candidateId: "handwired-v1-deadbeef" },
	}),
	false,
);
assert.equal(
	isWorkflowHandoff({
		payload: { ...payload, title: "private page title" },
		grant,
	}),
	false,
);
