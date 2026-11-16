// Requires local web dev server and agent-browser. Run: node src/checks/automation-figure.check.mjs [url]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const session = `automation-check-${process.pid}`;
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
const waitForMotion = (state) =>
	browser(
		"wait",
		"--fn",
		`document.querySelector('.automation-scene').dataset.motion === '${state}'`,
	);
const pose = (time) =>
	evaluate(`(() => {
	const scene = document.querySelector('.automation-scene');
	scene.getAnimations({subtree:true}).forEach(animation => { animation.pause(); animation.currentTime = ${time}; });
	return [...scene.querySelectorAll('circle.automation-step-done')].map(node => Number(getComputedStyle(node).opacity));
})()`);

try {
	browser("open", process.argv[2] ?? "http://127.0.0.1:3000/");
	browser("set", "viewport", "1440", "1000");
	browser("wait", "--fn", "!!document.querySelector('.automation-scene')");
	assert.equal(
		evaluate(
			`document.querySelector('#automations').textContent.includes('not available yet')`,
		),
		false,
	);
	assert.equal(
		evaluate(
			`document.querySelector('#automations').textContent.includes('Coming soon')`,
		),
		false,
	);
	evaluate(
		`document.querySelector('.automation-scene').scrollIntoView({block:'center'})`,
	);
	waitForMotion("running");
	assert.equal(
		evaluate(`document.querySelectorAll('.automation-scene button').length`),
		0,
	);
	assert.equal(
		evaluate(`document.querySelector('.automation-figure').getAnimations({subtree:true}).every(animation => {
			const timing = animation.effect.getTiming();
			return timing.iterations === Infinity && timing.duration <= 5000 && timing.fill === 'none';
		})`),
		true,
	);
	assert.deepEqual(pose(0), [0, 0, 0]);
	assert.deepEqual(pose(1920), [1, 0, 0]);
	assert.deepEqual(pose(2496), [1, 1, 0]);
	assert.deepEqual(pose(3072), [1, 1, 1]);
	assert.deepEqual(pose(4800), [0, 0, 0]);
	evaluate("window.scrollTo(0, 0)");
	waitForMotion("paused");

	browser("set", "viewport", "390", "844");
	evaluate(
		`document.querySelector('.automation-scene').scrollIntoView({block:'center'})`,
	);
	waitForMotion("running");
	assert.equal(
		evaluate("document.documentElement.scrollWidth > innerWidth"),
		false,
	);
	browser("set", "media", "light", "reduced-motion");
	assert.equal(
		evaluate(
			`document.querySelector('.automation-scene').getAnimations({subtree:true}).length`,
		),
		0,
	);
	assert.deepEqual(
		evaluate(
			`[...document.querySelectorAll('circle.automation-step-done')].map(node => Number(getComputedStyle(node).opacity))`,
		),
		[1, 1, 1],
	);
	console.log(
		"Automation illustration: no controls, looping sequence, offscreen, mobile, reduced motion passed.",
	);
} finally {
	browser("close");
}
