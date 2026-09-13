import {
	Claude,
	ClaudeCode,
	Codex,
	DeepSeek,
	Gemini,
	GeminiCLI,
	Grok,
	Ollama,
	OpenAI,
} from "@lobehub/icons";
import { CLI_TARGET_DEFS, WEB_TARGET_DEFS } from "@tabot/shared";
import type { ComponentType } from "react";

// Lazy-loaded from the dashboard route (Share Context tab only) so @lobehub/icons
// stays out of the critical path. Name/prompt/url definitions live icon-free in
// @tabot/shared (shared with the extension popup) — icons are attached here.

export interface AiTarget {
	name: string;
	icon: ComponentType<{ size?: number }>;
	prompt: string;
}

export type WebTarget = AiTarget & { url: string };
export type CliTarget = AiTarget & { cmd: string };

const WEB_ICONS: Record<string, ComponentType<{ size?: number }>> = {
	ChatGPT: OpenAI,
	Grok: Grok,
	Claude: Claude.Color,
	DeepSeek: DeepSeek.Color,
	Gemini: Gemini.Color,
};

const CLI_ICONS: Record<string, ComponentType<{ size?: number }>> = {
	"Claude Code": ClaudeCode.Color,
	Codex: Codex.Color,
	"Gemini CLI": GeminiCLI.Color,
	Ollama: Ollama,
};

export const WEB_TARGETS: WebTarget[] = WEB_TARGET_DEFS.map((t) => ({
	...t,
	icon: WEB_ICONS[t.name],
}));

export const CLI_TARGETS: CliTarget[] = CLI_TARGET_DEFS.map((t) => ({
	...t,
	icon: CLI_ICONS[t.name],
}));
