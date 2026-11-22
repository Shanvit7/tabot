import assert from "node:assert/strict";
import { createTelemetry, type TelemetryEvent } from "../telemetry";
import { createPostHogTransport } from "../telemetry/posthog";

const events: TelemetryEvent[] = [];
const telemetry = createTelemetry(
	{
		capture: (event) => {
			events.push(event);
		},
	},
	{ platform: "web_dashboard", release: "test-sha", environment: "test" },
);
const error = new TypeError(
	"render failed for user@example.com at https://private.example/x?token=secret id 123456789",
);
error.name = "Alice";
error.stack = [
	"TypeError: https://private.example/path?token=secret",
	"    at render (https://private.example/assets/chunk.js?token=secret:12:8)",
	"    at async https://private.example/assets/other.js:3:4",
].join("\n");
telemetry.captureError(error, "window_error");
telemetry.pageView("/settings");
telemetry.pageView("/user@example.com");
telemetry.captureAction({ name: "landing_add_to_chrome_clicked" });
telemetry.captureAction({ name: "landing_page_end_reached" });
assert.equal(events[0].type, "exception");
assert.equal(events[1].type, "page_view");
assert.equal(events[2].type, "page_view");
if (
	events[0].type !== "exception" ||
	events[1].type !== "page_view" ||
	events[2].type !== "page_view"
)
	throw new Error("unexpected telemetry event type");
assert.equal(
	events[0].exception.message,
	"render failed for <email> at <url> id <number>",
);
assert.equal(events[0].exception.frames[0]?.function, "render");
assert.equal(events[0].exception.frames[1]?.function, undefined);
assert.equal(events[0].exception.name, "Error");
assert.equal(events[0].exception.frames[0]?.filename, "chunk.js");
assert.equal(events[1].route, "/settings");
assert.equal(events[2].route, "/other");
assert.deepEqual(events[3]?.type === "action" ? events[3].action : null, {
	name: "landing_add_to_chrome_clicked",
});
assert.deepEqual(events[4]?.type === "action" ? events[4].action : null, {
	name: "landing_page_end_reached",
});
assert.doesNotMatch(
	JSON.stringify(events),
	/private\.example|secret|Alice|user@example\.com|123456789/,
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
assert.equal(modelFailure.exception.message, "model-load-failed");
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
	/private\.example|secret|Alice|user@example\.com|123456789/,
);
const landingCta = events[3];
if (landingCta?.type !== "action")
	throw new Error("landing CTA telemetry missing");
let actionPayload: Record<string, unknown> | undefined;
globalThis.fetch = async (_input, init) => {
	actionPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
	return new Response(null, { status: 200 });
};
try {
	await createPostHogTransport({
		projectKey: "test-key",
		distinctId: "tabot_web",
	}).capture(landingCta);
} finally {
	globalThis.fetch = originalFetch;
}
assert.equal(actionPayload?.event, "landing_add_to_chrome_clicked");
assert.deepEqual(actionPayload?.properties, {
	platform: "web_dashboard",
	$release_id: "test-sha",
	environment: "test",
	$process_person_profile: false,
	$lib: "@tabot/shared-telemetry",
});
assert.doesNotMatch(
	JSON.stringify(actionPayload),
	/private\.example|secret|Alice|user@example\.com|123456789/,
);
const errorWithoutStack = new TypeError(
	"bad input https://private.example/x?token=secret",
);
errorWithoutStack.stack = "";
telemetry.captureError(errorWithoutStack, "window_error", false, {
	filename: "https://private.example/assets/chunk.js?token=secret",
	lineno: 12,
	colno: 8,
});
const fallbackEvent = events.at(-1);
assert.equal(fallbackEvent?.type, "exception");
if (fallbackEvent?.type !== "exception")
	throw new Error("window error fallback trace missing");
assert.deepEqual(fallbackEvent.exception.frames, [
	{ filename: "chunk.js", lineno: 12, colno: 8, platform: "web:javascript" },
]);
assert.doesNotMatch(JSON.stringify(fallbackEvent), /private\.example|secret/);
let fallbackPayload: Record<string, unknown> | undefined;
globalThis.fetch = async (_input, init) => {
	fallbackPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
	return new Response(null, { status: 200 });
};
try {
	await createPostHogTransport({
		projectKey: "test-key",
		distinctId: "tabot_web",
	}).capture(fallbackEvent);
} finally {
	globalThis.fetch = originalFetch;
}
const fallbackProperties = fallbackPayload?.properties as Record<
	string,
	unknown
>;
const exceptionList = fallbackProperties?.$exception_list as Array<{
	stacktrace?: { frames?: Array<Record<string, unknown>> };
}>;
assert.deepEqual(exceptionList[0]?.stacktrace?.frames?.[0], {
	filename: "chunk.js",
	lineno: 12,
	colno: 8,
	platform: "web:javascript",
});
assert.doesNotMatch(JSON.stringify(fallbackPayload), /private\.example|secret/);
console.log(
	"telemetry: provider-neutral API, bounded routes, and sanitized PostHog exception payload passed",
);
