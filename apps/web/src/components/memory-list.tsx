import type { Memory } from "@tabot/shared";
import { Empty } from "~/components/ui/dashboard-panels";
import { formatAgo } from "~/lib/dashboard-data";

export const MemoryList = ({ memories }: { memories: Memory[] }) => {
	if (memories.length === 0) {
		return (
			<Empty text="No memories yet — recurring activity needs more browser history." />
		);
	}

	return (
		<div className="space-y-3">
			{memories.map((memory) => (
				<article key={memory.id} className="border-hard bg-pink-100 p-4">
					<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
						<h3 className="min-w-0 break-all text-base font-bold">
							{memory.signature}
						</h3>
						<span className="font-mono text-xs text-muted-foreground">
							{memory.kind} · seen {formatAgo(memory.staleness)}
						</span>
					</div>
					<p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
						{memory.observation}
					</p>
					<p className="mt-2 font-mono text-xs text-muted-foreground">
						{memory.contextCount} contexts · {memory.totalSessionCount} sessions
						· {memory.totalEventCount} events
					</p>
				</article>
			))}
		</div>
	);
};
