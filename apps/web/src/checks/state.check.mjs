import assert from "node:assert/strict";
import {
	initialSearchState,
	searchReducer,
} from "../components/features/home/search/state.ts";

const results = [{ url: "https://example.com" }];
const notes = [{ id: "note-1" }];
const success = searchReducer(initialSearchState, {
	type: "success",
	results,
	notes,
	searchStatus: { mode: "hybrid" },
	resultsTotal: 1,
	notesTotal: 1,
});
assert.equal(success.searching, false);
assert.equal(success.hasSearched, true);
assert.deepEqual(success.results, results);
assert.deepEqual(success.notes, notes);
const paged = searchReducer(initialSearchState, {
	type: "success",
	results: Array.from({ length: 20 }, (_, index) => ({
		url: `https://example.com/${index}`,
	})),
	notes: Array.from({ length: 20 }, (_, index) => ({ id: `note-${index}` })),
	searchStatus: { mode: "keyword" },
	resultsTotal: 21,
	notesTotal: 21,
});
assert.equal(paged.hasMorePages, true);
assert.equal(paged.hasMoreNotes, true);
const appended = searchReducer(paged, {
	type: "load-more-success",
	list: "pages",
	results: [{ url: "https://example.com/next" }],
	notes: [],
});
assert.equal(appended.results.length, 21);
assert.equal(appended.hasMorePages, false);
assert.equal(appended.notes.length, 20);

const retyped = searchReducer(success, { type: "start" });
assert.equal(retyped.hasSearched, true);
assert.equal(retyped.searching, true);
assert.deepEqual(
	retyped.results,
	[],
	"new request must not present old query rows after failure",
);
assert.deepEqual(retyped.notes, []);
assert.equal(retyped.hasMorePages, false);
assert.equal(retyped.hasMoreNotes, false);
const retry = searchReducer(success, { type: "retry" });
assert.equal(retry.retryCount, 1);
const failed = searchReducer(retry, {
	type: "error",
	message: "offline",
});
assert.equal(failed.searchError, "offline");
assert.equal(failed.hasSearched, true);
assert.deepEqual(failed.results, results);
const cleared = searchReducer(failed, { type: "clear" });
assert.deepEqual(cleared.results, []);
assert.equal(cleared.hasSearched, true);
assert.equal(cleared.retryCount, 1);

const pageFailure = searchReducer(paged, {
	type: "load-more-error",
	list: "pages",
});
assert.ok(pageFailure.loadMorePagesError);
assert.equal(pageFailure.loadMoreNotesError, "");
const noteLoading = searchReducer(pageFailure, {
	type: "load-more-start",
	list: "notes",
});
assert.equal(
	noteLoading.loadMorePagesError,
	pageFailure.loadMorePagesError,
	"notes must not clear page failure",
);
assert.equal(noteLoading.loadingMoreNotes, true);
const bothFailed = searchReducer(noteLoading, {
	type: "load-more-error",
	list: "notes",
});
assert.ok(bothFailed.loadMoreNotesError);
const pageRetry = searchReducer(bothFailed, {
	type: "load-more-start",
	list: "pages",
});
assert.equal(pageRetry.loadMorePagesError, "");
assert.equal(
	pageRetry.loadMoreNotesError,
	bothFailed.loadMoreNotesError,
	"page retry must not clear note failure",
);
assert.equal(pageRetry.results.length, 20);
assert.equal(pageRetry.notes.length, 20);

// Missing totals use bounded page-size pagination, never a fabricated zero.
const legacy = searchReducer(initialSearchState, {
	type: "success",
	results: paged.results,
	notes: paged.notes,
	searchStatus: { mode: "keyword" },
	resultsTotal: null,
	notesTotal: null,
});
assert.equal(legacy.hasMorePages, true);
assert.equal(legacy.hasMoreNotes, true);
const legacyEnd = searchReducer(legacy, {
	type: "load-more-success",
	list: "pages",
	results: [],
	notes: [],
});
assert.equal(legacyEnd.hasMorePages, false);
assert.equal(legacyEnd.hasMoreNotes, true);
// A stale total must not trigger an endless stream of empty pages.
const exhausted = searchReducer(paged, {
	type: "load-more-success",
	list: "pages",
	results: [],
	notes: [],
});
assert.equal(exhausted.hasMorePages, false);
// Overlapping pages retain one entity key and advance by server rows, not unique rows.
const overlap = searchReducer(
	{ ...paged, resultsTotal: 100 },
	{
		type: "load-more-success",
		list: "pages",
		results: [paged.results[19], { url: "https://example.com/next" }],
		notes: [],
	},
);
assert.equal(overlap.results.length, 21);
assert.equal(overlap.pagesOffset, 22);
assert.equal(new Set(overlap.results.map((row) => row.url)).size, 21);
const repeated = searchReducer(overlap, {
	type: "load-more-success",
	list: "pages",
	results: overlap.results.slice(0, 20),
	notes: [],
});
assert.equal(repeated.results.length, 21);
assert.equal(repeated.hasMorePages, false);
const overlappingNotes = searchReducer(
	{ ...paged, notesTotal: 100 },
	{
		type: "load-more-success",
		list: "notes",
		results: [],
		notes: [paged.notes[19], { id: "next-note" }],
	},
);
assert.equal(overlappingNotes.notes.length, 21);
assert.equal(overlappingNotes.notesOffset, 22);
assert.equal(overlappingNotes.pagesOffset, 20);
assert.equal(new Set(overlappingNotes.notes.map((row) => row.id)).size, 21);
