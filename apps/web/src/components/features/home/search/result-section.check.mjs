// Run: node apps/web/src/components/features/home/search/result-section.check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { initialSearchState } from "./state.ts";

// Isolate section's loading gate from child UI and browser-only effects.
const childrenOnly = ({ children }) => children ?? null;
const childModules = {
	DingToaster: () => null,
	HomeEmptyState: ({ kind }) =>
		createElement("div", { "data-home-empty": kind }),
	HomeListSkeleton: ({ kind }) =>
		createElement("div", { "data-home-skeleton": kind }),
	SearchEverythingBoard: ({ sites, onBrowseSites, showEmptyStates }) =>
		createElement("div", {
			"data-board-site-count": sites.length,
			"data-browse-sites": typeof onBrowseSites === "function",
			"data-show-empty-states": showEmptyStates,
		}),
	PageFavicon: childrenOnly,
	PageReader: childrenOnly,
	SearchFeedback: childrenOnly,
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
				: id === "./view"
					? load("./result-section/view.tsx")
					: id === "./types"
						? load("./result-section/types.ts")
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
const { SearchResultSection } = load("./result-section/index.tsx");
const noop = () => {};
for (const [searching, searchError, hasSearched] of [
	[true, null, false],
	[true, null, true],
	[false, null, false],
	[false, "offline", true],
]) {
	const html = renderToStaticMarkup(
		createElement(SearchResultSection, {
			query: "tabs",
			state: {
				...initialSearchState,
				searching,
				searchError,
				hasSearched,
			},
			onRetrySearch: noop,
			onSelectPage: noop,
			onEmptyChange: noop,
		}),
	);
	const initialSearch = searching && !hasSearched;
	assert.equal(html.includes('aria-label="Result filters"'), !initialSearch);
	assert.equal(html.includes('data-home-skeleton="pages"'), searching);
	assert.equal(html.includes('data-home-skeleton="notes"'), searching);
	assert.equal(html.includes('data-period="today"'), !initialSearch);
	assert.equal(html.includes('data-kind="Everything"'), !initialSearch);
	assert.equal(
		html.includes(
			'data-period-labels="Today|Yesterday|Last 7 days|Last 30 days|Anytime"',
		),
		!initialSearch,
	);
	assert.equal(html.includes('data-site-browser="mounted"'), !initialSearch);
	assert.equal(html.includes('data-board-site-count="0"'), !searching);
	assert.equal(html.includes('data-show-empty-states="false"'), !searching);
	assert.equal(html.includes('data-home-empty="Everything"'), false);
	assert.equal(html.includes('data-browse-sites="true"'), false);
}

assert.equal(
	renderToStaticMarkup(
		createElement(SearchResultSection, {
			query: "",
			state: initialSearchState,
			onRetrySearch: noop,
			onUpdateNote: async () => ({ id: "", text: "", updatedAt: 0 }),
			onLoadMore: noop,
			onEmptyChange: noop,
		}),
	),
	"",
	"initial /home keeps search-only layout until query exists",
);

const { withinRange } = load("./utils.ts");
const oldEvent = Date.now() - 10 * 365 * 86_400_000;
assert.equal(withinRange(oldEvent, Infinity, Date.now()), true);
assert.equal(withinRange(Date.now() + 1, Infinity, Date.now()), false);
