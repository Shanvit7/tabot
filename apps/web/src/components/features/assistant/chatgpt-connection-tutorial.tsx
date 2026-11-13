import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { AuthorizeScene } from "~/components/features/assistant/chatgpt-tutorial/authorize-scene";
import { DetailsScene } from "~/components/features/assistant/chatgpt-tutorial/details-scene";
import { OpenScene } from "~/components/features/assistant/chatgpt-tutorial/open-scene";
import { PrepareScene } from "~/components/features/assistant/chatgpt-tutorial/prepare-scene";
import {
	ChatGptShell,
	DemoCursor,
} from "~/components/features/assistant/chatgpt-tutorial/primitives";
import {
	CHATGPT_TUTORIAL_CHAPTERS,
	CHATGPT_TUTORIAL_FPS,
	getTutorialChapter,
} from "~/components/features/assistant/chatgpt-tutorial/timeline";
import { VerifyScene } from "~/components/features/assistant/chatgpt-tutorial/verify-scene";

const scenes = {
	prepare: PrepareScene,
	open: OpenScene,
	details: DetailsScene,
	authorize: AuthorizeScene,
	verify: VerifyScene,
};

/** Reconstructed from the supplied ChatGPT screenshots, with no personal account data. */
export const ChatGptConnectionTutorial = () => {
	const frame = useCurrentFrame();
	const chapter = getTutorialChapter(frame);
	const index = CHATGPT_TUTORIAL_CHAPTERS.indexOf(chapter);
	const completingOAuth =
		chapter.id === "authorize" && frame - chapter.from >= 330;

	return (
		<AbsoluteFill className="bg-tutorial-browser font-chatgpt text-tutorial-ink">
			<ChatGptShell
				plugins={chapter.id !== "prepare" && chapter.id !== "verify"}
			>
				{CHATGPT_TUTORIAL_CHAPTERS.map(
					({ id, label, from, durationInFrames }) => {
						const Scene = scenes[id];
						return (
							<Sequence
								key={id}
								name={label}
								from={from}
								durationInFrames={durationInFrames}
								premountFor={CHATGPT_TUTORIAL_FPS}
							>
								<Scene />
							</Sequence>
						);
					},
				)}
			</ChatGptShell>
			{chapter.id === "prepare" ? (
				<DemoCursor at={165} className="left-44 top-88" />
			) : null}
			<div className="absolute inset-x-0 top-0 h-24 border-b border-white/15 bg-neutral-900 px-8 py-3">
				<div className="mb-1 flex items-center justify-between text-base text-tutorial-muted">
					<span>
						{index + 1} / 5 · {chapter.label}
					</span>
					<span>Illustrated walkthrough</span>
				</div>
				<p className="text-2xl leading-8">
					{completingOAuth
						? "Complete Tabot OAuth in this Chrome profile, then finish enabling the plugin."
						: chapter.body}
				</p>
			</div>
		</AbsoluteFill>
	);
};
