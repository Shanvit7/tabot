// Run against a dev/preview server: node scripts/check-landing.mjs http://localhost:3000/
// Requires agent-browser on PATH. Synthetic UI only; never accesses extension data.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const session = `tabot-landing-check-${process.pid}`;
const url = process.argv[2] ?? "http://localhost:3000/";
const browser = (...args) => {
	const result = spawnSync("agent-browser", ["--session", session, ...args], {
		encoding: "utf8",
		timeout: 30_000,
	});
	assert.equal(
		result.status,
		0,
		result.stderr || result.stdout || result.error?.message,
	);
	return result.stdout;
};
const check = (expression, message) => {
	browser(
		"eval",
		`(async () => { if (!(${expression})) throw new Error(${JSON.stringify(message)}); return true; })()`,
	);
	console.log(`PASS: ${message}`);
};
const click = (role, name) =>
	browser("find", "role", role, "click", "--name", name, "--exact");

try {
	browser("set", "viewport", "1280", "900");
	browser("open", url);
	browser("wait", "#landing-title");
	browser("wait", '.void-hero[data-motion="running"]');
	check(
		`document.querySelectorAll('h1').length === 1 && document.querySelector('.liquid-header')`,
		"Landing renders with original topbar",
	);
	check(
		`Array.from(document.querySelectorAll('a.landing-install')).every(a => a.href.startsWith('https://chromewebstore.google.com/detail/tabot/')) && document.querySelectorAll('a.landing-install').length >= 2`,
		"Install actions use published Chrome Store listing",
	);
	check(
		`document.querySelectorAll('video, iframe').length === 0`,
		"No demo videos or external-site embeds",
	);
	check(
		`document.querySelectorAll('.void-stratum').length === 4 && document.querySelector('.void-orb') && document.querySelector('.void-hero').dataset.motion === 'running'`,
		"Approved terrain and illuminated orb render with active motion",
	);
	check(
		`!document.querySelector('.void-motion') && !document.querySelector('.landing-install svg')`,
		"Hero has no animation control or install-arrow icon",
	);
	check(
		`await (async () => { const orb = document.querySelector('.void-orb'); const before = getComputedStyle(orb).transform; await new Promise(resolve => setTimeout(resolve, 180)); return before !== getComputedStyle(orb).transform; })()`,
		"Orb animation advances between frames",
	);
	click("button", "Show the saved note");
	check(
		`document.querySelector('#scene-notes [role="status"]').textContent.includes('minimum order')`,
		"Notes example returns only selected sample note",
	);
	click("tab", "Site activity");
	click("button", "Show the activity result");
	check(
		`document.querySelector('#scene-activity [role="status"]').textContent.includes('14:10') && !document.querySelector('#scene-activity [role="status"]').textContent.includes('minimum order')`,
		"Activity example returns sites and times, not note text",
	);
	browser("press", "Shift+Tab");
	click("tab", "Local search");
	browser("find", "label", "Try a search", "fill", "zzzz-no-match");
	check(
		`document.querySelector('#scene-search [role="status"]').textContent.includes('No match')`,
		"Local sample handles no results",
	);
	browser("find", "label", "Try a search", "fill", "delivery");
	check(
		`document.querySelector('#scene-search [role="status"]').textContent.includes('1 result')`,
		"Local sample finds matching note",
	);
	click("tab", "Local search");
	browser("press", "ArrowLeft");
	check(
		`document.activeElement.id === 'task-activity' && document.activeElement.getAttribute('aria-selected') === 'true'`,
		"Arrow keys change selected task and retain focus",
	);
	browser(
		"eval",
		`document.querySelector('.landing-disclosure').querySelector('summary').click()`,
	);
	check(
		`document.querySelector('.landing-disclosure').open`,
		"Technical disclosure works",
	);
	click("button", "Run demo");
	check(
		`document.querySelector('.tabot-connection-figure').dataset.active === 'true'`,
		"Cutaway responds to sample request",
	);
	check(
		`document.querySelector('.void-hero').dataset.motion === 'paused'`,
		"Hero motion stops after scrolling offscreen",
	);
	browser("set", "media", "light", "reduced-motion");
	check(
		`getComputedStyle(document.querySelector('.landing-demo-enter')).animationName === 'none' && getComputedStyle(document.querySelector('.void-orb')).animationName === 'none' && getComputedStyle(document.querySelector('.void-stratum')).animationName === 'none' && !document.querySelector('.void-motion')`,
		"Reduced motion keeps complete static art and demo without loops",
	);
	browser("set", "viewport", "390", "844");
	browser("open", url);
	browser("wait", "#landing-title");
	check(
		`!location.pathname.endsWith('/mobile') && !!document.querySelector('#landing-title')`,
		"Mobile visitors retain public landing page",
	);
	browser(
		"eval",
		`document.querySelector('#how-it-works details > summary').click()`,
	);
	check(
		`document.body.innerText.includes('tabot-mcp.shanvit7.workers.dev/mcp') && location.pathname === '/'`,
		"Setup guide works inline on mobile without workspace redirect",
	);
	check(
		`document.documentElement.scrollWidth <= innerWidth`,
		"Mobile landing has no horizontal overflow",
	);
	browser(
		"eval",
		`document.querySelector('#see-it-work').scrollIntoView(); window.scrollBy(0, 48)`,
	);
	browser("wait", 'aside[aria-label="Install Tabot"]');
	check(
		`getComputedStyle(document.querySelector('aside[aria-label="Install Tabot"]')).position === 'fixed'`,
		"Mobile install action follows after hero",
	);
	browser("set", "viewport", "320", "800");
	check(
		`document.documentElement.scrollWidth <= innerWidth`,
		"Narrow 320px viewport has no horizontal overflow",
	);
	for (const [width, height] of [
		[320, 800],
		[390, 844],
		[768, 1024],
		[1440, 940],
	]) {
		browser("set", "viewport", String(width), String(height));
		browser("eval", "scrollTo(0, 0)");
		check(
			`(() => { const orb = document.querySelector('.void-orb > circle:nth-of-type(2)'); const point = new DOMPoint(641, 605).matrixTransform(orb.getScreenCTM()); const copy = document.querySelector('.void-copy').getBoundingClientRect(); const cta = document.querySelector('#hero-install').getBoundingClientRect(); const hero = document.querySelector('.void-hero').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && point.x > 28 && point.x < innerWidth - 28 && point.y > copy.bottom + 30 && point.y < cta.top - 30 && cta.bottom < hero.bottom; })()`,
			`${width}px hero keeps orb, copy and install action separate with no overflow`,
		);
	}
	console.log("Landing browser checks passed.");
} finally {
	browser("close");
}
