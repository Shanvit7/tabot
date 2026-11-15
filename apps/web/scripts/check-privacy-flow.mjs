// Run against a running web app: node apps/web/scripts/check-privacy-flow.mjs http://localhost:3101
import { execFileSync } from "node:child_process";

const browser = (...args) =>
	execFileSync("agent-browser", args, {
		encoding: "utf8",
		env: { ...process.env, AGENT_BROWSER_SESSION: "privacy-flow-check" },
	});

try {
	browser("set", "viewport", "1280", "800");
	browser(
		"open",
		new URL("privacy", `${process.argv[2] || "http://localhost:3000"}/`).href,
	);
	console.log(
		browser(
			"eval",
			`(async () => {
		const figure = document.querySelector('.privacy-flow');
		const wait = () => new Promise(resolve => setTimeout(resolve, 100));
		const check = (condition, message) => { if (!condition) throw Error(message); };
		figure.scrollIntoView({ behavior: 'instant', block: 'center' });
		await wait();
		const animations = figure.getAnimations({ subtree: true });
		check(animations.length === 4 && animations.every(a => a.effect.getTiming().iterations === Infinity), 'Expected repeating request, result, and gate animations');
		check(animations.every(a => a.playState === 'running'), 'Visible illustration should animate');
		figure.querySelector('button').click();
		await wait();
		check(animations.every(a => a.playState === 'paused'), 'Pause must persist');
		figure.querySelector('button').click();
		await wait();
		check(animations.every(a => a.playState === 'running'), 'Resume must restart animation');
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
		await wait();
		check(animations.every(a => a.playState === 'paused'), 'Offscreen illustration must pause');
		return 'Loop, pause/resume, and offscreen checks passed';
	})()`,
		),
	);
	browser("set", "viewport", "390", "844");
	console.log(
		browser(
			"eval",
			`(() => {
		if (document.documentElement.scrollWidth > innerWidth) throw Error('Mobile overflow');
		return 'Mobile fits';
	})()`,
		),
	);
} finally {
	browser("close");
}
