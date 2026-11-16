import assert from "node:assert/strict";
import {
	CHATGPT_TUTORIAL_FPS,
	getTypedText,
} from "../components/features/assistant/chatgpt-tutorial/timeline.ts";
import {
	getNotesDemoStage,
	NOTE_PAGE,
	NOTE_SAVED_FRAME,
	NOTE_SEARCH_FRAME,
	NOTE_SEARCH_QUERY,
	NOTE_TEXT,
	NOTE_TYPE_DURATION,
	NOTE_TYPE_START,
	NOTES_DEMO_DURATION,
} from "../components/features/landing/demo/notes-demo-data.ts";
import { LANDING_DEMO_FPS } from "../components/features/landing/demo/paired-search-demo-data.ts";

assert.equal(NOTES_DEMO_DURATION, 30 * CHATGPT_TUTORIAL_FPS);
assert.equal(NOTES_DEMO_DURATION / LANDING_DEMO_FPS, 20);
assert.equal(NOTE_SEARCH_FRAME / LANDING_DEMO_FPS, 10 / 1.5);
assert.equal(NOTE_SEARCH_FRAME, 10 * CHATGPT_TUTORIAL_FPS);
assert.ok(NOTE_SEARCH_FRAME > NOTE_SAVED_FRAME + 60);
assert.equal(new URL(NOTE_PAGE.url).hostname, NOTE_PAGE.host);
assert.ok(NOTE_PAGE.host.endsWith(".example"));
assert.equal(NOTE_SEARCH_QUERY, "Acme onboarding");
assert.equal(getTypedText(NOTE_SEARCH_QUERY, 118, 18, 100), NOTE_SEARCH_QUERY);
assert.equal(getNotesDemoStage(0), "page");
assert.equal(getNotesDemoStage(18), "opening");
assert.equal(getNotesDemoStage(34), "popup");
assert.equal(getNotesDemoStage(64), "typing");
assert.equal(
	getTypedText(NOTE_TEXT, NOTE_TYPE_START, NOTE_TYPE_START, NOTE_TYPE_DURATION),
	"",
);
assert.equal(
	getTypedText(
		NOTE_TEXT,
		NOTE_TYPE_START + NOTE_TYPE_DURATION / 2,
		NOTE_TYPE_START,
		NOTE_TYPE_DURATION,
	),
	NOTE_TEXT.slice(0, Math.floor(NOTE_TEXT.length / 2)),
);
assert.equal(
	getTypedText(
		NOTE_TEXT,
		NOTE_TYPE_START + NOTE_TYPE_DURATION,
		NOTE_TYPE_START,
		NOTE_TYPE_DURATION,
	),
	NOTE_TEXT,
);
assert.equal(getNotesDemoStage(189), "ready");
assert.equal(getNotesDemoStage(190), "saving");
assert.equal(getNotesDemoStage(NOTE_SAVED_FRAME), "saved");
assert.deepEqual(
	[
		NOTE_SEARCH_FRAME - 1,
		NOTE_SEARCH_FRAME,
		NOTES_DEMO_DURATION - 1,
		190,
		0,
		NOTE_SEARCH_FRAME,
	].map(getNotesDemoStage),
	["saved", "search", "search", "saving", "page", "search"],
);
console.log("Notes demo timeline checks passed.");
