import ClaudeMono from "@lobehub/icons/es/Claude/components/Mono";
import GeminiMono from "@lobehub/icons/es/Gemini/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import {
	CLAUDE_CONNECTORS_URL,
	chatGptConnectPromptUrl,
	resolveChatGptConnectUrl,
} from "@tabot/shared";
import { useEffect, useState } from "react";
import { focusConnectorsHeading } from "~/components/connector-utils";
import {
	useAssistantConnection,
	useAssistantConnectionOrder,
} from "~/providers/assistant-connection";

const CTA_CLASS =
	"flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-[8px] border px-2 py-2";
const PRIMARY_CTA_CLASS = `${CTA_CLASS} border-(--work-ink) bg-(--work-ink) text-white no-underline`;
const connectionStatus = (connected: boolean | null | undefined) =>
	connected === true
		? "Connected"
		: connected === false
			? ""
			: connected === null
				? "Status unknown"
				: "Checking…";

export const Connectors = () => {
	const chatGptConnected = useAssistantConnection("chatgpt");
	const claudeConnected = useAssistantConnection("claude");
	const connectedOrder = useAssistantConnectionOrder();
	const [chatGptUrl, setChatGptUrl] = useState(chatGptConnectPromptUrl);
	const assistantOrder = [
		...connectedOrder,
		...(["chatgpt", "claude"] as const).filter(
			(provider) => !connectedOrder.includes(provider),
		),
	];
	const chatGptOrderClass =
		assistantOrder[0] === "chatgpt" ? "order-1" : "order-2";
	const claudeOrderClass =
		assistantOrder[0] === "claude" ? "order-1" : "order-2";
	const ChatGptTile = chatGptConnected !== true ? "a" : "div";
	const ClaudeTile = claudeConnected !== true ? "a" : "div";

	useEffect(() => {
		let active = true;
		void resolveChatGptConnectUrl().then((url) => {
			if (active) setChatGptUrl(() => url);
		});
		return () => {
			active = false;
		};
	}, []);

	return (
		<section
			aria-labelledby="connectors-heading"
			className="work-rule mt-14 border-t pt-6"
		>
			<div>
				<h2
					ref={focusConnectorsHeading}
					id="connectors-heading"
					tabIndex={-1}
					className="scroll-mt-6 text-lg font-semibold"
				>
					AI Assistants
				</h2>
				<p className="mt-1 text-[13px] leading-5 text-(--work-muted)">
					Ask your AI assistant about your browsing activity.
				</p>
				<div className="mt-4 grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
					<ChatGptTile
						href={chatGptConnected !== true ? chatGptUrl : undefined}
						target={chatGptConnected !== true ? "_blank" : undefined}
						rel={chatGptConnected !== true ? "noopener noreferrer" : undefined}
						className={`${PRIMARY_CTA_CLASS} ${chatGptOrderClass} ${chatGptConnected !== true ? "hover:bg-[#304939]" : "cursor-default"}`}
					>
						<span className="flex flex-col items-center gap-2 text-[15px] font-medium sm:flex-row">
							<OpenAIMono className="size-5 shrink-0" aria-hidden="true" />
							{chatGptConnected ? "ChatGPT" : "Connect ChatGPT"}
						</span>
						<span role="status" className="text-center text-[13px] leading-5">
							{connectionStatus(chatGptConnected)}
						</span>
						{chatGptConnected !== true && (
							<span className="sr-only">(opens ChatGPT in a new tab)</span>
						)}
					</ChatGptTile>
					<ClaudeTile
						href={claudeConnected !== true ? CLAUDE_CONNECTORS_URL : undefined}
						target={claudeConnected !== true ? "_blank" : undefined}
						rel={claudeConnected !== true ? "noopener noreferrer" : undefined}
						className={`${PRIMARY_CTA_CLASS} ${claudeOrderClass} ${claudeConnected !== true ? "hover:bg-[#304939]" : "cursor-default"}`}
					>
						<span className="flex flex-col items-center gap-2 text-[15px] font-medium sm:flex-row">
							<ClaudeMono className="size-5 shrink-0" aria-hidden="true" />
							{claudeConnected ? "Claude" : "Connect Claude"}
						</span>
						<span role="status" className="text-center text-[13px] leading-5">
							{connectionStatus(claudeConnected)}
						</span>
						{claudeConnected !== true && (
							<span className="sr-only">
								(opens Claude connectors in a new tab)
							</span>
						)}
					</ClaudeTile>
					<button
						type="button"
						disabled
						className={`${CTA_CLASS} order-3 cursor-not-allowed border-(--work-line) bg-(--work-surface) text-(--work-muted)`}
					>
						<span className="flex flex-col items-center gap-2 text-[15px] font-medium sm:flex-row">
							<GeminiMono className="size-5 shrink-0" aria-hidden="true" />
							Gemini & More
						</span>
						<span className="whitespace-nowrap text-[13px] leading-5">
							Coming soon
						</span>
					</button>
				</div>
				{chatGptConnected === null && claudeConnected === null && (
					<p className="mt-3 text-[13px] leading-5 text-(--work-muted)">
						Assistant connection status unavailable. Update the extension and
						MCP server to check provider status.
					</p>
				)}
				<p className="mt-4 text-[13px] leading-5 text-(--work-muted)">
					Your browsing stays on this device. Only the activity details you
					request are sent to your connected assistant.
				</p>
			</div>
		</section>
	);
};
