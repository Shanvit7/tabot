import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import {
	type connectedTo,
	type FlowNode,
	habitOf,
} from "~/lib/activity-flow-data";
import { Bar } from "~/lib/place-bar";
import { ago, MEDALS, plural, shareLabel, timeLabel } from "~/lib/place-format";

export const PlaceCard = ({
	node,
	rank,
	total,
	totalMs,
	activeDays,
	connections,
	assistantHref,
	assistantConnected,
}: {
	node: FlowNode;
	rank: number;
	total: number;
	totalMs: number;
	activeDays: number;
	connections: ReturnType<typeof connectedTo>;
	assistantHref: string;
	assistantConnected: boolean;
}) => {
	const peak = Math.max(1, ...connections.map((c) => c.count));
	const nextUp = connections.find((c) => c.outgoing);
	const cameFrom = connections.find((c) => !c.outgoing);
	return (
		<div className="rounded-xl border border-[#1f3328] bg-[#101c16] p-4">
			<div className="flex items-center gap-2.5">
				{node.favicon && (
					<img
						src={node.favicon}
						alt=""
						width={28}
						height={28}
						className="size-7 shrink-0 rounded-md bg-[#0b1310]"
					/>
				)}
				<h3 className="min-w-0 flex-1 wrap-break-word text-base font-semibold text-[#e8f3e8]">
					{node.label}
				</h3>
				<span
					className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${MEDALS[rank - 1] ?? "bg-[#16231c] text-[#8fae95]"}`}
				>
					#{rank}
				</span>
			</div>
			<p className="mt-4 text-3xl font-semibold leading-none text-[#bfff00]">
				{timeLabel(node.activeMs)}
			</p>
			<p className="mt-1.5 text-xs text-[#8fae95]">
				Estimated time · {shareLabel(node.activeMs, totalMs)} of your browsing
				time · #{rank} of {total} places
			</p>
			<div className="mt-3">
				<Bar
					ratio={totalMs ? node.activeMs / totalMs : 0}
					className="bg-[#bfff00]"
				/>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-2 text-center">
				<div className="rounded-lg bg-[#16231c] py-2">
					<p className="text-lg font-semibold text-[#e8f3e8]">{node.visits}</p>
					<p className="text-[11px] text-[#8fae95]">
						{node.visits === 1 ? "visit" : "visits"}
					</p>
				</div>
				<div className="rounded-lg bg-[#16231c] py-2">
					<p className="text-lg font-semibold text-[#e8f3e8]">
						{node.days}
						<span className="text-xs font-normal text-[#8fae95]">
							/{plural(activeDays, "day")}
						</span>
					</p>
					<p className="text-[11px] text-[#8fae95]">days you were here</p>
				</div>
			</div>
			<p className="mt-3 flex items-center gap-2 text-xs text-[#a9c6b1]">
				<span className="rounded-full bg-[#16231c] px-2 py-0.5 font-semibold text-[#bfff00]">
					{habitOf(node, activeDays)}
				</span>
				Last here {ago(node.lastSeen)}
			</p>
			{(nextUp || cameFrom) && (
				<p className="mt-4 text-xs leading-relaxed text-[#a9c6b1]">
					{cameFrom && (
						<>
							You usually arrive from{" "}
							<b className="text-[#e8f3e8]">{cameFrom.label}</b>.{" "}
						</>
					)}
					{nextUp && (
						<>
							You usually go next to{" "}
							<b className="text-[#e8f3e8]">{nextUp.label}</b>.
						</>
					)}
				</p>
			)}
			{connections.length > 0 && (
				<ul className="mt-3 space-y-2.5">
					{connections.map((connection) => (
						<li
							key={`${connection.outgoing ? "out" : "in"}-${connection.label}`}
						>
							<span className="flex items-center justify-between gap-3 text-xs text-[#a9c6b1]">
								<span className="truncate">
									{connection.outgoing ? "Went to " : "Came from "}
									{connection.label}
								</span>
								<span className="shrink-0 font-mono text-[#e8f3e8]">
									{connection.count}×
								</span>
							</span>
							<span className="mt-1 block">
								<Bar
									ratio={connection.count / peak}
									className={
										connection.outgoing ? "bg-[#bfff00]" : "bg-[#6f9c81]"
									}
								/>
							</span>
						</li>
					))}
				</ul>
			)}
			<AskChatGpt
				href={assistantHref}
				connected={assistantConnected}
				label="Ask ChatGPT about this place"
			/>
			<p className="mt-2 text-xs leading-5 text-[#8fae95]">
				Shares this period’s site-level estimates, not page URLs or raw history.
			</p>
		</div>
	);
};
