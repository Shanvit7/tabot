import {
	type BrowserContext,
	chatGptPromptUrl,
	sitePrompt,
} from "@tabot/shared";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import { Panel } from "~/components/context-graph/panel";
import { Remark } from "~/components/context-graph/remark";
import {
	ago,
	clock,
	type GraphNode,
	prettySite,
} from "~/lib/context-graph-data";

export const SiteDetail = ({
	node,
	contexts,
	assistantConnected,
	onClose,
}: {
	node: Extract<GraphNode, { kind: "site" }>;
	contexts: BrowserContext[];
	assistantConnected: boolean;
	onClose: () => void;
}) => {
	const now = Date.now();
	const byId = new Map(contexts.map((context) => [context.id, context]));
	const times = node.contextIds
		.flatMap((id) => {
			const stamp = byId.get(id)?.endTimestamp;
			return typeof stamp === "number" ? [stamp] : [];
		})
		.toSorted((a, b) => b - a);
	return (
		<Panel
			kicker="A place you visit"
			title={prettySite(node.domain)}
			onClose={onClose}
		>
			<p className="mt-2 text-sm leading-6 text-[#cfe4d4]">
				{node.contextCount === 1
					? "It showed up once in the contexts on screen."
					: `It showed up in ${node.contextCount} of the contexts on screen.`}
			</p>
			<Remark>
				{node.contextCount >= 3
					? "A regular stop. This is one of the places your days keep returning to."
					: node.contextCount === 2
						? "You came back here once — worth watching whether it becomes a habit."
						: "Only once so far. Not enough evidence to call it a habit."}
			</Remark>
			{times.length > 0 && (
				<>
					<p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f8f78]">
						Seen around
					</p>
					<ul className="mt-2 space-y-1.5">
						{times.slice(0, 6).map((stamp) => (
							<li
								key={stamp}
								className="flex items-baseline justify-between gap-3 text-sm"
							>
								<span className="text-[#e8f3e8]">{clock(stamp)}</span>
								<span className="text-xs text-[#7d9c86]">
									{ago(now - stamp)}
								</span>
							</li>
						))}
					</ul>
				</>
			)}
			{node.lastSeen > 0 && (
				<p className="mt-4 text-xs text-[#6f8f78]">
					Last seen {ago(now - node.lastSeen)}.
				</p>
			)}
			<AskChatGpt
				href={chatGptPromptUrl(sitePrompt(node.domain, node.contextIds))}
				connected={assistantConnected}
			/>
		</Panel>
	);
};
