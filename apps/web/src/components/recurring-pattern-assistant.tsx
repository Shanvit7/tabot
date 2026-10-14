import {
	chatGptPromptUrl,
	memoryPrompt,
	recurringPatternsPrompt,
} from "@tabot/shared";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";

export const RecurringPatternAssistant = ({
	memoryId,
	connected,
}: {
	memoryId?: string;
	connected: boolean;
}) => {
	if (memoryId) {
		return (
			<AskChatGpt
				href={chatGptPromptUrl(memoryPrompt(memoryId))}
				connected={connected}
				compact
			/>
		);
	}
	return (
		<div className="max-w-sm">
			<AskChatGpt
				href={chatGptPromptUrl(recurringPatternsPrompt())}
				connected={connected}
			/>
			<p className="mt-2 text-xs leading-5 text-(--work-muted)">
				Shares sanitized pattern evidence. Site names remain visible; raw events
				stay local.
			</p>
		</div>
	);
};
