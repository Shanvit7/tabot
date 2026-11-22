// Requires a running web dev server + agent-browser. Uses synthetic data only.
// Run: node apps/web/src/checks/home-results.browser.check.mjs [http://localhost:3000]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const session = `tabot-home-check-${process.pid}`;
const browser = (...args) => {
	const response = JSON.parse(
		execFileSync("agent-browser", ["--session", session, "--json", ...args], {
			encoding: "utf8",
		}),
	);
	assert.equal(response.success, true, response.error);
	return response.data?.result;
};
const evaluate = (script) => browser("eval", script);
const wait = (script) => browser("wait", "--fn", `Boolean(${script})`);
const fixture = () => {
	const now = Date.now() - 1000;
	const pages = Array.from({ length: 45 }, (_, n) => ({
		url: `https://example.com/page-${n}`,
		host: "example.com",
		firstSeen: now,
		lastSeen: now,
		eventCount: 1,
		pageCount: 0,
		sourceCount: 1,
		score: 45 - n,
		excerpt: "Synthetic regression fixture",
		pageExcerptAvailable: false,
		evidenceKinds: ["url-only"],
		matchedTerms: ["example"],
		sources: [],
	}));
	const notes = pages.map((page, n) => ({
		id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
		text: `Synthetic note ${n}`,
		createdAt: now,
		updatedAt: now,
		url: page.url,
		host: page.host,
		site: "example.com",
		title: `Fixture ${n}`,
		favicon: null,
		session: null,
	}));
	const sites = Array.from({ length: 5 }, (_, n) => ({
		site: `example${n}.com`,
		url: `https://example${n}.com/`,
		pageCount: 9,
		noteCount: 9,
		lastSeen: now,
	}));
	window.__fixture = { requests: [], legacy: true, fail: false };
	window.chrome ??= {};
	window.chrome.runtime = {
		sendMessage(_id, message, callback) {
			window.__fixture.requests.push(message);
			setTimeout(() => {
				switch (message.type) {
					case "TABOT_PING":
						return callback({ ok: true });
					case "GET_COUNTS":
						return callback({ eventCount: 45, pageCount: 45 });
					case "PRELOAD_SEARCH_MODEL":
						return callback({ preloadStarted: true });
					case "UPDATE_NOTE":
						window.__fixture.pendingSave = () =>
							callback({
								note: {
									id: message.id,
									text: message.text,
									updatedAt: Date.now(),
								},
							});
						return;
					case "SEARCH_HISTORY": {
						if (window.__fixture.fail)
							return callback({ ok: false, code: "search-unavailable" });
						const offset = message.offset ?? 0;
						const noteOffset = message.noteOffset ?? 0;
						return callback({
							results: pages.slice(offset, offset + 20),
							notes: notes.slice(noteOffset, noteOffset + 20),
							searchStatus: {
								mode: "keyword",
								indexing: false,
								model: "not-loaded",
							},
							...(!window.__fixture.legacy
								? { resultsTotal: pages.length, notesTotal: notes.length }
								: {}),
						});
					}
					case "BROWSE_LIBRARY": {
						const rows =
							message.level === "sites"
								? sites
								: pages.map((p) => ({
										...p,
										site: "example.com",
										noteCount: 1,
									}));
						const offset = message.offset ?? 0;
						return callback({
							sites:
								message.level === "sites"
									? rows.slice(offset, offset + 20)
									: [],
							pages:
								message.level === "pages"
									? rows.slice(offset, offset + 20)
									: [],
							notes: [],
							total: rows.length,
							hasMore: offset + 20 < rows.length,
						});
					}
					default:
						return callback({ ok: true });
				}
			}, 10);
		},
	};
};
const tab = (name) => browser("click", `#search-tab-${name.toLowerCase()}`);
try {
	browser("open", `${process.argv[2] ?? "http://localhost:3000"}/home`);
	browser("wait", "--url", "**/extension-not-connected*");
	wait(
		'[...document.querySelectorAll("button")].some(button => button.textContent.includes("Check connection"))',
	);
	evaluate(`(${fixture.toString()})()`);
	browser("find", "role", "button", "click", "--name", "Check connection");
	browser("wait", "--url", "**/home*");
	browser("fill", 'input[type="search"]', "example");
	wait(
		`document.querySelector('ul[aria-label="Matching pages"] li[data-index]')`,
	);
	assert.equal(
		evaluate(
			'document.body.innerText.includes("Search response is incompatible")',
		),
		false,
	);
	// Counts can load while Sites stays hidden; visibility must mount measurable rows.
	for (const name of ["Sites", "Everything", "Sites"]) {
		tab(name);
		if (name === "Sites") {
			wait('document.querySelector("ul[aria-label=Sites] li[data-index]")');
			assert.equal(
				evaluate(
					'document.querySelector("ul[aria-label=Sites]").clientHeight > 0',
				),
				true,
			);
		}
		assert.equal(
			evaluate('document.querySelector("[role=tab][aria-selected=true]").id'),
			`search-tab-${name.toLowerCase()}`,
		);
	}
	// Roving focus: arrows move focus without activating; Enter selects.
	browser("focus", "#search-tab-sites");
	browser("press", "ArrowRight");
	assert.equal(evaluate("document.activeElement.id"), "search-tab-pages");
	assert.equal(
		evaluate('document.querySelector("[role=tab][aria-selected=true]").id'),
		"search-tab-sites",
	);
	assert.equal(
		evaluate(
			'[...document.querySelectorAll("[role=tab]")].filter(tab=>tab.tabIndex===0).length',
		),
		1,
	);
	browser("press", "Enter");
	wait(
		'document.querySelector("#search-tab-pages").getAttribute("aria-selected")==="true"',
	);
	tab("Sites");
	wait('document.querySelector("ul[aria-label=Sites] li[data-index]")');
	assert.equal(evaluate("document.activeElement.id"), "search-tab-sites");
	browser("click", '[aria-label="Browse pages on example0.com"]');
	wait(`document.querySelector('[aria-label="Library breadcrumb"]')`);
	browser("click", '[aria-label="Library breadcrumb"] button');
	wait('document.querySelector("ul[aria-label=Sites] li[data-index]")');
	for (const [name, list, offset] of [
		["Pages", "pages", "offset"],
		["Notes", "notes", "noteOffset"],
	]) {
		tab(name);
		for (const cursor of [20, 40]) {
			evaluate(
				`document.querySelector('ul[aria-label="Matching ${list}"]').scrollTo(0,100000)`,
			);
			wait(
				`window.__fixture.requests.some(m=>m.type==="SEARCH_HISTORY"&&m.${offset}===${cursor})`,
			);
		}
		wait(
			`document.querySelector('ul[aria-label="Matching ${list}"]').scrollHeight > 5000`,
		);
		const mounted = evaluate(
			`document.querySelectorAll('ul[aria-label="Matching ${list}"] li[data-index]').length`,
		);
		assert.ok(
			mounted > 0 && mounted < 20,
			`virtualization must bound ${list} DOM rows: ${mounted}`,
		);
	}
	// New server totals must produce exact badges; range is forwarded on every search.
	evaluate("window.__fixture.legacy=false");
	browser("fill", 'input[type="search"]', "example updated");
	wait(
		'document.querySelector("#search-tab-pages").getAttribute("aria-label")?.includes("45")',
	);
	assert.equal(
		evaluate(
			'window.__fixture.requests.filter(m=>m.type==="SEARCH_HISTORY").every(m=>m.from<=m.to&&m.limit===20)',
		),
		true,
	);
	assert.equal(
		evaluate('new URL(location.href).searchParams.get("category")'),
		"Notes",
	);
	assert.equal(
		evaluate('new URL(location.href).searchParams.has("kind")'),
		false,
	);
	// Closing a sheet during a deferred save must not reopen it on completion.
	browser(
		"find",
		"first",
		'button[aria-label="Show note details from example.com"]',
		"click",
	);
	browser("find", "role", "button", "click", "--name", "Edit note", "--exact");
	browser("fill", "#note-editor", "Saved synthetic edit");
	browser("find", "role", "button", "click", "--name", "Save note", "--exact");
	wait('typeof window.__fixture.pendingSave === "function"');
	browser("press", "Escape");
	evaluate("window.__fixture.pendingSave()");
	wait('!document.querySelector("[role=dialog]")');
	assert.equal(evaluate('!!document.querySelector("[role=dialog]")'), false);
	// Failed pages/notes cannot erase independently loaded Sites or look like empty results.
	evaluate("window.__fixture.fail=true");
	browser("fill", 'input[type="search"]', "failure");
	tab("Everything");
	wait(
		'[...document.querySelectorAll("[role=alert]")].some(element => element.textContent.includes("Couldn’t load pages"))',
	);
	assert.equal(
		evaluate(`!!document.querySelector('a[href="https://example0.com/"]')`),
		true,
	);
	browser("click", '[aria-label="Clear search"]');
	wait(`!document.querySelector('[aria-label="Search results"]')`);
	console.log(
		"Home browser regression: legacy/current responses, hidden Sites, drill-down, independent pagination, bounded virtual rows, stable selection, range, errors and clearing passed",
	);
} finally {
	browser("close");
}
