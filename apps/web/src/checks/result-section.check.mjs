// Run: pnpm --filter web check:searchResults
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { initialSearchState } from "../components/features/home/search/state.ts";

const require = createRequire(import.meta.url);
const childModules = {
	DingToaster: () => null,
	HomeEmptyState: ({ kind }) =>
		createElement("div", { "data-home-empty": kind }),
	HomeListSkeleton: ({ kind, count }) =>
		createElement("div", {
			"data-home-skeleton": kind,
			"data-skeleton-count": count,
		}),
	PageFavicon: () => null,
	ChatGptResultAction: () => null,
	SearchPagesResults: () =>
		createElement("ul", { "aria-label": "Matching pages" }),
	SearchNotesResults: () =>
		createElement("ul", { "aria-label": "Matching notes" }),
	SiteBrowser: () => createElement("div", { "data-site-browser": "mounted" }),
	SearchResultFilters: ({ kind, period }) =>
		createElement("nav", {
			"aria-label": "Result filters",
			"data-kind": kind,
			"data-period": period,
		}),
	cn: (...classes) => classes.filter(Boolean).join(" "),
	approxTimeSpentLabel: () => "",
};
const load = (file, overrides = {}) => {
	const url = new URL(file, import.meta.url);
	const compiled = ts.transpileModule(readFileSync(url, "utf8"), {
		compilerOptions: {
			jsx: ts.JsxEmit.ReactJSX,
			module: ts.ModuleKind.CommonJS,
		},
	});
	const exports = {};
	runInNewContext(compiled.outputText, {
		require: (id) => {
			if (id in overrides) return overrides[id];
			if (id.startsWith("~/")) return childModules;
			if (id.startsWith("."))
				return load(
					new URL(`${id}${id.endsWith("types") ? ".ts" : ".tsx"}`, url).href,
				);
			if (id === "lucide-react")
				return Object.fromEntries(
					[
						"ChevronRight",
						"FileText",
						"Globe2",
						"NotebookPen",
						"SearchX",
						"StickyNote",
						"TriangleAlert",
					].map((name) => [name, () => null]),
				);
			return require(id);
		},
		exports,
	});
	return exports;
};
const { withinRange, searchTimeRange } = load(
	"../components/features/home/search/utils.ts",
);
Object.assign(childModules, { withinRange, searchTimeRange });
const { HomeResultColumn } = load(
	"../components/features/home/components/result-column.tsx",
);
childModules.HomeResultColumn = HomeResultColumn;
const { SearchResultsGrid } = load(
	"../components/features/home/search/everything-board/search-results-grid.tsx",
);
childModules.SearchEverythingBoard = (props) =>
	createElement(SearchResultsGrid, {
		pagesOnly: false,
		notesOnly: false,
		sites: [],
		...props,
	});
const { SearchResultSection } = load(
	"../components/features/home/search/result-section/index.tsx",
);
const { SearchResultView } = load(
	"../components/features/home/search/result-section/view.tsx",
);
const noop = () => {};
const render = (Component, props) =>
	renderToStaticMarkup(createElement(Component, props));
const callbacks = {
	onRetrySearch: noop,
	onUpdateNote: noop,
	onLoadMore: noop,
	onKindChange: noop,
	onPeriodChange: noop,
	onSitesStateChange: noop,
};
const preview = {
	sites: [],
	total: 0,
	hasMore: false,
	loading: false,
	error: "",
	retry: noop,
};
const view = (state, kind = "Everything", sitePreview = preview) =>
	render(SearchResultView, {
		query: "tabs",
		state,
		kind,
		period: "today",
		siteRequestKey: "tabs:today",
		sitePreview,
		counts: { Everything: 0, Sites: 0, Pages: 0, Notes: 0 },
		results: state.results,
		notes: state.notes,
		noteCountsByUrl: new Map(),
		chatGptConnected: false,
		...callbacks,
	});

// All three sections stay labeled and get three matching skeleton rows.
const loading = view({ ...initialSearchState, searching: true }, "Everything", {
	...preview,
	loading: true,
});
for (const kind of ["Sites", "Pages", "Notes"]) {
	assert.ok(loading.includes(`>${kind}<`));
	assert.ok(
		loading.includes(
			`data-home-skeleton="${kind.toLowerCase()}" data-skeleton-count="3"`,
		),
	);
	assert.ok(!loading.includes(`data-home-empty="${kind}"`));
}
assert.ok(loading.includes('aria-label="Result filters"'));
assert.ok(loading.includes('data-site-browser="mounted"'));

// Independent sites remain usable while page/note search loads or fails.
for (const state of [
	{ ...initialSearchState, searching: true },
	{
		...initialSearchState,
		hasSearched: true,
		searchError: "Search unavailable",
	},
]) {
	const html = view(state, "Everything", {
		...preview,
		total: 1,
		sites: [{ site: "example.com", pageCount: 2, noteCount: 1 }],
	});
	assert.ok(html.includes("https://example.com/"));
	assert.ok(!html.includes('data-home-empty="Sites"'));
}

for (const kind of ["Everything", "Pages", "Notes", "Sites"]) {
	const html = view({ ...initialSearchState, hasSearched: true }, kind);
	for (const entry of ["Sites", "Pages", "Notes"]) {
		// Sites tab uses its own independently mounted library reader.
		const visible =
			kind !== "Sites" && (kind === "Everything" || kind === entry);
		assert.equal(html.includes(`data-home-empty="${entry}"`), visible);
	}
}
for (const kind of ["Everything", "Pages", "Notes"]) {
	const html = view(
		{
			...initialSearchState,
			hasSearched: true,
			searchError: "Storage unavailable",
		},
		kind,
		{ ...preview, error: "Site storage unavailable" },
	);
	assert.ok(html.includes('role="alert"'));
	assert.ok(
		!html.includes("data-home-empty="),
		"read failure must never look empty",
	);
	assert.ok(html.includes(`Retry ${kind === "Notes" ? "notes" : "pages"}`));
}

// Per-column states: retain valid rows after failure, never hide active pagination behind empty UI.
for (const kind of ["Sites", "Pages", "Notes"]) {
	const base = {
		kind,
		onRetry: noop,
		children: createElement("p", null, "retained row"),
	};
	const failed = render(HomeResultColumn, {
		...base,
		count: 1,
		error: "Read failed",
	});
	assert.ok(failed.includes("retained row"));
	assert.ok(failed.includes("Previous results remain below."));
	assert.ok(!failed.includes("data-home-empty="));
	const paginating = render(HomeResultColumn, {
		...base,
		count: 0,
		hasMore: true,
	});
	assert.ok(paginating.includes("retained row"));
	assert.ok(!paginating.includes("data-home-empty="));
	const failedEmpty = render(HomeResultColumn, {
		...base,
		count: 0,
		error: "Read failed",
	});
	assert.ok(!failedEmpty.includes("retained row"));
	assert.ok(!failedEmpty.includes("data-home-empty="));
}
assert.equal(
	render(SearchResultSection, {
		query: "",
		state: initialSearchState,
		...callbacks,
	}),
	"",
	"initial Home stays search-only",
);
// Query/range/tab transitions remount virtualizers instead of retaining old offsets.
const descendants = (node) =>
	!node || typeof node !== "object"
		? []
		: [node, ...[node.props?.children].flat().flatMap(descendants)];
const boardKey = (siteRequestKey, kind) =>
	descendants(
		SearchResultView({
			query: "tabs",
			state: initialSearchState,
			kind,
			period: "today",
			siteRequestKey,
			sitePreview: preview,
			counts: {},
			results: [],
			notes: [],
			noteCountsByUrl: new Map(),
			...callbacks,
		}),
	).find((node) => node.type === childModules.SearchEverythingBoard)?.key;
assert.notEqual(
	boardKey("old:today", "Everything"),
	boardKey("new:today", "Everything"),
);
assert.notEqual(
	boardKey("new:today", "Everything"),
	boardKey("new:any", "Everything"),
);
assert.notEqual(
	boardKey("new:today", "Everything"),
	boardKey("new:today", "Pages"),
);

// Drill-down must retain the live sites reader that owns Everything's retry callback.
const { SiteBrowser: DrilledSiteBrowser } = load(
	"../components/features/home/library/site-browser.tsx",
	{
		react: { ...require("react"), useState: () => ["example.com", noop] },
		"@tabot/shared/library": { rankLibrarySites: (sites) => sites },
	},
);
const drilled = descendants(
	DrilledSiteBrowser({ query: "tabs", ...callbacks }),
);
assert.deepEqual(
	drilled
		.filter((node) => node.props?.request)
		.map((node) => node.props.request.level),
	["sites", "pages"],
);
assert.ok(
	drilled.some(
		(node) =>
			node.props?.hidden &&
			descendants(node).some(
				(child) => child.props?.request?.level === "sites",
			),
	),
);

// All individual tabs share the compact icon/subtitle header; Everything keeps full headings.
for (const kind of ["Sites", "Pages", "Notes"]) {
	const compact = render(HomeResultColumn, {
		kind,
		count: 1,
		compactHeading: true,
	});
	assert.ok(compact.includes('<header class="mb-3 flex items-center gap-2">'));
	assert.match(compact, /<h2[^>]+class="sr-only"/);
	const full = render(HomeResultColumn, { kind, count: 1 });
	assert.ok(full.includes("mb-4 border-b border-border pb-3"));
}
childModules.useLibrary = () => ({
	data: { sites: [], pages: [], notes: [], total: 0, hasMore: false },
	loading: false,
	error: "",
	retry: noop,
	loadMore: noop,
});
const siteReader = drilled.find(
	(node) => node.props?.request?.level === "sites",
);
assert.equal(
	render(siteReader.type, siteReader.props),
	"",
	"hidden readers must not mount zero-sized scroll containers",
);
const siteMarkup = render(siteReader.type, {
	...siteReader.props,
	visible: true,
});
assert.ok(
	siteMarkup.includes('<header class="mb-3 flex items-center gap-2">'),
	"Sites must use the same compact header as Pages/Notes",
);

// Preserve the original empty-state illustration, compact variant and copy.
const emptyPrimitives = Object.fromEntries(
	["Empty", "EmptyDescription", "EmptyHeader", "EmptyMedia", "EmptyTitle"].map(
		(name) => [
			name,
			({ children, className }) =>
				createElement("div", { className }, children),
		],
	),
);
const { HomeEmptyState: OriginalEmptyState } = load(
	"../components/features/home/components/empty-state.tsx",
	{ "~/components/ui/empty": emptyPrimitives },
);
for (const kind of ["Sites", "Pages", "Notes"]) {
	const empty = render(OriginalEmptyState, { kind });
	assert.ok(
		empty.includes('viewBox="0 0 240 160"'),
		"original tray and magnifier illustration must remain",
	);
	assert.ok(empty.includes(`No ${kind.toLowerCase()} match this search`));
	assert.ok(!empty.includes("<img"));
	const compact = render(OriginalEmptyState, { kind, compact: true });
	assert.ok(compact.includes("min-h-28"));
	assert.ok(!compact.includes('viewBox="0 0 240 160"'));
}

const now = new Date(2026, 3, 17, 12).getTime();
const midnight = new Date(2026, 3, 17).getTime();
const yesterday = new Date(2026, 3, 16).getTime();
assert.equal(withinRange(now + 1, Number.POSITIVE_INFINITY, now), false);
assert.equal(withinRange(midnight, 1, now), true);
assert.equal(withinRange(midnight - 1, 1, now), false);
assert.equal(withinRange(midnight, 2, now), false);
assert.equal(withinRange(midnight - 1, 2, now), true);
assert.equal(withinRange(yesterday, 2, now), true);
assert.equal(withinRange(yesterday - 1, 2, now), false);
for (const [month, day] of [
	[2, 9],
	[10, 2],
]) {
	const anchor = new Date(2026, month, day, 12).getTime();
	const range = searchTimeRange(2, anchor);
	assert.equal(range.from, new Date(2026, month, day - 1).getTime());
	assert.equal(range.to, new Date(2026, month, day).getTime() - 1);
}
let derived;
const { SearchResultSection: DerivingSection } = load(
	"../components/features/home/search/result-section/index.tsx",
	{
		"./view": {
			SearchResultView: (props) => {
				derived = props;
				return null;
			},
		},
	},
);
const rankedState = {
	...initialSearchState,
	hasSearched: true,
	results: [
		{ url: "https://example.com/relevant", lastSeen: now - 2000 },
		{ url: "https://example.com/newer", lastSeen: now - 1000 },
	],
	notes: [
		{
			id: "edited",
			url: "https://example.com/relevant",
			createdAt: now - 2000,
		},
		{ id: "recent", url: "https://example.com/newer", createdAt: now - 1000 },
	],
};
render(DerivingSection, {
	query: "example",
	kind: "Pages",
	period: "today",
	now,
	state: rankedState,
	...callbacks,
});
assert.deepEqual(
	derived.results.map((row) => row.url),
	rankedState.results.map((row) => row.url),
	"UI must preserve server relevance order",
);
assert.equal(
	derived.noteCountsByUrl.get("https://example.com/relevant"),
	1,
	"Pages tab must not discard loaded note associations",
);
assert.equal(
	derived.countsReady.Pages,
	true,
	"legacy unknown totals show loaded count, not zero",
);
assert.equal(derived.counts.Pages, 2);
assert.equal(derived.countsApprox.Pages, false);
render(DerivingSection, {
	query: "example",
	kind: "Notes",
	period: "today",
	now,
	state: { ...rankedState, resultsTotal: 2, notesTotal: 2 },
	...callbacks,
});
assert.equal(derived.countsReady.Notes, true);
assert.deepEqual(
	derived.notes.map((row) => row.id),
	["edited", "recent"],
	"UI must preserve server note ordering",
);
console.log(
	"Home result states: labels, independent sources, three-row loading, errors, empty and pagination passed",
);
