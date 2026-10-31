import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Player, type PlayerRef } from "@remotion/player";
import {
	chatGptConnectPromptUrl,
	CLAUDE_MCP_SERVER_URL as MCP_SERVER_URL,
	resolveChatGptConnectUrl,
} from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, ListOrdered, Play } from "lucide-react";
import {
	AnimatePresence,
	domAnimation,
	LazyMotion,
	m,
	useReducedMotion,
} from "motion/react";
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
	{
		title: "Use the same Chrome profile",
		description: "Keep Tabot open in the profile you use for ChatGPT.",
	},
	{
		title: "Add a custom MCP server",
		description: "ChatGPT → Plugins → Add → Add custom MCP server.",
	},
	{
		title: "Configure Tabot",
		description:
			"Copy the server URL below into ChatGPT’s server URL field. Name it Tabot, choose OAuth, and leave advanced settings unchanged.",
		serverUrl: MCP_SERVER_URL,
	},
	{
		title: "Review and authorize",
		description:
			"Approve in Chrome, then enable in ChatGPT. Browsing data stays on-device; Tabot’s relay stores none of it. Only requested results reach ChatGPT.",
	},
	{
		title: "Ask about your browsing activity",
		description:
			"Find pages or notes, see activity around a visit, or ask ChatGPT for a timeline or summary.",
	},
];

const Assistant = () => {
	const playerRef = useRef<PlayerRef>(null);
	const reduceMotion = useReducedMotion();
	const [tab, setTab] = useState(0);
	const [connectUrl, setConnectUrl] = useState(chatGptConnectPromptUrl);
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
		"idle",
	);

	useEffect(() => {
		let active = true;
		void resolveChatGptConnectUrl().then((url) => {
			if (active) setConnectUrl(url);
		});
		return () => {
			active = false;
		};
	}, []);

	const copyServerUrl = async () => {
		try {
			await navigator.clipboard.writeText(MCP_SERVER_URL);
			setCopyStatus("copied");
		} catch {
			setCopyStatus("error");
		}
		window.setTimeout(() => setCopyStatus("idle"), 1800);
	};

	return (
		<main className="min-h-svh bg-background px-5 pb-32 pt-8 text-foreground sm:px-10 sm:pt-12">
			<div className="mx-auto max-w-5xl">
				<header className="mb-6 flex items-center gap-3">
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
						<FluidTabs.Tab
							label="Video demo"
							className="cursor-pointer gap-2 text-work-ink"
						>
							<Play aria-hidden="true" className="size-4" /> Video demo
						</FluidTabs.Tab>
						<FluidTabs.Tab
							label="Instructions"
							className="cursor-pointer gap-2 text-work-ink"
						>
							<ListOrdered aria-hidden="true" className="size-4" /> Instructions
						</FluidTabs.Tab>
					</FluidTabs.List>
				</FluidTabs>

				<LazyMotion features={domAnimation}>
					<AnimatePresence mode="wait" initial={false}>
						<m.section
							key={tab}
							role="tabpanel"
							aria-label={tab === 0 ? "Video demo" : "Instructions"}
							initial={reduceMotion ? false : { opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
							transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
							className="mt-4"
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
										className="absolute! inset-0! h-full! w-full!"
									/>
								</div>
							) : (
								<div className="max-w-3xl">
									<div className="mb-2 flex items-center justify-between gap-3">
										<h2 className="text-base font-semibold text-work-ink">
											Setup steps
										</h2>
										<a
											href={connectUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-lime/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										>
											<OpenAIMono aria-hidden="true" className="size-4" />
											Ask ChatGPT to help
											<span className="sr-only">(opens in a new tab)</span>
										</a>
									</div>
									<ol className="divide-y divide-work-line border-y border-work-line">
										{steps.map((step, index) => (
											<li
												key={step.title}
												className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 py-2 sm:gap-x-4"
											>
												<span
													aria-hidden="true"
													className="pt-0.5 font-mono text-xs tabular-nums text-work-muted"
												>
													{String(index + 1).padStart(2, "0")}
												</span>
												<div className="min-w-0">
													<h3 className="text-sm font-medium leading-5 text-work-ink">
														{step.title}
													</h3>
													<p className="text-sm leading-5 text-work-muted">
														{step.description}
													</p>
													{step.serverUrl && (
														<div>
															<div className="mt-2 flex items-center gap-2">
																<code className="min-w-0 flex-1 break-all rounded-md bg-work-raised px-2 py-1.5 font-mono text-xs leading-5 text-work-ink">
																	{step.serverUrl}
																</code>
																<button
																	type="button"
																	onClick={() => void copyServerUrl()}
																	aria-label={
																		copyStatus === "copied"
																			? "Tabot server URL copied"
																			: "Copy Tabot server URL"
																	}
																	className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-work-line px-2.5 text-xs font-medium text-work-ink hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
																>
																	{copyStatus === "copied" ? (
																		<Check
																			aria-hidden="true"
																			className="size-3.5"
																		/>
																	) : (
																		<Copy
																			aria-hidden="true"
																			className="size-3.5"
																		/>
																	)}
																	{copyStatus === "copied" ? "Copied" : "Copy"}
																</button>
															</div>
															{copyStatus === "error" && (
																<p
																	role="status"
																	className="mt-1 text-xs text-work-muted"
																>
																	Couldn’t copy. Select the URL to copy it
																	manually.
																</p>
															)}
														</div>
													)}
												</div>
											</li>
										))}
									</ol>
								</div>
							)}
						</m.section>
					</AnimatePresence>
				</LazyMotion>
			</div>
		</main>
	);
};

export const Route = createFileRoute("/_workspace/assistant")({
	ssr: false,
	head: () => ({ meta: [{ title: "Assistant · Tabot" }] }),
	component: Assistant,
});
