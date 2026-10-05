import type { FlowNode } from "~/lib/activity-flow-data";
import { Bar } from "~/lib/place-bar";
import { MEDALS, shareLabel } from "~/lib/place-format";

export const Leaderboard = ({
	nodes,
	totalMs,
	onPick,
}: {
	nodes: FlowNode[];
	totalMs: number;
	onPick: (id: string) => void;
}) => (
	<div className="rounded-xl border border-[#1f3328] bg-[#101c16] p-4">
		<h3 className="text-xs font-medium uppercase tracking-wide text-[#8fae95]">
			Where your time goes
		</h3>
		<ol className="mt-3 space-y-1">
			{nodes.map((node, index) => (
				<li key={node.id}>
					<button
						type="button"
						onClick={() => onPick(node.id)}
						className="w-full rounded-lg p-2 text-left transition-colors hover:bg-[#16231c] focus-visible:outline-2 focus-visible:outline-[#bfff00]"
					>
						<span className="flex items-center gap-2.5">
							<span
								className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${MEDALS[index] ?? "bg-[#16231c] text-[#8fae95]"}`}
							>
								{index + 1}
							</span>
							<span className="min-w-0 flex-1 truncate text-sm text-[#e8f3e8]">
								{node.label}
							</span>
							<span className="font-mono text-xs text-[#bfff00]">
								{shareLabel(node.activeMs, totalMs)}
							</span>
						</span>
						<span className="mt-1.5 block pl-7">
							<Bar
								ratio={totalMs ? node.activeMs / totalMs : 0}
								className="bg-[#bfff00]"
							/>
						</span>
					</button>
				</li>
			))}
		</ol>
		<p className="mt-3 text-[11px] text-[#6f8f78]">
			Time is estimated from your tab switching. Pick a place to see more.
		</p>
	</div>
);
