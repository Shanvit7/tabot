// Run preview first: pnpm --filter web prototype:activities
// Then: node apps/web/src/prototypes/activities/check.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const run = (...args) =>
	execFileSync(
		"agent-browser",
		["--session", "tabot-activities-check", ...args],
		{ encoding: "utf8", timeout: 40_000 },
	);
const evaluate = (source) => JSON.parse(run("eval", source));
try {
	for (const [variant, count] of [
		["A", 21],
		["B", 6],
		["C", 12],
	]) {
		run("set", "viewport", "1440", "1000");
		run("open", `http://localhost:3012/activities?variant=${variant}`);
		assert.equal(
			evaluate('document.querySelectorAll(".ap-node").length'),
			count,
		);
		run("click", ".ap-trail:nth-child(2)");
		assert.equal(
			evaluate('document.querySelector("#ap-detail-title").textContent'),
			"MDN",
		);
		run("click", ".ap-trail:nth-child(3)");
		assert.equal(
			evaluate('document.querySelector("#ap-quest-title").textContent'),
			"All trails uncovered.",
		);
		run("click", ".ap-primary");
		assert.equal(
			evaluate(
				'document.querySelector(".ap-primary").getAttribute("aria-pressed")',
			),
			"true",
		);
		run("reload");
		assert.equal(
			evaluate(
				'document.querySelector(".ap-primary").getAttribute("aria-pressed")',
			),
			"false",
		);
		assert.equal(
			evaluate('new URLSearchParams(location.search).get("variant")'),
			variant,
		);
		run("set", "viewport", "375", "812");
		assert.equal(
			evaluate("document.documentElement.scrollWidth > innerWidth"),
			false,
		);
		assert.equal(evaluate("document.getAnimations().length"), 0);
		assert.equal(
			evaluate(
				'performance.getEntriesByType("resource").filter(e => ["fetch", "xmlhttprequest"].includes(e.initiatorType)).length',
			),
			0,
		);
		const audit = JSON.parse(run("a11y", "--json"));
		assert.equal(
			audit.data.counts.violations,
			0,
			JSON.stringify(audit.data.violations),
		);
	}
	run("press", "ArrowRight");
	assert.equal(
		evaluate('new URLSearchParams(location.search).get("variant")'),
		"A",
	);
	run("press", "ArrowLeft");
	assert.equal(
		evaluate('new URLSearchParams(location.search).get("variant")'),
		"C",
	);
	run("set", "media", "reduced-motion", "reduce");
	run("click", ".ap-toolbar button:first-child");
	assert.equal(
		evaluate('document.querySelector(".ap-graph").dataset.motion'),
		"false",
	);
	assert.equal(
		evaluate(
			'document.getAnimations().filter(animation => animation.playState === "running").length',
		),
		0,
	);
	assert.equal(run("errors").trim(), "");
	console.log(
		"Activities prototype: selection, quest, memory-only saves, variant URLs, mobile, idle, reduced motion, and axe passed.",
	);
} finally {
	run("close");
}
