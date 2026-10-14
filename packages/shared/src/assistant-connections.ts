export type AssistantProvider = "chatgpt" | "claude";

export type AssistantConnections = Record<AssistantProvider, boolean> & {
	order?: AssistantProvider[];
};

export const parseAssistantConnections = (
	value: unknown,
): AssistantConnections | null => {
	if (
		!value ||
		typeof value !== "object" ||
		!("chatgpt" in value) ||
		typeof value.chatgpt !== "boolean" ||
		!("claude" in value) ||
		typeof value.claude !== "boolean"
	)
		return null;
	const candidate = value as Record<string, unknown>;
	const order: AssistantProvider[] = Array.isArray(candidate.order)
		? candidate.order.filter(
				(provider: unknown): provider is AssistantProvider =>
					(provider === "chatgpt" || provider === "claude") &&
					candidate[provider] === true,
			)
		: [];
	return {
		chatgpt: value.chatgpt,
		claude: value.claude,
		order: [...new Set(order)],
	};
};

export const assistantProviderFromClientName = (
	clientName: string,
): AssistantProvider | null => {
	const name = clientName.toLowerCase();
	if (name.includes("claude")) return "claude";
	if (name.includes("chatgpt") || name.includes("openai")) return "chatgpt";
	return null;
};
