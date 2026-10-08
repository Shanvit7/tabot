import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Plug } from "lucide-react";

export const AskChatGpt = ({
	href,
	connected,
	label = "Ask ChatGPT",
	compact = false,
}: {
	href: string;
	connected: boolean;
	label?: string;
	compact?: boolean;
}) => (
	<a
		href={connected ? href : "/home#connectors-heading"}
		target={connected ? "_blank" : undefined}
		rel={connected ? "noopener noreferrer" : undefined}
		className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-[#bfff00] text-[#15251b] hover:bg-[#d0ff4d] ${compact ? "whitespace-nowrap px-3 text-xs font-medium" : "mt-5 w-full px-4 text-sm font-semibold"}`}
	>
		{connected ? (
			<OpenAIMono
				className={`shrink-0 ${compact ? "mr-1.5 size-3.5" : "mr-2 size-4"}`}
				aria-hidden="true"
			/>
		) : (
			<Plug
				className={`shrink-0 ${compact ? "mr-1.5 size-3.5" : "mr-2 size-4"}`}
				aria-hidden="true"
			/>
		)}
		{connected ? label : compact ? "Connect AI" : "Ask an AI assistant"}
	</a>
);
