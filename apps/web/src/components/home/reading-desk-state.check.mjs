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
