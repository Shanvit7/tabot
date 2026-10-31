import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
	CHATGPT_TUTORIAL_CHAPTERS,
	CHATGPT_TUTORIAL_DURATION,
	CHATGPT_TUTORIAL_FPS,
	getTutorialChapter,
	getTypedText,
	getVerificationStage,
} from '../components/assistant/chatgpt-tutorial/timeline.ts';

assert.equal(CHATGPT_TUTORIAL_CHAPTERS.length, 5);
assert.equal(CHATGPT_TUTORIAL_DURATION, 78 * CHATGPT_TUTORIAL_FPS);
assert.equal(new Set(CHATGPT_TUTORIAL_CHAPTERS.map(({ id }) => id)).size, 5);

for (const chapter of CHATGPT_TUTORIAL_CHAPTERS) {
	assert.equal(getTutorialChapter(chapter.from), chapter);
	assert.equal(
		getTutorialChapter(chapter.from + chapter.durationInFrames - 1),
		chapter,
	);
}

// Check seek order independently of playback: no gaps, overlaps, or stateful chapter selection.
for (let frame = CHATGPT_TUTORIAL_DURATION - 1; frame >= 0; frame--) {
	const visible = CHATGPT_TUTORIAL_CHAPTERS.filter(
		(chapter) =>
			frame >= chapter.from && frame < chapter.from + chapter.durationInFrames,
	);
	assert.equal(visible.length, 1, `Expected one chapter at frame ${frame}`);
	assert.equal(getTutorialChapter(frame), visible[0]);
}

const verification = CHATGPT_TUTORIAL_CHAPTERS.find(
	({ id }) => id === 'verify',
);
assert.equal(verification.durationInFrames, 30 * CHATGPT_TUTORIAL_FPS);
// Direct seeks and replay must restore the search and answer, not retain later state.
for (const [frame, stage] of [
	[0, 'compose'],
	[179, 'compose'],
	[180, 'calling'],
	[239, 'calling'],
	[240, 'answer'],
	[479, 'answer'],
	[899, 'answer'],
	[200, 'calling'],
	[60, 'compose'],
]) {
	assert.equal(getVerificationStage(frame), stage);
}
assert.equal(getVerificationStage(verification.durationInFrames - 1), 'answer');

const privacy = CHATGPT_TUTORIAL_CHAPTERS.find(
	({ id }) => id === 'authorize',
).body;
assert.match(privacy, /on-device/);
assert.match(privacy, /doesn’t store browsing data on its servers/);
assert.match(privacy, /results reach ChatGPT/);

assert.equal(getTypedText('Tabot', 10, 30, 30), '');
assert.equal(getTypedText('Tabot', 30, 30, 30), '');
assert.equal(getTypedText('Tabot', 45, 30, 30), 'Ta');
assert.equal(getTypedText('Tabot', 60, 30, 30), 'Tabot');
assert.equal(getTypedText('Tabot', 90, 30, 30), 'Tabot');
// Replay out of order must reconstruct the same form value.
assert.equal(getTypedText('Tabot', 45, 30, 30), 'Ta');

const verificationSource = readFileSync(
	new URL(
		'../components/assistant/chatgpt-tutorial/verify-scene.tsx',
		import.meta.url,
	),
	'utf8',
);
assert.doesNotMatch(verificationSource, /sources|timestamps|UTC/);
assert.match(verificationSource, /summarize my research/);
assert.match(verificationSource, /getTypedText\(summary/);

const directory = new URL(
	'../components/assistant/chatgpt-tutorial/',
	import.meta.url,
);
const sources = [
	new URL(
		'../components/assistant/chatgpt-connection-tutorial.tsx',
		import.meta.url,
	),
	new URL('../routes/_workspace.assistant.tsx', import.meta.url),
	...readdirSync(directory)
		.filter((file) => file.endsWith('.tsx'))
		.map((file) => new URL(file, directory)),
];
for (const source of sources) {
	assert.doesNotMatch(
		readFileSync(source, 'utf8'),
		/\b[\w-]+-\[/,
		`Use standard Tailwind utilities in ${source.pathname}`,
	);
}

console.log(
	'ChatGPT tutorial: timeline, seeking, and standard Tailwind utilities passed.',
);
