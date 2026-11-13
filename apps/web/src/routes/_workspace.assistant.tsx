import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import type { PlayerRef } from "@remotion/player";
import {
	chatGptConnectPromptUrl,
	chatGptPromptUrl,
	resolveChatGptConnectUrl,
} from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ListOrdered, Play, RefreshCw } from "lucide-react";
import {
	AnimatePresence,
	domAnimation,
	LazyMotion,
	m,
	useReducedMotion,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DingToaster, toast } from "~/components/alerts/ding-toaster";
import { AssistantConnectionPanel } from "~/components/features/assistant/panels/connection-panel";
import { AssistantDemoPanel } from "~/components/features/assistant/panels/demo-panel";
import { AssistantSetupPanel } from "~/components/features/assistant/panels/setup-panel";
import FluidTabs from "~/components/ui/motion/tabs/fluid-tabs";
import { readAssistantConnections } from "~/lib/history";

const MCP_SERVER_URL = `https://tabot-mcp${import.meta.env.DEV ? "-dev" : ""}.shanvit7.workers.dev/mcp`;
const PLUGIN_DESCRIPTION =
	"Bring selected Chrome context into ChatGPT. Your history stays on your device; only requested results are shared.";
const CHATGPT_DIAGNOSE_URL = chatGptPromptUrl(
	"Help me diagnose why my Tabot MCP connection is not working in ChatGPT. First check whether Tabot tools are available in this conversation. If available, make one safe, read-only call with valid arguments and report the exact result. If unavailable or failing, guide me one step at a time through checking the ChatGPT MCP server registration, OAuth authorization, and that the Tabot Chrome extension is enabled in the same Chrome profile. Don't guess UI labels or claim success without verification. Never ask me to share passwords, tokens, or browsing history.",
);

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

	useEffect(() => {
		let active = true;
		void resolveChatGptConnectUrl().then((url) => {
			if (active) setConnectUrl(url);
		});
		const refreshConnection = () => {
			void readAssistantConnections()
				.then(({ chatgpt }) => {
					if (active) setChatGptConnected(chatgpt);
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

	const checkConnection = () => {
		const check = readAssistantConnections().then(({ chatgpt }) => {
			setChatGptConnected(chatgpt);
			window.dispatchEvent(new Event("tabot:connection-check"));
			if (!chatgpt) {
				setTab(2);
				throw new Error(
					"ChatGPT isn’t connected. Review troubleshooting tips.",
				);
			}
		});
		void toast
			.promise(check, {
				loading: "Checking ChatGPT connection…",
				success: "ChatGPT connection is active",
				error: (error) =>
					error instanceof Error
						? error.message
						: "Couldn’t check the connection. Keep Tabot open and try again.",
			})
			.catch(() => {});
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
						<FluidTabs.Tab
							label={chatGptConnected ? "Connected" : "Troubleshoot"}
							className="cursor-pointer gap-2 text-work-ink"
						>
							{chatGptConnected ? (
								<Check aria-hidden="true" className="size-4" />
							) : (
								<RefreshCw aria-hidden="true" className="size-4" />
							)}
							{chatGptConnected ? "Connected" : "Troubleshoot"}
						</FluidTabs.Tab>
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
										: chatGptConnected
											? "ChatGPT connection status"
											: "ChatGPT troubleshooting"
							}
							initial={reduceMotion ? false : { opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
							transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
							className="mt-4"
						>
							{tab === 0 ? (
								<AssistantDemoPanel playerRef={playerRef} />
							) : tab === 1 ? (
								<AssistantSetupPanel
									connectUrl={connectUrl}
									serverUrl={MCP_SERVER_URL}
									description={PLUGIN_DESCRIPTION}
									copyStatus={copyStatus}
									descriptionCopyStatus={descriptionCopyStatus}
									onCopyServerUrl={() => void copyServerUrl()}
									onCopyDescription={() => void copyPluginDescription()}
								/>
							) : (
								<AssistantConnectionPanel
									chatGptConnected={chatGptConnected}
									connectUrl={connectUrl}
									diagnoseUrl={CHATGPT_DIAGNOSE_URL}
									onCheckConnection={checkConnection}
									onShowInstructions={() => setTab(1)}
								/>
							)}
						</m.section>
					</AnimatePresence>
				</LazyMotion>
			</div>
			<DingToaster position="top-center" />
		</main>
	);
};

export const Route = createFileRoute("/_workspace/assistant")({
	ssr: false,
	head: () => ({ meta: [{ title: "Assistant · Tabot" }] }),
	component: Assistant,
});
