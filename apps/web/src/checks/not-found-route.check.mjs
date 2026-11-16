// Requires the web dev server or a GitHub Pages-style static fallback server.
// Run: node src/checks/not-found-route.check.mjs [url]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const session = `not-found-route-${process.pid}`;
const browser = (...args) => {
	const response = JSON.parse(
		execFileSync("agent-browser", ["--session", session, "--json", ...args], {
			encoding: "utf8",
		}),
	);
	assert.equal(response.success, true, response.error);
	return response.data;
};
const evaluate = (script) => browser("eval", script).result;

try {
	browser("set", "viewport", "390", "844");
	browser("network", "route", "**/*.js", "--abort");
	browser("open", process.argv[2] ?? "http://127.0.0.1:4173/activities");
	assert.match(
		browser("get", "text", "h1").text,
		/404\. Looks like we took a wrong turn\./,
	);
	assert.equal(evaluate("location.pathname"), "/activities");
	browser("network", "unroute", "**/*.js");
	browser("reload");
	browser(
		"wait",
		"--fn",
		"document.querySelector('h1')?.textContent.includes('404.')",
	);
	assert.equal(evaluate("location.pathname"), "/activities");
	assert.match(evaluate("document.body.innerText"), /This page isn’t here/);
	console.log(
		"Mobile unknown path: prerendered 404 first paint and after hydration passed.",
	);
} finally {
	browser("close");
}
