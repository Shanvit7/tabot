import { Player } from "@remotion/player";
import { useReducedMotion } from "motion/react";
import {
	CHATGPT_TUTORIAL_HEIGHT,
	CHATGPT_TUTORIAL_WIDTH,
} from "~/components/features/assistant/chatgpt-tutorial/timeline";
import { ChatGptSearchComposition } from "~/components/features/landing/demo/chatgpt-search-demo";
import {
	LANDING_DEMO_FPS,
	SEARCH_DEMO_DURATION,
} from "~/components/features/landing/demo/paired-search-demo-data";

const ChatGptSearchDemo = () => {
	const reduceMotion = useReducedMotion();
	return (
		<section aria-label="Search for Acme company in ChatGPT">
			<div className="relative aspect-8/5 overflow-hidden rounded-2xl border border-work-line bg-tutorial-browser">
				<Player
					component={ChatGptSearchComposition}
					compositionWidth={CHATGPT_TUTORIAL_WIDTH}
					compositionHeight={CHATGPT_TUTORIAL_HEIGHT}
					durationInFrames={SEARCH_DEMO_DURATION}
					fps={LANDING_DEMO_FPS}
					autoPlay={!reduceMotion}
					initiallyMuted
					acknowledgeRemotionLicense
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

export default ChatGptSearchDemo;
