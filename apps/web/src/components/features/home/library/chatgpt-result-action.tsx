import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { chatGptPromptUrl } from "@tabot/shared";
import { useState } from "react";
import { toast } from "~/components/alerts/ding-toaster";
import { Button } from "~/components/ui/button";
import { readLibraryPageReference } from "~/lib/history";

const questionPlaceholder = (subject: "site" | "page") =>
	`[Write your question about this ${subject} here]`;

const sitePrompt = (site: string) =>
	`Use my connected Tabot MCP tools to answer my question about my saved activity for ${JSON.stringify(site)}. Use list_site_pages and get_site_notes with this site as needed; for page-specific notes, use get_page_notes only with opaque pageRefs returned by Tabot. For visit questions, use search_activity with my question, and discuss only returned results for this site. Use only evidence returned by Tabot; it does not provide raw page paths or page content. If the relevant data or tools are unavailable, say so.\n\nQuestion: ${questionPlaceholder("site")}`;

const pagePrompt = (pageRef: string) =>
	`Use my connected Tabot MCP tools to answer my question about this saved page. First use get_page_notes with this exact opaque pageRef: ${JSON.stringify(pageRef)}. If my question concerns visits, use search_activity with my question, inspect relevant returned anchors with find_activity_matches or get_activity_timeline, and limit visit findings to this page’s site. Do not request or infer the page URL, path, title, or content; use only information returned by Tabot. If the relevant data or tools are unavailable, say so.\n\nQuestion: ${questionPlaceholder("page")}`;

const openChatGptTab = () => {
	const tab = window.open("about:blank", "_blank");
	if (!tab) {
		toast.error("ChatGPT didn’t open", {
			description: "Allow pop-ups for Tabot, then try again.",
		});
		return null;
	}
	tab.opener = null;
	return tab;
};

type Props =
	| { connected: boolean; kind: "site"; site: string }
	| { connected: boolean; host: string; kind: "page"; url: string };

export const ChatGptResultAction = (props: Props) => {
	const [preparing, setPreparing] = useState(false);
	if (!props.connected) return null;

	const label =
		props.kind === "site"
			? `Ask ChatGPT about ${props.site}`
			: `Ask ChatGPT about this page from ${props.host}`;
	const openPrompt = async () => {
		const tab = openChatGptTab();
		if (!tab) return;
		if (props.kind === "site") {
			tab.location.replace(chatGptPromptUrl(sitePrompt(props.site)));
			return;
		}

		setPreparing(true);
		try {
			const pageRef = await readLibraryPageReference(props.url);
			tab.location.replace(chatGptPromptUrl(pagePrompt(pageRef)));
		} catch (error) {
			tab.close();
			toast.error("Couldn’t prepare the ChatGPT prompt", {
				description:
					error instanceof Error
						? error.message
						: "Check that Tabot is available, then try again.",
			});
		} finally {
			setPreparing(false);
		}
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="relative z-20 size-11 shrink-0 rounded-lg text-work-muted hover:text-work-ink"
			aria-label={label}
			aria-busy={preparing}
			title={label}
			disabled={preparing}
			onClick={() => void openPrompt()}
		>
			{preparing ? (
				<span
					aria-hidden="true"
					className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
				/>
			) : (
				<OpenAIMono size={18} aria-hidden="true" />
			)}
		</Button>
	);
};
