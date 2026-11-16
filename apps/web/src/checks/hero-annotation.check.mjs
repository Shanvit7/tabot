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
		["Lost in a stack of context?", "That light is Tabot."],
	);
	assert.match(
		evaluate(
			"getComputedStyle(document.querySelector('.void-annotation text')).fontFamily",
		),
		/Clash Grotesk/,
	);
	assert.equal(
		evaluate(
			"getComputedStyle(document.querySelector('.void-annotation text')).fontSize",
		),
		"14px",
	);
	for (const width of [1440, 390, 320]) {
		browser("set", "viewport", String(width), "940");
		// First paint matches the intro: arrow draws before any caption appears.
		evaluate("delete document.querySelector('.void-hero').dataset.intro");
		assert.deepEqual(frame(0), [0, 1, 0]);
		evaluate("document.querySelector('.void-hero').dataset.intro = 'started'");
		assert.deepEqual(frame(0), [0, 1, 0]);
		const drawing = frame(850);
		assert.equal(drawing[0], 0);
		assert.ok(drawing[1] > 0 && drawing[1] < 1);
		assert.equal(drawing[2], 0);
		assert.deepEqual(frame(1500), [0, 0, 1]);
		const caption = frame(1700);
		assert.ok(caption[0] > 0 && caption[0] < 1);
		assert.deepEqual(caption.slice(1), [0, 1]);
		assert.deepEqual(frame(2000), [1, 0, 1]);
		assert.equal(
			evaluate(
				"getComputedStyle(document.querySelector('.void-annotation text')).fill === getComputedStyle(document.querySelector('.void-annotation tspan:last-child')).fill",
			),
			true,
		);
		if (width < 768) {
			assert.deepEqual(
				evaluate(`document.querySelector('.void-art').getAnimations({subtree:true})
					.filter(animation => !animation.animationName.startsWith('void-pointer') && animation.animationName !== 'void-caption-in')
					.map(animation => [animation.animationName, animation.effect.getTiming().duration])`),
				[["void-float-mobile", 8000]],
			);
			assert.equal(
				evaluate(
					"[...document.querySelectorAll('.void-stratum')].every(node => getComputedStyle(node).transform === 'none')",
				),
				true,
			);
			assert.equal(
				evaluate(
					"getComputedStyle(document.querySelector('.void-orb > circle[filter]')).display",
				),
				"none",
			);
		}
		assert.equal(
			evaluate("document.documentElement.scrollWidth > innerWidth"),
			false,
		);
	}
	browser("set", "viewport", "1440", "940");
	frame(2400);
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

	browser("set", "viewport", "390", "844");
	browser("set", "media", "light", "reduced-motion");
	assert.equal(
		evaluate(
			"document.querySelector('.void-art').getAnimations({subtree:true}).length",
		),
		0,
	);
	assert.deepEqual(frame(0), [1, 0, 1]);
	browser("reload");
	browser("wait", "--fn", "!!document.querySelector('.void-annotation')");
	assert.deepEqual(frame(0), [1, 0, 1]);
	assert.equal(
		evaluate("document.querySelector('.void-hero').hasAttribute('data-intro')"),
		false,
	);
	console.log(
		"Hero: arrow before dark caption, stable first frame, gentle mobile drift, offscreen pause, no replay and reduced motion passed.",
	);
} finally {
	browser("close");
}
