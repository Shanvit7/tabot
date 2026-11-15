import { Player, type PlayerRef } from "@remotion/player";
import type { RefObject } from "react";
import { ChatGptConnectionTutorial } from "~/components/features/assistant/chatgpt-connection-tutorial";
import {
	CHATGPT_TUTORIAL_DURATION,
	CHATGPT_TUTORIAL_FPS,
	CHATGPT_TUTORIAL_HEIGHT,
	CHATGPT_TUTORIAL_WIDTH,
} from "~/components/features/assistant/chatgpt-tutorial/timeline";

export const AssistantDemoPanel = ({
	playerRef,
}: {
	playerRef: RefObject<PlayerRef | null>;
}) => (
	<div className="relative mx-auto aspect-8/5 w-full max-w-3xl overflow-hidden rounded-xl border border-work-line bg-work-surface">
		<Player
			ref={playerRef}
			component={ChatGptConnectionTutorial}
			compositionWidth={CHATGPT_TUTORIAL_WIDTH}
			compositionHeight={CHATGPT_TUTORIAL_HEIGHT}
			durationInFrames={CHATGPT_TUTORIAL_DURATION}
			fps={CHATGPT_TUTORIAL_FPS}
			controls
			alwaysShowControls
			showPlaybackRateControl={[0.5, 1, 1.5, 2]}
			showVolumeControls={false}
			spaceKeyToPlayOrPause
			moveToBeginningWhenEnded={false}
			className="absolute! inset-0! h-full! w-full!"
		/>
	</div>
);
