import assert from "node:assert/strict";
import { isPageCaptureExcludedUrl, pageCaptureSite } from "./site-policy";

assert.deepEqual(pageCaptureSite("https://example.com/project?q=1"), {
	origin: "https://example.com",
	label: "example.com",
});
assert.equal(pageCaptureSite("chrome://extensions"), null);
assert.equal(pageCaptureSite("file:///tmp/page.html"), null);
assert.equal(pageCaptureSite("https://example.com", true), null);
assert.equal(isPageCaptureExcludedUrl("https://example.com/login"), true);
assert.equal(
	isPageCaptureExcludedUrl("https://github.com/acme/repo/pull/12"),
	false,
);
assert.equal(isPageCaptureExcludedUrl("https://1password.com/vault"), true);
console.log("page-capture-policy: eligible site and exclusions passed");
