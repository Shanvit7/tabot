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
