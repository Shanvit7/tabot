import type { BrowserContext, Memory } from "@tabot/shared";
import { useMemo, useState } from "react";
import { ContextDetail } from "~/components/context-graph/context-detail";
import { Hint } from "~/components/context-graph/hint";
import { MemoryDetail } from "~/components/context-graph/memory-detail";
import { SiteDetail } from "~/components/context-graph/site-detail";
import {
	type GraphLimits,
	graphData,
	matchesQuery,
	type SessionSummary,
} from "~/lib/context-graph-data";
import { NetworkGraph } from "~/lib/network-graph";

export const ContextGraph = ({
	contexts,
	sessions,
	memories,
	limits,
	favicons,
	initialSelectedId,
	assistantConnected,
	query = "",
}: {
	contexts: BrowserContext[];
	sessions: SessionSummary[];
	memories: Memory[];
	limits?: GraphLimits;
	favicons?: Map<string, string>;
	initialSelectedId?: string;
	assistantConnected: boolean;
	query?: string;
}) => {
	const [selectedId, setSelectedId] = useState<string | null>(
		initialSelectedId ?? null,
	);
	const graph = useMemo(
		() => graphData(contexts, memories, limits, favicons, initialSelectedId),
		[contexts, memories, limits, favicons, initialSelectedId],
	);
	const hits = useMemo(
		() =>
			query.trim().length > 1
				? new Set(
						graph.nodes
							.filter((node) => matchesQuery(node, query))
							.map((node) => node.id),
					)
				: null,
		[graph, query],
	);
	const selected = graph.nodes.find(
		(node) => node.id === selectedId && (!hits || hits.has(node.id)),
	);
	const data = useMemo(
		() => ({
			nodes: graph.nodes.map((node) => ({
				id: node.id,
				label: node.label,
				kind: node.kind,
				color:
					node.kind === "memory"
						? "#bfff00"
						: node.kind === "context"
							? "#e8f3e8"
							: "#6f9c81",
				image: node.kind === "site" ? node.favicon : undefined,
			})),
			edges: graph.edges.map((edge) => ({
				...edge,
				size: edge.kind === "pattern" ? 1.8 : 1,
			})),
		}),
		[graph],
	);

	return (
		<div className="flex flex-col gap-5 lg:flex-row">
			<div className="min-w-0 flex-1" data-testid="context-map-canvas">
				<NetworkGraph
					data={data}
					selectedId={selected?.id ?? null}
					hits={hits}
					onSelect={setSelectedId}
					label="Activity graph: browsing stretches, places, and recurring patterns"
				/>
				<ul
					aria-label="Graph legend"
					className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#a9c6b1]"
				>
					<li className="flex items-center gap-2">
						<span className="size-2 rounded-full bg-[#e8f3e8]" />
						Browsing stretch
					</li>
					<li className="flex items-center gap-2">
						<span className="size-2.5 rounded-full bg-[#6f9c81]" />
						Place
					</li>
					<li className="flex items-center gap-2">
						<span className="size-3 rounded-full bg-[#bfff00]" />
						Recurring pattern
					</li>
				</ul>
			</div>
			<aside className="min-w-0 lg:w-80 lg:shrink-0" aria-live="polite">
				{!selected ? (
					<Hint />
				) : selected.kind === "context" ? (
					<ContextDetail
						node={selected}
						sessions={sessions}
						memories={memories}
						contexts={contexts}
						assistantConnected={assistantConnected}
						onClose={() => setSelectedId(null)}
					/>
				) : selected.kind === "site" ? (
					<SiteDetail
						node={selected}
						contexts={contexts}
						assistantConnected={assistantConnected}
						onClose={() => setSelectedId(null)}
					/>
				) : (
					<MemoryDetail
						memory={selected.memory}
						assistantConnected={assistantConnected}
						onClose={() => setSelectedId(null)}
					/>
				)}
			</aside>
		</div>
	);
};
