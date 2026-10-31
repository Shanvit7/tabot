import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Player, type PlayerRef } from "@remotion/player";
import {
	chatGptConnectPromptUrl,
	CLAUDE_MCP_SERVER_URL as MCP_SERVER_URL,
	resolveChatGptConnectUrl,
} from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, ListOrdered, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import FluidTabs from "~/../components/animata/tabs/fluid-tabs";
import { ChatGptConnectionTutorial } from "~/components/assistant/chatgpt-connection-tutorial";
import {
	CHATGPT_TUTORIAL_DURATION,
	CHATGPT_TUTORIAL_FPS,
	CHATGPT_TUTORIAL_HEIGHT,
	CHATGPT_TUTORIAL_WIDTH,
} from "~/components/assistant/chatgpt-tutorial/timeline";

const steps = [
	"Keep Tabot running in same Chrome profile as ChatGPT.",
	"In ChatGPT, open Plugins → Add → Add custom MCP server.",
	"Name it Tabot, paste server URL, choose OAuth. Leave advanced settings unchanged.",
	"Review warning, approve Tabot in same Chrome profile, then enable it in ChatGPT.",
	'Ask Tabot to summarize your research on a topic you visited.',
];

const Assistant = () => {
	const playerRef = useRef<PlayerRef>(null);
	const reduceMotion = useReducedMotion();
	const [tab, setTab] = useState(0);
	const [connectUrl, setConnectUrl] = useState(chatGptConnectPromptUrl);

	useEffect(() => {
		let active = true;
		void resolveChatGptConnectUrl().then((url) => {
			if (active) setConnectUrl(url);
		});
		return () => {
			active = false;
		};
	}, []);

	return (
		<main className="min-h-svh bg-background px-5 pb-32 pt-10 text-foreground sm:px-10 sm:pt-14">
			<div className="mx-auto max-w-5xl">
				<header className="mb-8 flex items-center gap-3">
					<OpenAIMono aria-hidden="true" className="size-7 text-work-ink" />
					<h1 className="text-2xl font-semibold tracking-tight">
						Connect Tabot to ChatGPT
					</h1>
				</header>

				<FluidTabs
					activeIndex={tab}
					onActiveIndexChange={setTab}
					className="mx-0 max-w-none justify-start"
				>
					<FluidTabs.List
						aria-label="Connection guide"
						className="bg-work-raised"
					>
						<FluidTabs.Tab label="Video demo" className="gap-2 text-work-ink">
							<Play aria-hidden="true" className="size-4" /> Video demo
						</FluidTabs.Tab>
						<FluidTabs.Tab label="Instructions" className="gap-2 text-work-ink">
							<ListOrdered aria-hidden="true" className="size-4" /> Instructions
						</FluidTabs.Tab>
					</FluidTabs.List>
				</FluidTabs>

				<AnimatePresence mode="wait" initial={false}>
					<motion.section
						key={tab}
						role="tabpanel"
						aria-label={tab === 0 ? "Video demo" : "Instructions"}
						initial={reduceMotion ? false : { opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
						transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
						className="mt-5"
					>
						{tab === 0 ? (
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
									className="!absolute !inset-0 !h-full !w-full"
								/>
							</div>
						) : (
							<div className="max-w-2xl">
								<ol className="list-inside list-decimal space-y-4 text-base leading-7 marker:font-medium marker:text-work-muted">
									{steps.map((step) => (
										<li key={step}>{step}</li>
									))}
								</ol>
								<div className="mt-6 border-t border-work-line pt-5">
									<p className="mb-2 text-sm font-medium text-work-muted">
										Server URL
									</p>
									<code className="block break-words text-sm text-work-ink">
										{MCP_SERVER_URL}
									</code>
									<a
										href={connectUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="pt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-lime/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
									>
										Open ChatGPT{" "}
										<ArrowUpRight aria-hidden="true" className="size-4" />
										<span className="sr-only"> (opens in a new tab)</span>
									</a>
								</div>
							</div>
						)}
					</motion.section>
				</AnimatePresence>
			</div>
		</main>
	);
};

export const Route = createFileRoute("/_workspace/assistant")({
	ssr: false,
	head: () => ({ meta: [{ title: "Assistant · Tabot" }] }),
	component: Assistant,
});
