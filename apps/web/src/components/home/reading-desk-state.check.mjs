import assert from "node:assert/strict";
import {
	initialReadingDeskSearchState,
	readingDeskSearchReducer,
} from "./reading-desk-state.ts";

const results = [{ url: "https://example.com" }];
const notes = [{ id: "note-1" }];
const success = readingDeskSearchReducer(initialReadingDeskSearchState, {
	type: "success",
	results,
	notes,
	searchStatus: { mode: "hybrid" },
});
assert.equal(success.searching, false);
assert.equal(success.results, results);
assert.equal(success.notes, notes);
const paged = readingDeskSearchReducer(initialReadingDeskSearchState, {
	type: "success",
	results: Array.from({ length: 20 }, (_, index) => ({
		url: `https://example.com/${index}`,
	})),
	notes: Array.from({ length: 20 }, (_, index) => ({ id: `note-${index}` })),
	searchStatus: { mode: "keyword" },
});
assert.equal(paged.hasMorePages, true);
assert.equal(paged.hasMoreNotes, true);
const appended = readingDeskSearchReducer(paged, {
	type: "load-more-success",
	list: "pages",
	results: [{ url: "https://example.com/next" }],
	notes: [],
});
assert.equal(appended.results.length, 21);
assert.equal(appended.hasMorePages, false);
assert.equal(appended.notes.length, 20);

const retry = readingDeskSearchReducer(success, { type: "retry" });
assert.equal(retry.retryCount, 1);
const failed = readingDeskSearchReducer(retry, {
	type: "error",
	message: "offline",
});
assert.equal(failed.searchError, "offline");
assert.equal(failed.results, results);
const cleared = readingDeskSearchReducer(failed, { type: "clear" });
assert.deepEqual(cleared.results, []);
assert.equal(cleared.retryCount, 1);
