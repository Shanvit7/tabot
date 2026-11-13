import assert from "node:assert/strict";
import { createTelemetry, type TelemetryEvent } from "../telemetry";
import { createPostHogTransport } from "../telemetry/posthog";

const events: TelemetryEvent[] = [];
const telemetry = createTelemetry(
	{ capture: (event) => events.push(event) },
	{ platform: "web_dashboard", release: "test-sha", environment: "test" },
);
const error = new TypeError("account-reset");
error.name = "Alice";
error.stack = [
	"TypeError: https://private.example/path?token=secret",
	"    at render (https://private.example/assets/chunk.js?token=secret:12:8)",
].join("\n");
telemetry.captureError(error, "window_error");
telemetry.pageView("/settings");
telemetry.pageView("/user@example.com");
assert.equal(events[0].type, "exception");
assert.equal(events[1].type, "page_view");
assert.equal(events[2].type, "page_view");
if (
	events[0].type !== "exception" ||
	events[1].type !== "page_view" ||
	events[2].type !== "page_view"
)
	throw new Error("unexpected telemetry event type");
assert.equal(events[0].exception.message, "redacted");
assert.equal(events[0].exception.name, "Error");
assert.equal(events[0].exception.frames[0]?.filename, "chunk.js");
assert.equal(events[1].route, "/settings");
assert.equal(events[2].route, "/other");
assert.doesNotMatch(
	JSON.stringify(events),
	/private\.example|secret|account-reset|Alice|user@example\.com/,
);

assert.doesNotThrow(() =>
	telemetry.captureError(
		new Proxy(new Error("sensitive"), {
			getPrototypeOf: () => {
				throw new Error("proxy-trap");
			},
		}),
		"window_error",
	),
);
assert.equal(events.at(-1)?.type, "exception");
assert.doesNotMatch(JSON.stringify(events.at(-1)), /sensitive|proxy-trap/);
telemetry.captureError(
	new Error("model-load-failed"),
	"search_warmup_failed",
	true,
);
const modelFailure = events.at(-1);
assert.equal(modelFailure?.type, "exception");
if (modelFailure?.type !== "exception")
	throw new Error("embedding warmup failure telemetry missing");
assert.equal(modelFailure.source, "search_warmup_failed");
assert.equal(modelFailure.failureCode, "model-load-failed");
assert.equal(modelFailure.exception.message, "redacted");
const originalFetch = globalThis.fetch;
let captured: Record<string, unknown> | undefined;
globalThis.fetch = async (_input, init) => {
	captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
	return new Response(null, { status: 200 });
};
try {
	await createPostHogTransport({
		projectKey: "test-key",
		distinctId: "tabot_web",
	}).capture(modelFailure);
} finally {
	globalThis.fetch = originalFetch;
}
assert.equal(captured?.event, "$exception");
const properties = captured?.properties as Record<string, unknown>;
assert.equal(properties?.$release_id, "test-sha");
assert.equal(properties?.$process_person_profile, false);
assert.equal(properties?.error_source, "search_warmup_failed");
assert.equal(properties?.error_code, "model-load-failed");
assert.doesNotMatch(
	JSON.stringify(captured),
	/private\.example|secret|account-reset|Alice|user@example\.com/,
);
console.log(
	"telemetry: provider-neutral API, bounded routes, and sanitized PostHog exception payload passed",
);
