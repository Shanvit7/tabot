import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Player, type PlayerRef } from "@remotion/player";
import {
	chatGptConnectPromptUrl,
	chatGptPromptUrl,
	resolveChatGptConnectUrl,
} from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	ChevronDown,
	Copy,
	Download,
	ListOrdered,
	Play,
	RefreshCw,
} from "lucide-react";
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
import { readAssistantConnections } from "~/lib/history";

const MCP_SERVER_URL = `https://tabot-mcp${import.meta.env.DEV ? "-dev" : ""}.shanvit7.workers.dev/mcp`;
const PLUGIN_DESCRIPTION =
	"Search your local browser activity with ChatGPT. Your browsing history stays on your device; only results you request are shared.";
const CHATGPT_DIAGNOSE_URL = chatGptPromptUrl(
	"Help me diagnose why my Tabot MCP connection is not working in ChatGPT. First check whether Tabot tools are available in this conversation. If available, make one safe, read-only call with valid arguments and report the exact result. If unavailable or failing, guide me one step at a time through checking the ChatGPT MCP server registration, OAuth authorization, and that the Tabot Chrome extension is enabled in the same Chrome profile. Don't guess UI labels or claim success without verification. Never ask me to share passwords, tokens, or browsing history.",
);

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
			"Name it Tabot, choose OAuth, and paste the server URL below. Leave advanced settings unchanged.",
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
	const [descriptionCopyStatus, setDescriptionCopyStatus] = useState<
		"idle" | "copied" | "error"
	>("idle");
	const [chatGptConnected, setChatGptConnected] = useState<boolean | null>(
		null,
	);
	const [connectionCheck, setConnectionCheck] = useState<
		"idle" | "checking" | "connected" | "disconnected" | "error"
	>("idle");

	useEffect(() => {
		let active = true;
		void resolveChatGptConnectUrl().then((url) => {
			if (active) setConnectUrl(url);
		});
		const refreshConnection = () => {
			void readAssistantConnections()
				.then(({ chatgpt }) => {
					if (!active) return;
					setChatGptConnected(chatgpt);
					if (!chatgpt) setTab((current) => (current === 2 ? 1 : current));
				})
				.catch(() => {
					if (active) setChatGptConnected(null);
				});
		};
		refreshConnection();
		window.addEventListener("focus", refreshConnection);
		return () => {
			active = false;
			window.removeEventListener("focus", refreshConnection);
		};
	}, []);

	const checkConnection = async () => {
		setConnectionCheck("checking");
		try {
			const { chatgpt } = await readAssistantConnections();
			setChatGptConnected(chatgpt);
			setConnectionCheck(chatgpt ? "connected" : "disconnected");
			window.dispatchEvent(new Event("tabot:connection-check"));
			if (!chatgpt) setTab(1);
		} catch {
			setConnectionCheck("error");
		}
	};

	const copyServerUrl = async () => {
		try {
			await navigator.clipboard.writeText(MCP_SERVER_URL);
			setCopyStatus("copied");
		} catch {
			setCopyStatus("error");
		}
		window.setTimeout(() => setCopyStatus("idle"), 1800);
	};

	const copyPluginDescription = async () => {
		try {
			await navigator.clipboard.writeText(PLUGIN_DESCRIPTION);
			setDescriptionCopyStatus("copied");
		} catch {
			setDescriptionCopyStatus("error");
		}
		window.setTimeout(() => setDescriptionCopyStatus("idle"), 1800);
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
							label="Demo"
							className="cursor-pointer gap-2 text-work-ink"
						>
							<Play aria-hidden="true" className="size-4" /> Demo
						</FluidTabs.Tab>
						<FluidTabs.Tab
							label="Instructions"
							className="cursor-pointer gap-2 text-work-ink"
						>
							<ListOrdered aria-hidden="true" className="size-4" /> Instructions
						</FluidTabs.Tab>
						{chatGptConnected && (
							<FluidTabs.Tab
								label="Connected"
								className="cursor-pointer gap-2 text-work-ink"
							>
								<Check aria-hidden="true" className="size-4" /> Connected
							</FluidTabs.Tab>
						)}
					</FluidTabs.List>
				</FluidTabs>

				<LazyMotion features={domAnimation}>
					<AnimatePresence mode="wait" initial={false}>
						<m.section
							key={tab}
							role="tabpanel"
							aria-label={
								tab === 0
									? "Video demo"
									: tab === 1
										? "Instructions"
										: "ChatGPT connection status"
							}
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
							) : tab === 1 ? (
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
														<div className="mt-3 text-sm">
															<div>
																<h4 className="font-medium text-work-ink">
																	Server URL
																</h4>
																<div className="mt-2 flex flex-wrap items-center gap-2">
																	<code className="min-w-0 flex-1 basis-48 select-text break-all rounded-md bg-work-raised px-3 py-2 font-mono text-xs leading-5 text-work-ink">
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
																		className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-work-line px-3 text-xs font-medium text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
																		<span role="status">
																			{copyStatus === "copied"
																				? "Copied URL"
																				: "Copy URL"}
																		</span>
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
															<details className="group/details mt-3 border-t border-work-line">
																<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-work-muted transition-colors hover:text-work-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
																	<ChevronDown
																		aria-hidden="true"
																		className="size-4 shrink-0 transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
																	/>
																	<span className="font-medium">
																		Add description and logo
																	</span>
																	<span className="text-xs">Optional</span>
																</summary>
																<div className="space-y-4 pb-3 pl-6">
																	<div>
																		<h4 className="font-medium text-work-ink">
																			Description
																		</h4>
																		<p className="mt-2 max-w-prose select-text rounded-md bg-work-raised px-3 py-2 text-sm leading-6 text-work-ink">
																			{PLUGIN_DESCRIPTION}
																		</p>
																		<button
																			type="button"
																			onClick={() =>
																				void copyPluginDescription()
																			}
																			aria-label={
																				descriptionCopyStatus === "copied"
																					? "Description copied"
																					: "Copy description"
																			}
																			className="mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-work-line px-3 text-xs font-medium text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
																		>
																			{descriptionCopyStatus === "copied" ? (
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
																			<span role="status">
																				{descriptionCopyStatus === "copied"
																					? "Copied description"
																					: "Copy description"}
																			</span>
																		</button>
																		{descriptionCopyStatus === "error" && (
																			<p
																				role="status"
																				className="mt-1 text-xs text-work-muted"
																			>
																				Couldn’t copy. Select the description to
																				copy it manually.
																			</p>
																		)}
																	</div>
																	<div className="border-t border-work-line pt-4">
																		<h4 className="font-medium text-work-ink">
																			Logo
																		</h4>
																		<div className="mt-2 flex flex-wrap items-center gap-3">
																			<img
																				src={`${import.meta.env.BASE_URL}logo.png`}
																				alt="Tabot logo preview"
																				width="64"
																				height="64"
																				className="size-16 shrink-0 rounded-lg border border-work-line object-contain"
																			/>
																			<a
																				href={`${import.meta.env.BASE_URL}logo.png`}
																				download="tabot-logo.png"
																				className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-work-line px-3 text-xs font-medium text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
																			>
																				<Download
																					aria-hidden="true"
																					className="size-3.5"
																				/>{" "}
																				Download logo
																			</a>
																		</div>
																	</div>
																</div>
															</details>
														</div>
													)}
												</div>
											</li>
										))}
									</ol>
								</div>
							) : (
								<section
									aria-label="ChatGPT connection status"
									className="max-w-3xl rounded-xl border border-work-line bg-work-surface"
								>
									<div className="space-y-4 p-5 sm:p-6">
										<div>
											<h3 className="font-heading text-lg font-semibold leading-6 tracking-tight text-work-ink">
												Having trouble connecting?
											</h3>
											<p className="mt-1 max-w-prose text-base leading-7 text-work-muted">
												Check your connection or walk through the setup steps.
											</p>
										</div>
										<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
											<a
												href={CHATGPT_DIAGNOSE_URL}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											>
												<OpenAIMono aria-hidden="true" className="size-4" />
												Ask ChatGPT to diagnose
												<span className="sr-only">(opens in a new tab)</span>
											</a>
											<button
												type="button"
												disabled={connectionCheck === "checking"}
												onClick={() => void checkConnection()}
												className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-work-line px-4 text-sm font-semibold text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-70"
											>
												<RefreshCw
													aria-hidden="true"
													className={`size-4 ${connectionCheck === "checking" ? "animate-spin" : ""}`}
												/>
												{connectionCheck === "checking"
													? "Checking…"
													: "Check connection"}
											</button>
											<button
												type="button"
												onClick={() => setTab(1)}
												className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 text-sm font-semibold text-work-ink hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											>
												Review setup steps
											</button>
										</div>
										{connectionCheck !== "idle" &&
											connectionCheck !== "checking" && (
												<p
													role="status"
													className="text-sm leading-6 text-work-muted"
												>
													{connectionCheck === "connected"
														? "Connection is working."
														: connectionCheck === "disconnected"
															? "Connection is not active. Review setup steps to reconnect."
															: "Could not check connection. Keep Tabot open in this Chrome profile and try again."}
												</p>
											)}
										<p className="text-sm leading-6 text-work-muted">
											To disconnect, remove Tabot from ChatGPT Settings → Apps.
										</p>
									</div>
								</section>
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
