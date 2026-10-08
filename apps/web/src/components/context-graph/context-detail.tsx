import {
	type BrowserContext,
	chatGptContextUrl,
	type Memory,
} from "@tabot/shared";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import { Panel } from "~/components/context-graph/panel";
import { Places } from "~/components/context-graph/places";
import { Remark } from "~/components/context-graph/remark";
import {
	clock,
	contextTitle,
	type GraphNode,
	humanDuration,
	memoryTitle,
	prettySite,
} from "~/lib/context-graph-data";

export const ContextDetail = ({
	node,
	memories,
	contexts,
	assistantConnected,
	onClose,
}: {
	node: Extract<GraphNode, { kind: "context" }>;
	memories: Memory[];
	contexts: BrowserContext[];
	assistantConnected: boolean;
	onClose: () => void;
}) => {
	const { context } = node;
	const sites = context.domains
		.toSorted((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0))
		// Browser chrome (new tab, extension pages) is not somewhere the user chose
		// to go; it stays in the map but never in the "where you went" list.
		.filter((site) => !/^(chrome|chrome-extension):\/\//.test(site.domain));
	const shared = node.sharedPlaces;
	const pattern = memories.find(
		(memory) =>
			memory.kind === "recurrent" && memory.contextIds.includes(context.id),
	);
	const first = contexts.reduce(
		(min, item) => Math.min(min, item.startTimestamp),
		context.startTimestamp,
	);
	const seenCount = new Map<string, number>();
	for (const item of contexts)
		for (const entry of item.domains)
			seenCount.set(entry.domain, (seenCount.get(entry.domain) ?? 0) + 1);
	const seenBefore = new Set<string>();
	for (const [domain, count] of seenCount)
		if (count > 1) seenBefore.add(domain);
	const opener =
		clock(context.startTimestamp) === clock(context.endTimestamp)
			? `ending at ${clock(context.endTimestamp)}`
			: `from ${clock(context.startTimestamp)} to ${clock(context.endTimestamp)}`;

	return (
		<Panel
			kicker="A stretch of browsing"
			title={contextTitle(context)}
			onClose={onClose}
		>
			<p className="mt-2 text-sm leading-6 text-[#cfe4d4]">
				{humanDuration(context.duration)} across {node.places} place
				{node.places === 1 ? "" : "s"}, {opener}.
			</p>
			<Remark>
				{shared === 0
					? "Nothing here has come back yet — this one looks like a one-off."
					: shared === node.places
						? "Every place here shows up in another context of yours."
						: `${shared} of these ${node.places} places show up in your other contexts.`}
			</Remark>
			<Places
				items={sites.slice(0, 6).map((site) => ({
					key: site.domain,
					name: prettySite(site.domain),
					note: seenBefore.has(site.domain)
						? "you've been here before"
						: "first time",
				}))}
			/>
			{pattern && (
				<p className="mt-4 text-sm text-[#8fae95]">
					Part of the pattern{" "}
					<span className="text-[#bfff00]">{memoryTitle(pattern)}</span>
				</p>
			)}
			{context.startTimestamp === first && (
				<p className="mt-4 text-xs text-[#6f8f78]">
					Earliest context Tabot still holds.
				</p>
			)}
			<AskChatGpt
				href={chatGptContextUrl(context.id)}
				connected={assistantConnected}
			/>
		</Panel>
	);
};
