import type { Derived } from "@tabot/shared";
import { useMemo, useState } from "react";
import { ContextGraph } from "~/lib/context-graph";
import { GRAPH_LIMITS, sessionSummaries } from "~/lib/context-graph-data";
import { rangeStart } from "~/lib/home-data";

const PERIODS = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "Last 7 days" },
	{ id: "30d", label: "Last 30 days" },
	{ id: "all", label: "All time" },
] as const;
type Period = (typeof PERIODS)[number]["id"];

// This whole module (including graph and session projection) loads only after
// someone explicitly opens Explore connections.
export const HomeConnections = ({
	derived,
	favicons,
	assistantConnected,
}: {
	derived: Derived;
	favicons: Map<string, string>;
	assistantConnected: boolean;
}) => {
	const [period, setPeriod] = useState<Period>("all");
	const contexts = useMemo(() => {
		const from = rangeStart(period);
		return derived.contexts.filter((context) => context.endTimestamp >= from);
	}, [derived, period]);
	const sessions = useMemo(
		() => sessionSummaries(derived.sessions, derived.contexts),
		[derived],
	);
	return (
		<div className="mt-4 rounded-xl bg-preview-trace p-4 sm:p-6">
			<label className="flex flex-wrap items-center gap-3 text-sm text-preview-text">
				Time range
				<select
					value={period}
					onChange={(event) => setPeriod(event.target.value as Period)}
					className="min-h-11 rounded-md border border-preview-muted bg-preview-raised px-3 text-preview-text focus-visible:outline-2 focus-visible:outline-lime"
				>
					{PERIODS.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			{contexts.length ? (
				<div className="mt-5">
					<ContextGraph
						contexts={contexts}
						sessions={sessions}
						memories={derived.memories}
						limits={GRAPH_LIMITS[period]}
						favicons={favicons}
						assistantConnected={assistantConnected}
					/>
				</div>
			) : (
				<div role="status" className="py-8 text-preview-text">
					<p>No activity recorded in this time range.</p>
					<button
						type="button"
						onClick={() => setPeriod("all")}
						className="mt-4 min-h-11 rounded-md bg-lime px-4 text-sm font-semibold text-preview-ink"
					>
						Show all time
					</button>
				</div>
			)}
		</div>
	);
};
