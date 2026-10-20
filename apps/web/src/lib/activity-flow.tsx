import { activityMetricsPrompt, chatGptPromptUrl } from "@tabot/shared";
import { useMemo, useState } from "react";
import { type ActivityFlow, connectedTo } from "~/lib/activity-flow-data";
import { NetworkGraph } from "~/lib/network-graph";
import { PlaceCard } from "~/lib/place-card";
import { Leaderboard } from "~/lib/place-leaderboard";

export const ActivityFlowGraph = ({
	flow,
	assistantConnected,
}: {
	flow: ActivityFlow;
	assistantConnected: boolean;
}) => {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const data = useMemo(
		() => ({
			nodes: flow.nodes.map((node, index) => ({
				id: node.id,
				label: node.label,
				color: index < 5 ? "#e8f3e8" : "#6f9c81",
				image: node.favicon,
			})),
			edges: flow.links.map((link) => ({
				source: link.source,
				target: link.target,
				size: 1 + Math.min(3, link.count / 3),
				directed: true,
			})),
		}),
		[flow],
	);
	const selected = flow.nodes.find((node) => node.id === selectedId) ?? null;
	const connections = selected ? connectedTo(flow, selected.id) : [];

	return (
		<div className="flex flex-col gap-5 lg:flex-row">
			<div className="min-w-0 flex-1">
				<NetworkGraph
					data={data}
					selectedId={selected?.id ?? null}
					onSelect={setSelectedId}
					label="Browsing flow graph. Dots are places; arrows show moves between them. Thicker lines mean more moves."
				/>
			</div>
			<aside className="min-w-0 lg:w-72 lg:shrink-0">
				<div aria-live="polite">
					{selected ? (
						<PlaceCard
							node={selected}
							rank={flow.nodes.findIndex((node) => node.id === selected.id) + 1}
							total={flow.nodes.length}
							totalMs={flow.totalMs}
							activeDays={flow.stats.activeDays}
							connections={connections}
							assistantHref={chatGptPromptUrl(
								activityMetricsPrompt(flow.from, flow.to, selected.id),
							)}
							assistantConnected={assistantConnected}
						/>
					) : (
						<Leaderboard
							nodes={flow.nodes.slice(0, 5)}
							totalMs={flow.totalMs}
							onPick={setSelectedId}
						/>
					)}
				</div>
			</aside>
		</div>
	);
};
