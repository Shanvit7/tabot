// packages/shared/src/share/targets.ts
// Share-context target definitions (name / prefill URL / prompt), icon-free so
// the extension popup can list providers without pulling @lobehub/icons.
// The web dashboard adds icons on top (apps/web/src/lib/share-targets.ts).

export interface AiTargetDef {
	name: string;
	prompt: string;
}

export type WebTargetDef = AiTargetDef & { url: string };
export type CliTargetDef = AiTargetDef & { cmd: string };

// Prefill URL per provider (param CTA from product docs). Ollama has no prefill
// URL — it just copies to clipboard.
const prefillUrl = (base: string, param: string, value: string): string =>
	`${base}${base.includes("?") ? "&" : "?"}${param}=${encodeURIComponent(value)}`;

export const contextPrompt = (id: string): string =>
	`Help me make sense of this stretch of browsing. Use my connected Tabot tool get_context with id "${id}". Reconstruct the sequence of sites and activity, explain how they connect, and highlight anything useful to pick up where I left off. Start with a short recap, then suggest a concrete next step grounded in this activity. Keep observed facts distinct from possible interpretations.`;

export const chatGptContextUrl = (id: string): string =>
	prefillUrl("https://chatgpt.com/", "q", contextPrompt(id));

// Retrieve the selected pattern or the contexts supporting the selected place.
/** Only range and optional origin go into the prefill; metrics come from the authorized tool. */
export const activityMetricsPrompt = (
	from: number,
	to: number,
	origin?: string,
): string =>
	`Help me understand ${origin ? `my visits to ${JSON.stringify(origin)}` : "this period of browsing"}. Use my connected Tabot tool get_activity_metrics with these exact arguments: ${JSON.stringify({ from, to, ...(origin ? { origin } : {}) })}. The range is Unix milliseconds, from inclusive to exclusive. Summarize estimated time, visits, active days, and site transitions. The summary covers the whole period; when an origin is provided, sites and transitions focus on that place. Treat time as an estimate, not attention or productivity. Note empty or truncated results, and keep observations separate from interpretations. Suggest one useful question or next step grounded in these metrics.`;

export const recurringPatternsPrompt = (): string =>
	'Help me understand my recurring browsing patterns. Use my connected Tabot tool list_recurring_patterns with {"limit":10}, then get_memory for up to three relevant pattern ids. Summarize observed repetition, compare what stays similar versus changes across the returned occurrences, and suggest one useful next step or resume checklist grounded in that evidence. Treat confidence as heuristic similarity, not a probability of intent or productivity. Fingerprint and occurrence sequences show derived first-occurrence ordering, not complete navigation traces or proof of an exact repeated workflow. Note missing or truncated results and that discovery covers only the latest 500 activity summaries. Keep observations separate from possible explanations.';

export const memoryPrompt = (id: string): string =>
	`Help me understand this recurring browsing pattern. Use my connected Tabot tool get_memory with id ${JSON.stringify(id)}. Explain which site sequences recur and when, compare what stays similar versus changes across the returned occurrences, and suggest one practical takeaway or resume checklist grounded in the evidence. Use get_context for a selected supporting activity summary id if needed. Treat confidence as heuristic similarity, not a probability of intent; observed period bounds are not continuous attention. Fingerprint and occurrence sequences show derived first-occurrence ordering, not complete navigation traces or proof of an exact repeated workflow. Note missing or truncated results. Keep observed repetition distinct from possible explanations for it.`;

export const sitePrompt = (domain: string, contextIds: string[]): string =>
	`Help me understand my visits to ${JSON.stringify(domain)}. Use my connected Tabot tool get_context for these activity summary ids: ${JSON.stringify(contextIds)}. Focus on this place within those browsing stretches: when I visited, which other sites appeared around it, and what changed or repeated between visits. Start with a short summary, then offer a useful connection or next step supported by the activity. Keep observed facts distinct from possible interpretations.`;

export const chatGptPromptUrl = (prompt: string): string =>
	prefillUrl("https://chatgpt.com/", "q", prompt);

export const WEB_TARGET_DEFS: WebTargetDef[] = [
	{
		name: "ChatGPT",
		url: prefillUrl(
			"https://chatgpt.com/",
			"q",
			"I'm using Tabot, a local browser activity timeline. The selected content below is from my browser activity. Analyze it in the context of the browsing activity it represents. Explain what I was looking at, identify useful context or patterns, and surface anything interesting, important, or easy to miss. Don't just paraphrase it—help me understand what this activity tells me.",
		),
		prompt:
			"I'm using Tabot, a local browser activity timeline. The selected content below is from my browser activity. Analyze it in the context of the browsing activity it represents. Explain what I was looking at, identify useful context or patterns, and surface anything interesting, important, or easy to miss. Don't just paraphrase it—help me understand what this activity tells me.",
	},
	{
		name: "Grok",
		url: prefillUrl(
			"https://grok.com/",
			"q",
			"The content below is selected from my Tabot browser activity timeline. Analyze what this activity represents, give me the relevant context, and point out anything interesting, unusual, questionable, or worth investigating further. Be direct and insightful rather than simply summarizing it.",
		),
		prompt:
			"The content below is selected from my Tabot browser activity timeline. Analyze what this activity represents, give me the relevant context, and point out anything interesting, unusual, questionable, or worth investigating further. Be direct and insightful rather than simply summarizing it.",
	},
	{
		name: "Claude",
		url: prefillUrl(
			"https://claude.ai/new",
			"q",
			"The content below comes from my Tabot browser activity timeline, which records my activity across browser tabs and pages. Help me understand what this selected activity represents, the context around it, and any meaningful patterns, connections, or insights that can be inferred. Distinguish clearly between what the data shows and what you are inferring.",
		),
		prompt:
			"The content below comes from my Tabot browser activity timeline, which records my activity across browser tabs and pages. Help me understand what this selected activity represents, the context around it, and any meaningful patterns, connections, or insights that can be inferred. Distinguish clearly between what the data shows and what you are inferring.",
	},
	{
		name: "DeepSeek",
		url: prefillUrl(
			"https://chat.deepseek.com/",
			"q",
			"The following is selected data from my Tabot browser activity timeline. Analyze it as browser telemetry: identify what happened, reconstruct the relevant sequence or context where possible, and derive useful insights from the activity. Separate facts from inference and flag uncertainty or missing context.",
		),
		prompt:
			"The following is selected data from my Tabot browser activity timeline. Analyze it as browser telemetry: identify what happened, reconstruct the relevant sequence or context where possible, and derive useful insights from the activity. Separate facts from inference and flag uncertainty or missing context.",
	},
	{
		name: "Gemini",
		url: prefillUrl(
			"https://gemini.google.com/app",
			"text",
			"The content below is selected from my Tabot browser activity timeline, which captures my browser activity across tabs and pages. Analyze this activity in context: explain what it represents, connect related activity where possible, and surface useful patterns, context, or insights that aren't immediately obvious. Clearly distinguish observed data from inference.",
		),
		prompt:
			"The content below is selected from my Tabot browser activity timeline, which captures my browser activity across tabs and pages. Analyze this activity in context: explain what it represents, connect related activity where possible, and surface useful patterns, context, or insights that aren't immediately obvious. Clearly distinguish observed data from inference.",
	},
];

// CLI commands target the newest tabot export in ~/Downloads
const LATEST_EXPORT =
	"$(ls -t ~/Downloads/tabot-export-*.jsonl 2>/dev/null | head -1)";

const cliTarget = (
	name: string,
	bin: string,
	prompt: string,
): CliTargetDef => ({
	name,
	prompt,
	cmd: `${bin} "${prompt}" "${LATEST_EXPORT}"`,
});

export const CLI_TARGET_DEFS: CliTargetDef[] = [
	cliTarget(
		"Claude Code",
		"claude -p",
		"I am attaching a Tabot browser-activity export. Tabot is a local browser telemetry tool that records activity such as pages, tabs, timestamps, and interactions. Use the attached export as context for the selected activity and investigate it thoroughly. Reconstruct relevant browsing context, identify patterns or connections, and surface anything useful or noteworthy. Treat the telemetry as observational data and distinguish facts from inference.",
	),
	cliTarget(
		"Codex",
		"codex exec",
		"I am attaching a Tabot browser-activity export. Tabot records local browser telemetry such as visited pages, tabs, timestamps, and interactions. Analyze the attached data in the context of the selected activity. Extract the relevant sequence of events, identify relationships or patterns, and determine what useful information can be derived from it. Clearly distinguish observed telemetry from inference.",
	),
	cliTarget(
		"Gemini CLI",
		"gemini -p",
		"I am attaching a Tabot browser-activity export. Tabot is a local browser telemetry timeline containing activity such as pages, tabs, timestamps, and interactions. Use this file to investigate the selected activity, reconstruct relevant context, connect related browsing events, and surface useful insights or patterns. Separate what the telemetry directly shows from what you infer.",
	),
	cliTarget(
		"Ollama",
		"ollama run llama3.2", // ponytail: fixed model, make selectable if needed
		"I am attaching a Tabot browser-activity export. Tabot is a local browser activity timeline containing telemetry such as pages, tabs, timestamps, and interactions. Analyze the attached file and the selected activity to explain what happened, reconstruct relevant context, identify patterns, and surface useful insights. Clearly separate facts from inference.",
	),
];
