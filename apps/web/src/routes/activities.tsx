import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GamifiedStats } from "~/components/activity-gamified-stats";
import { WeekStrip } from "~/components/activity-week-strip";
import { HomeShell } from "~/components/home-shell";
import { Loading } from "~/components/ui/work-panels";
import { useHomeData } from "~/hooks/use-home-data";
import { ActivityFlowGraph } from "~/lib/activity-flow";
import { buildActivityFlow } from "~/lib/activity-flow-data";
import { rangeStart } from "~/lib/home-data";

const periods = ["today", "7d", "30d", "all"] as const;
type Period = (typeof periods)[number];

const periodLabel: Record<Period, string> = {
	today: "Today",
	"7d": "7 days",
	"30d": "30 days",
	all: "All time",
};

const Activities = () => {
	const { events, initialized, hasExtension } = useHomeData();
	const [period, setPeriod] = useState<Period>("7d");
	const flow = useMemo(
		() =>
			events?.length ? buildActivityFlow(events, rangeStart(period)) : null,
		[events, period],
	);
	if (!initialized) return <Loading />;
	return (
		<HomeShell>
			<header className="mb-8">
				<h1 className="text-[32px] font-semibold tracking-tight sm:text-[40px]">
					Activities
				</h1>
				<p className="mt-2 text-sm text-[#476151]">
					Your browsing, in plain numbers — time is estimated from how you
					switch tabs, and places are the sites you visited.
				</p>
			</header>
			{!hasExtension && (
				<p
					role="alert"
					className="mb-6 rounded-lg bg-[#fff2da] p-4 text-sm text-[#80500f]"
				>
					Extension not detected. Load Tabot in this Chrome profile, then
					reload.
				</p>
			)}
			<div className="flex flex-wrap items-center justify-between gap-4">
				<fieldset className="flex flex-wrap gap-2">
					<legend className="sr-only">Activity period</legend>
					{periods.map((option) => (
						<button
							key={option}
							type="button"
							aria-pressed={period === option}
							onClick={() => setPeriod(option)}
							className={`min-h-11 rounded-md px-4 text-sm ${period === option ? "bg-[#e9eee8] font-semibold" : "hover:bg-[#f5f8f4]"}`}
						>
							{periodLabel[option]}
						</button>
					))}
				</fieldset>
				{flow?.nodes.length ? <WeekStrip stats={flow.stats} /> : null}
			</div>
			{flow?.nodes.length ? (
				<>
					<div className="mt-6">
						<GamifiedStats stats={flow.stats} />
					</div>
					<section className="mt-8" aria-labelledby="flow-heading">
						<h2
							id="flow-heading"
							className="text-sm font-medium text-[#476151]"
						>
							Where your browsing flows
						</h2>
						<div className="mt-4 rounded-xl bg-[#0b1310] p-4 sm:p-6">
							<ActivityFlowGraph flow={flow} />
							<p className="mt-4 text-xs text-[#8fae95]">
								{flow.nodes.length} place{flow.nodes.length === 1 ? "" : "s"}{" "}
								and {flow.links.length} move{flow.links.length === 1 ? "" : "s"}{" "}
								between them, {periodLabel[period].toLowerCase()}.
							</p>
						</div>
					</section>
				</>
			) : (
				<p className="mt-8 text-sm text-[#476151]">
					No activity recorded for this period.
				</p>
			)}
		</HomeShell>
	);
};
export const Route = createFileRoute("/activities")({
	head: () => ({
		meta: [
			{ title: "Activities | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Activities,
});
