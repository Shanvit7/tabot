import assert from "node:assert/strict";
import {
	PAGE_MIN_INTERVAL_MS,
	PAGE_RESOURCE_DAILY_BYTES,
	PAGE_SITE_HOURLY_BYTES,
	pageObservationBudgetFailure,
	pageObservationSizeBytes,
} from "../pages/budget";
import {
	MAX_PAGE_OBSERVATION_BYTES,
	MAX_PAGE_SEGMENT_CHARS,
	normalizePageObservation,
	sanitizePageObservationForIngestion,
} from "../pages/observations";

const identity = "a".repeat(64);
const base = {
	id: "12345678-1234-1234-1234-123456789012",
	kind: "page-observation" as const,
	timestamp: 1_800_000_000_000,
	tabId: 4,
	windowId: 5,
	pageKey: identity,
	captureIdentity: "b".repeat(64),
	url: "https://example.com/tasks/john%40example.com?token=secret",
	trigger: "viewport-dwell" as const,
	segments: ["Contact john@example.com; API key: Abcdef1234567890"],
	coverage: { truncated: false, partial: false },
};
const clean = await sanitizePageObservationForIngestion(base);
assert.ok(clean.url?.startsWith("https://example.com/"));
assert.equal(clean.url?.includes("john@example.com"), false);
assert.equal(clean.segments[0].includes("john@example.com"), false);
assert.equal(clean.privacy.redacted, true);
assert.ok(clean.privacy.findings.includes("SECRET"));
assert.equal(clean.segments[0].includes("Abcdef1234567890"), false);
assert.ok(!JSON.stringify(clean).includes("secret"));
assert.ok(!JSON.stringify(clean).includes("john@example.com"));
assert.equal(
	normalizePageObservation(clean).captureIdentity,
	base.captureIdentity,
);
await assert.rejects(
	sanitizePageObservationForIngestion({
		...base,
		segments: ["x".repeat(MAX_PAGE_SEGMENT_CHARS + 1)],
	}),
	/page-segment-too-large/,
);
assert.throws(
	() => normalizePageObservation({ ...clean, pageKey: "raw-url" }),
	/invalid-page-observation/,
);
assert.ok(JSON.stringify(clean).length * 2 + 256 <= MAX_PAGE_OBSERVATION_BYTES);
const size = pageObservationSizeBytes(clean);
assert.equal(
	pageObservationBudgetFailure(clean, {
		resourceBytes: PAGE_RESOURCE_DAILY_BYTES - size,
		siteBytes: 0,
		recentTimestamps: [],
	}),
	null,
);
assert.equal(
	pageObservationBudgetFailure(clean, {
		resourceBytes: PAGE_RESOURCE_DAILY_BYTES - size + 1,
		siteBytes: 0,
		recentTimestamps: [],
	}),
	"resource-budget-limit",
);
assert.equal(
	pageObservationBudgetFailure(clean, {
		resourceBytes: 0,
		siteBytes: PAGE_SITE_HOURLY_BYTES - size + 1,
		recentTimestamps: [],
	}),
	"site-budget-limit",
);
assert.equal(
	pageObservationBudgetFailure(clean, {
		resourceBytes: 0,
		siteBytes: 0,
		recentTimestamps: [clean.timestamp - PAGE_MIN_INTERVAL_MS + 1],
	}),
	"content-rate-limit",
);
console.log("page-observations: validation and redaction passed");
