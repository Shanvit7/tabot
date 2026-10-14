import ClaudeMono from "@lobehub/icons/es/Claude/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { claudePromptUrl } from "@tabot/shared";
import { Sparkles } from "lucide-react";
import {
	useAssistantConnection,
	useAssistantConnectionOrder,
} from "~/providers/assistant-connection";

export const AskChatGpt = ({
	href,
	connected,
	compact = false,
}: {
	href: string;
	connected: boolean;
	compact?: boolean;
}) => {
	const claudeConnected = useAssistantConnection("claude") === true;
	const assistantOrder = useAssistantConnectionOrder();
	const claudeHref = claudePromptUrl(
		new URL(href).searchParams.get("q") ??
			"Use my connected Tabot tools to explain this browser activity.",
	);
	const assistants = [
		...(connected ? [{ id: "chatgpt" as const, href, Icon: OpenAIMono }] : []),
		...(claudeConnected
			? [
					{
						id: "claude" as const,
						href: claudeHref,
						Icon: ClaudeMono,
					},
				]
			: []),
	];
	assistants.sort(
		(a, b) =>
			(assistantOrder?.indexOf(a.id) ?? 0) -
			(assistantOrder?.indexOf(b.id) ?? 0),
	);
	const ctaSize = compact
		? "whitespace-nowrap px-3 text-xs font-medium"
		: "w-full px-4 text-sm font-semibold";
	const ctaBase = `inline-flex min-h-11 items-center justify-center rounded-lg ${ctaSize}`;
	const renderAssistantLink = (
		assistant: (typeof assistants)[number],
		menuItem = false,
	) => {
		const Icon = assistant.Icon;
		return (
			<a
				key={assistant.id}
				href={assistant.href}
				target="_blank"
				rel="noopener noreferrer"
				className={
					menuItem
						? "inline-flex min-h-10 w-full items-center rounded-md px-3 text-sm text-[#e9f2e4] hover:bg-white/10"
						: `${ctaBase} ${assistant.id === "chatgpt" ? "bg-[#bfff00] text-preview-ink hover:bg-[#d0ff4d]" : "border border-[#476151] bg-white text-preview-ink hover:bg-[#f5f8f4]"}`
				}
			>
				<Icon
					className={`shrink-0 ${compact ? "mr-1.5 size-3.5" : "mr-2 size-4"}`}
					aria-hidden="true"
				/>
				{menuItem || compact || assistants.length === 1
					? `Ask ${assistant.id === "chatgpt" ? "ChatGPT" : "Claude"}`
					: "Ask AI"}
				{menuItem && <span className="sr-only"> (opens in a new tab)</span>}
				{!menuItem && assistant.id === "claude" && (
					<span className="sr-only"> (opens Claude in a new tab)</span>
				)}
			</a>
		);
	};

	return (
		<div className={`flex ${compact ? "gap-2" : "mt-5 flex-col gap-2"}`}>
			{assistants.length === 2 && compact ? (
				assistants.map((assistant) => renderAssistantLink(assistant))
			) : assistants.length === 2 ? (
				<details className="relative">
					<summary
						aria-label="Ask AI. Choose an assistant."
						className={`${ctaBase} ${compact ? "" : "w-full"} cursor-pointer list-none bg-[#bfff00] text-preview-ink hover:bg-[#d0ff4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bfff00] [&::-webkit-details-marker]:hidden`}
					>
						<Sparkles
							className={`shrink-0 ${compact ? "mr-1.5 size-3.5" : "mr-2 size-4"}`}
							aria-hidden="true"
						/>
						Ask AI
					</summary>
					<div className="absolute right-0 top-full z-20 mt-2 w-full min-w-44 overflow-hidden rounded-lg border border-[#1f3328] bg-[#101c16] p-1 shadow-xl">
						{assistants.map((assistant) =>
							renderAssistantLink(assistant, true),
						)}
					</div>
				</details>
			) : assistants.length === 1 ? (
				assistants.map((assistant) => renderAssistantLink(assistant))
			) : (
				<a
					href="/home#connectors-heading"
					className={`${ctaBase} bg-[#bfff00] text-preview-ink hover:bg-[#d0ff4d]`}
				>
					<Sparkles
						className={`shrink-0 ${compact ? "mr-1.5 size-3.5" : "mr-2 size-4"}`}
						aria-hidden="true"
					/>
					Ask AI
				</a>
			)}
		</div>
	);
};
