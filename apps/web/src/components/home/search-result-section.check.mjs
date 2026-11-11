// Run: node apps/web/src/components/home/search-result-section.check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { initialReadingDeskSearchState } from "./reading-desk-state.ts";

// Isolate section's loading gate from child UI and browser-only effects.
const childrenOnly = ({ children }) => children ?? null;
const childModules = {
	DatePicker: childrenOnly,
	Select: childrenOnly,
	SelectContent: childrenOnly,
	SelectGroup: childrenOnly,
	SelectItem: childrenOnly,
	SelectTrigger: childrenOnly,
	SelectValue: childrenOnly,
	SearchEverythingBoard: ({ sites, onBrowseSites }) =>
		createElement("div", {
			"data-board-site-count": sites.length,
			"data-browse-sites": typeof onBrowseSites === "function",
		}),
	PageFavicon: childrenOnly,
	PageReader: childrenOnly,
	SearchFeedback: childrenOnly,
	SearchNoteCards: childrenOnly,
	SearchNotesCarousel: childrenOnly,
	SearchPageResults: childrenOnly,
	SearchResultFilters: ({ kind, period, periods }) =>
		createElement("nav", {
			"aria-label": "Result filters",
			"data-kind": kind,
			"data-period": period,
			"data-period-labels": periods.map(({ label }) => label).join("|"),
		}),
	SiteBrowser: ({ isActive }) =>
		createElement("div", {
			"data-site-browser": "mounted",
			"data-site-active": isActive,
		}),
	Button: childrenOnly,
	Sheet: childrenOnly,
	SheetContent: childrenOnly,
	SheetDescription: childrenOnly,
	SheetHeader: childrenOnly,
	SheetTitle: childrenOnly,
	cn: (...classes) => classes.filter(Boolean).join(" "),
	dateLabel: () => "11 Nov 2026",
	urlLabel: (page) => page.url,
};
const require = createRequire(import.meta.url);
const load = (file) => {
	const compiled = ts.transpileModule(
		readFileSync(new URL(file, import.meta.url), "utf8"),
		{
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				module: ts.ModuleKind.CommonJS,
			},
		},
	);
	const exports = {};
	runInNewContext(compiled.outputText, {
		require: (id) =>
			id.startsWith("~/")
				? childModules
				: id === "lucide-react"
					? {
							ArrowLeft: childrenOnly,
							ArrowRight: childrenOnly,
							ArrowUpRight: childrenOnly,
							FileText: childrenOnly,
							StickyNote: childrenOnly,
						}
					: require(id),
		exports,
	});
	return exports;
};
const { SearchResultSection } = load("./search-result-section.tsx");
const noop = () => {};
for (const [searching, searchError] of [
	[true, null],
	[false, null],
	[false, "offline"],
]) {
	const html = renderToStaticMarkup(
		createElement(SearchResultSection, {
			query: "tabs",
			state: { ...initialReadingDeskSearchState, searching, searchError },
			onRetrySearch: noop,
			onSelectPage: noop,
			onEmptyChange: noop,
		}),
	);
	assert.equal(html.includes('aria-label="Result filters"'), !searching);
	assert.equal(html.includes('data-period="today"'), !searching);
	assert.equal(html.includes('data-kind="Everything"'), !searching);
	assert.equal(
		html.includes(
			'data-period-labels="Today|Yesterday|Last 7 days|Last 30 days|Time machine"',
		),
		!searching,
	);
	assert.equal(html.includes('data-site-browser="mounted"'), !searching);
	assert.equal(html.includes('data-site-active="false"'), !searching);
	assert.equal(html.includes('data-board-site-count="0"'), !searching);
	assert.equal(html.includes('data-browse-sites="true"'), !searching);
}

assert.equal(
	renderToStaticMarkup(
		createElement(SearchResultSection, {
			query: "",
			state: initialReadingDeskSearchState,
			onRetrySearch: noop,
			onUpdateNote: async () => ({ id: "", text: "", updatedAt: 0 }),
			onLoadMore: noop,
			onEmptyChange: noop,
		}),
	),
	"",
	"initial /home keeps search-only layout until query exists",
);

const { withinRange } = load("./search-result-section.tsx");
const fromStart = new Date(2026, 0, 2).getTime();
const toEnd = new Date(2026, 0, 2, 23, 59, 59).getTime();
const nextDayStart = new Date(2026, 0, 3).getTime();
assert.equal(
	withinRange(fromStart, Infinity, Date.now(), "2026-01-02", "2026-01-02"),
	true,
);
assert.equal(
	withinRange(toEnd, Infinity, Date.now(), "2026-01-02", "2026-01-02"),
	true,
);
assert.equal(
	withinRange(nextDayStart, Infinity, Date.now(), "2026-01-02", "2026-01-02"),
	false,
);
assert.equal(
	withinRange(fromStart, Infinity, Date.now(), "2026-01-03", "2026-01-02"),
	false,
);
const selectedMinuteStart = new Date(2026, 0, 2, 10, 30).getTime();
const selectedMinuteBefore = new Date(2026, 0, 2, 10, 29, 59).getTime();
const selectedMinuteEnd = new Date(2026, 0, 2, 11, 30, 0, 999).getTime();
const selectedMinuteAfter = new Date(2026, 0, 2, 11, 30, 1).getTime();
assert.equal(
	withinRange(
		selectedMinuteStart,
		Infinity,
		Date.now(),
		"2026-01-02",
		"2026-01-02",
		"10:30:00",
		"11:30:00",
	),
	true,
);
assert.equal(
	withinRange(
		selectedMinuteBefore,
		Infinity,
		Date.now(),
		"2026-01-02",
		"2026-01-02",
		"10:30:00",
		"11:30:00",
	),
	false,
);
assert.equal(
	withinRange(
		selectedMinuteEnd,
		Infinity,
		Date.now(),
		"2026-01-02",
		"2026-01-02",
		"10:30:00",
		"11:30:00",
	),
	true,
);
assert.equal(
	withinRange(
		selectedMinuteAfter,
		Infinity,
		Date.now(),
		"2026-01-02",
		"2026-01-02",
		"10:30:00",
		"11:30:00",
	),
	false,
);

const { SearchNotesCarousel } = load("./search-notes-carousel.tsx");
const note = {
	id: "note-1",
	url: "https://www.linkedin.com/feed/",
	host: "www.linkedin.com",
	title: "Feed | LinkedIn",
	text: "Nice feed",
	createdAt: Date.UTC(2026, 10, 11),
};
const single = renderToStaticMarkup(
	createElement(SearchNotesCarousel, { notes: [note] }),
);
assert.match(single, /\bw-full\b/);
assert.match(single, /max-h-24/);
assert.doesNotMatch(single, /(?:^|\s)h-20(?:\s|")/);
assert.doesNotMatch(single, />Open page /);
assert.match(single, /href="https:\/\/www.linkedin.com\/feed\/"/);
assert.doesNotMatch(single, /aria-roledescription="carousel"/);
const multiple = renderToStaticMarkup(
	createElement(SearchNotesCarousel, {
		notes: [note, { ...note, id: "note-2" }],
	}),
);
assert.match(multiple, /aria-roledescription="carousel"/);
assert.match(multiple, /w-\[min\(20rem/);
