// Requires local web dev server and agent-browser. Run: node src/checks/hero-annotation.check.mjs [url]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const session = `hero-annotation-${process.pid}`;
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
const frame = (time) =>
	evaluate(`(() => {
	const scene = document.querySelector('.void-hero');
	scene.getAnimations({subtree: true}).forEach(animation => {
		animation.pause();
		animation.currentTime = ${time};
	});
	const pointer = [...scene.querySelectorAll('.void-pointer-reveal')]
		.find(node => getComputedStyle(node).display !== 'none');
	return [
		Number(getComputedStyle(scene.querySelector('.void-annotation-reveal')).opacity),
		parseFloat(getComputedStyle(pointer).strokeDashoffset),
		Number(getComputedStyle(scene.querySelector('.void-pointer-tip')).opacity),
	];
})()`);

try {
	browser("open", process.argv[2] ?? "http://127.0.0.1:3000/");
	browser(
		"wait",
		"--fn",
		"document.querySelector('.void-hero')?.dataset.intro === 'started'",
	);
	assert.deepEqual(
		evaluate(
			"[...document.querySelectorAll('.void-annotation tspan')].map(node => node.textContent.trim())",
		),
		["Lost in all that context?", "That little light is Tabot."],
	);
	assert.match(
		evaluate(
			"getComputedStyle(document.querySelector('.void-annotation text')).fontFamily",
		),
		/Clash Grotesk/,
	);
	for (const width of [1440, 390, 320]) {
		browser("set", "viewport", String(width), "940");
		assert.deepEqual(frame(0), [0, 1, 0]);
		const caption = frame(700);
		assert.ok(caption[0] > 0 && caption[0] < 1);
		assert.deepEqual(caption.slice(1), [1, 0]);
		const drawing = frame(1300);
		assert.equal(drawing[0], 1);
		assert.ok(drawing[1] > 0 && drawing[1] < 1);
		assert.equal(drawing[2], 0);
		assert.deepEqual(frame(2400), [1, 0, 1]);
		assert.equal(
			evaluate("document.documentElement.scrollWidth > innerWidth"),
			false,
		);
	}
	evaluate("window.scrollTo(0, 2000)");
	browser(
		"wait",
		"--fn",
		"document.querySelector('.void-hero').dataset.motion === 'paused'",
	);
	assert.equal(
		evaluate(`document.querySelector('.void-hero').getAnimations({subtree:true})
		.filter(animation => animation.animationName?.startsWith('void-caption') || animation.animationName?.startsWith('void-pointer'))
		.every(animation => animation.playState === 'paused')`),
		true,
	);
	evaluate("window.scrollTo(0, 0)");
	browser(
		"wait",
		"--fn",
		"document.querySelector('.void-hero').dataset.motion === 'running'",
	);
	assert.equal(
		evaluate(
			"Number(getComputedStyle(document.querySelector('.void-annotation-reveal')).opacity)",
		),
		1,
	);

	browser("set", "media", "light", "reduced-motion");
	assert.deepEqual(frame(0), [1, 0, 1]);
	browser("reload");
	browser("wait", "--fn", "!!document.querySelector('.void-annotation')");
	assert.deepEqual(frame(0), [1, 0, 1]);
	assert.equal(
		evaluate("document.querySelector('.void-hero').hasAttribute('data-intro')"),
		false,
	);
	console.log(
		"Hero annotation: approved copy, Clash, caption → dotted arrow → tip, desktop/mobile, offscreen pause, no replay and reduced motion passed.",
	);
} finally {
	browser("close");
}
