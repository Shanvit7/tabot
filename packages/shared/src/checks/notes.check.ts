import assert from "node:assert/strict";
import type { StoredTabEvent } from "../events/db";
import {
	noteMatchesDomain,
	searchNoteRows,
	sessionForNote,
	validateNoteText,
} from "../notes/notes";
import { canonicalPageUrl } from "../privacy/canonical-url";
import { sessionize } from "../sessions/sessions";

assert.equal(
	canonicalPageUrl("https://example.com/watch?v=abc&utm_source=x#top"),
	"https://example.com/watch?v=abc",
);
assert.equal(validateNoteText("  a note  "), true);
assert.equal(validateNoteText(" \n "), false);
assert.equal(validateNoteText("x".repeat(4_001)), false);
assert.equal(noteMatchesDomain("docs.example.com", "example.com"), true);
assert.equal(noteMatchesDomain("badexample.com", "example.com"), false);

const note = {
	id: "note-1",
	text: "local research",
	title: "Research",
	host: "docs.example.com",
	url: "https://docs.example.com/research",
	createdAt: 100,
	updatedAt: 100,
};
assert.deepEqual(searchNoteRows([note], "research docs"), [note]);
assert.deepEqual(searchNoteRows([note], "missing"), []);

const event: StoredTabEvent = {
	id: "event-1",
	type: "NOTE_SAVED",
	tabId: 1,
	windowId: 1,
	timestamp: 100,
	url: note.url,
	metadata: { noteId: note.id },
};
const session = sessionize([event])[0];
assert.ok(session);
assert.equal(
	sessionForNote(
		{
			...note,
			pageKey: "page-key",
			origin: "https://docs.example.com",
			site: "example.com",
			favicon: null,
			tabId: 1,
			windowId: 1,
			eventId: event.id,
		},
		[session],
	),
	session,
);
console.log("note checks passed");
