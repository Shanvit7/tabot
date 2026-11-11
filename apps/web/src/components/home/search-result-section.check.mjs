// Run: node apps/web/src/components/home/search-result-section.check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { initialReadingDeskSearchState } from "./reading-desk-state.ts";

// Isolate section's loading gate from child UI and browser-only effects.
const childrenOnly = ({ children }) => children ?? null;
const childModules = {
	SearchEverythingBoard: childrenOnly,
	PageFavicon: childrenOnly,
	PageReader: childrenOnly,
	SearchFeedback: childrenOnly,
	SearchNoteCards: childrenOnly,
	SearchNotesCarousel: childrenOnly,
	SearchPageResults: childrenOnly,
	SearchResultFilters: () =>
		createElement("nav", { "aria-label": "Result filters" }),
	Tabs: childrenOnly,
	TabsContent: childrenOnly,
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
	new Function("require", "exports", compiled.outputText)(
		(id) =>
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
	);
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
}

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
