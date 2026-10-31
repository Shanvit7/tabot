export const CHATGPT_TUTORIAL_FPS = 30;
export const CHATGPT_TUTORIAL_WIDTH = 1280;
export const CHATGPT_TUTORIAL_HEIGHT = 800;

const chapters = [
	{
		id: 'prepare',
		label: 'Open Plugins',
		seconds: 8,
		body: 'Keep Tabot running in this Chrome profile, then open Plugins in the sidebar.',
	},
	{
		id: 'open',
		label: 'Add a server',
		seconds: 10,
		body: 'Choose Add → Add custom MCP server.',
	},
	{
		id: 'details',
		label: 'Enter server details',
		seconds: 14,
		body: 'Name: Tabot. Connection: Server URL, not Tunnel. Authentication: OAuth.',
	},
	{
		id: 'authorize',
		label: 'Review & authorize',
		seconds: 16,
		body: 'Tabot doesn’t store browsing data on its servers. It stays on-device; requested results reach ChatGPT.',
	},
	{
		id: 'verify',
		label: 'See Tabot’s response',
		seconds: 30,
		body: 'Ask Tabot about your research, then watch ChatGPT summarize what you explored.',
	},
] as const;

type Chapter = (typeof chapters)[number] & {
	from: number;
	durationInFrames: number;
};

export const CHATGPT_TUTORIAL_CHAPTERS = chapters.reduce<Chapter[]>(
	(timeline, chapter) => {
		const previous = timeline.at(-1);
		timeline.push({
			...chapter,
			from: previous ? previous.from + previous.durationInFrames : 0,
			durationInFrames: chapter.seconds * CHATGPT_TUTORIAL_FPS,
		});
		return timeline;
	},
	[],
);

export const CHATGPT_TUTORIAL_DURATION = CHATGPT_TUTORIAL_CHAPTERS.reduce(
	(total, chapter) => total + chapter.durationInFrames,
	0,
);

export const getTutorialChapter = (frame: number) =>
	CHATGPT_TUTORIAL_CHAPTERS.findLast((chapter) => frame >= chapter.from) ??
	CHATGPT_TUTORIAL_CHAPTERS[0];

export const getVerificationStage = (frame: number) => {
	if (frame < 180) return 'compose';
	if (frame < 240) return 'calling';
	return 'answer';
};

export const getTypedText = (
	text: string,
	frame: number,
	start: number,
	duration: number,
) =>
	text.slice(
		0,
		Math.floor(
			text.length * Math.max(0, Math.min(1, (frame - start) / duration)),
		),
	);
