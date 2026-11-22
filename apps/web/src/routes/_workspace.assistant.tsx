import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import type { PlayerRef } from "@remotion/player";
import {
	chatGptConnectPromptUrl,
	chatGptPromptUrl,
	resolveChatGptConnectUrl,
} from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered, Play } from "lucide-react";
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
import { CONNECTION_TAB_LABEL } from "~/components/features/assistant/panels/connection-tab-label";
import { AssistantDemoPanel } from "~/components/features/assistant/panels/demo-panel";
import { AssistantSetupPanel } from "~/components/features/assistant/panels/setup-panel";
import { useConnectionHealth } from "~/components/features/assistant/panels/use-connection-health";
import FluidTabs from "~/components/ui/motion/tabs/fluid-tabs";
import { MCP_SERVER_URL } from "~/lib/constants";

const PLUGIN_DESCRIPTION =
	"Bring selected Chrome context into ChatGPT. Your history stays on your device; only requested results are shared.";
const CHATGPT_DIAGNOSE_URL = chatGptPromptUrl(
	"Help me figure out why ChatGPT can’t use Tabot. First check whether Tabot is available in this conversation. If it is, make one safe, read-only request with valid arguments and tell me exactly what happened. If it isn’t available or the request fails, guide me one step at a time through checking that Tabot is added and enabled in ChatGPT, that this ChatGPT account is connected to Tabot, and that the Tabot extension is enabled in the same Chrome profile. Explain steps in plain language. Don’t guess at screen labels or say something worked unless you verified it. Never ask me to share passwords, tokens, or browsing history.",
);
const CONNECTION_DOT_CLASS = {
	checking: "animate-pulse bg-work-muted motion-reduce:animate-none",
	"extension-unreachable": "bg-red-600",
	"not-authorized": "bg-work-muted",
	"auth-unknown": "bg-amber-500",
	"relay-connecting": "animate-pulse bg-amber-500 motion-reduce:animate-none",
	"relay-offline": "bg-red-600",
	"round-trip-failed": "bg-red-600",
	healthy: "bg-emerald-600",
} as const;

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
	const { state, reconnecting, reconnect, refresh } = useConnectionHealth();

	useEffect(() => {
		let active = true;
		void resolveChatGptConnectUrl().then((url) => {
			if (active) setConnectUrl(url);
		});
		return () => {
			active = false;
		};
	}, []);

	const checkConnection = () => {
		const check = refresh().then((next) => {
			window.dispatchEvent(new Event("tabot:connection-check"));
			if (next !== "healthy") {
				setTab(2);
				throw new Error(
					`${CONNECTION_TAB_LABEL[next]}. See the Connection tab.`,
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

	const copyExtensionsLink = async () => {
		try {
			await navigator.clipboard.writeText("chrome://extensions");
			toast.success("Address copied", {
				description: "Paste it into Chrome’s address bar to check Tabot.",
			});
		} catch {
			toast.error("Couldn’t copy the address", {
				description: "Type chrome://extensions into Chrome’s address bar.",
			});
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
						<FluidTabs.Tab
							label={CONNECTION_TAB_LABEL[state]}
							className="cursor-pointer gap-2 whitespace-nowrap text-work-ink"
						>
							<span
								aria-hidden="true"
								className={`size-2.5 rounded-full ${CONNECTION_DOT_CLASS[state]}`}
							/>
							<span className="whitespace-nowrap">
								{CONNECTION_TAB_LABEL[state]}
							</span>
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
										: "ChatGPT connection status"
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
									state={state}
									reconnecting={reconnecting}
									onReconnect={() => void reconnect()}
									onCopyExtensionsLink={copyExtensionsLink}
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
