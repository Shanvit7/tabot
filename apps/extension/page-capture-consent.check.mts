import assert from "node:assert/strict";
import {
	isPageCaptureExcludedUrl,
	MAX_CONSENTED_ORIGINS,
	normalizePageCaptureOrigins,
	pageCaptureSite,
} from "./page-capture-consent";

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
assert.deepEqual(
	normalizePageCaptureOrigins([
		"https://example.com",
		"https://example.com/path",
		"https://example.com",
		"javascript:alert(1)",
		...[...Array(MAX_CONSENTED_ORIGINS + 2)].map(
			(_, index) => `https://site${index}.example`,
		),
	]),
	[
		"https://example.com",
		...[...Array(MAX_CONSENTED_ORIGINS - 1)].map(
			(_, index) => `https://site${index}.example`,
		),
	],
);
console.log("page-capture-consent: origin validation passed");
