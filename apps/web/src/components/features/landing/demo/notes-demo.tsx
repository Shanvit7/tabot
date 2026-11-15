import { Player } from "@remotion/player";
import { useReducedMotion } from "motion/react";
import {
	CHATGPT_TUTORIAL_FPS,
	CHATGPT_TUTORIAL_HEIGHT,
	CHATGPT_TUTORIAL_WIDTH,
} from "~/components/features/assistant/chatgpt-tutorial/timeline";
import { NotesDemoComposition } from "~/components/features/landing/demo/notes-demo-composition";
import { NOTES_DEMO_DURATION } from "~/components/features/landing/demo/notes-demo-data";

const NotesDemo = () => {
	const reduceMotion = useReducedMotion();

	return (
		<section aria-label="Save a page note, then find it in Tabot">
			<p className="sr-only">
				Demo: open Tabot on an Acme page, write and save a note. Search for Acme
				onboarding in Tabot, select Notes and This week to find that same note.
				Fictional sample data.
			</p>
			<div className="relative aspect-8/5 overflow-hidden rounded-2xl border border-work-line bg-[#eef0ec]">
				<Player
					component={NotesDemoComposition}
					compositionWidth={CHATGPT_TUTORIAL_WIDTH}
					compositionHeight={CHATGPT_TUTORIAL_HEIGHT}
					durationInFrames={NOTES_DEMO_DURATION}
					fps={CHATGPT_TUTORIAL_FPS}
					autoPlay={!reduceMotion}
					controls
					alwaysShowControls
					showVolumeControls={false}
					spaceKeyToPlayOrPause
					moveToBeginningWhenEnded={false}
					className="absolute! inset-0! h-full! w-full! [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed"
				/>
			</div>
		</section>
	);
};

export default NotesDemo;
