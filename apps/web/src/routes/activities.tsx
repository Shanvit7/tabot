import { activityMetricsPrompt, chatGptPromptUrl } from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { GamifiedStats } from "~/components/activity-gamified-stats";
import { WeekStrip } from "~/components/activity-week-strip";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import { HomeShell } from "~/components/home-shell";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { buildActivityFlow } from "~/lib/activity-flow-data";
import { rangeStart } from "~/lib/home-data";
import { useAssistantConnection } from "~/providers/assistant-connection";

const ActivityFlowGraph = lazy(() =>
	import("~/lib/activity-flow").then((module) => ({
		default: module.ActivityFlowGraph,
	})),
);

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
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const assistantConnected = useAssistantConnection();
	const [period, setPeriod] = useState<Period>("7d");
	const flow = useMemo(
		() =>
			events?.length ? buildActivityFlow(events, rangeStart(period)) : null,
		[events, period],
	);
	if (!initialized || redirecting) {
		return (
			<HomeShell>
				<GraphLoading />
			</HomeShell>
		);
	}
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
						<GamifiedStats
							stats={flow.stats}
							totalMs={flow.totalMs}
							isToday={period === "today"}
							periodLabel={
								period === "7d" || period === "30d"
									? `Last ${periodLabel[period]}`
									: periodLabel[period]
							}
						/>
					</div>
					<section className="mt-8" aria-labelledby="flow-heading">
						<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
							<div>
								<h2
									id="flow-heading"
									className="text-sm font-medium text-[#476151]"
								>
									Where your browsing flows
								</h2>
								<p className="mt-2 text-sm text-[#476151]">
									Ask about this period, or pick a place for its estimates.
								</p>
							</div>
							<div className="w-full sm:w-auto">
								<AskChatGpt
									href={chatGptPromptUrl(
										activityMetricsPrompt(flow.from, flow.to),
									)}
									connected={assistantConnected === true}
									label="Ask ChatGPT about this period"
								/>
							</div>
						</div>
						<div className="mt-4 rounded-xl bg-[#0b1310] p-4 sm:p-6">
							<Suspense fallback={<GraphLoading />}>
								<ActivityFlowGraph
									flow={flow}
									assistantConnected={assistantConnected === true}
								/>
							</Suspense>
							<p className="mt-4 text-xs text-[#8fae95]">
								{flow.nodes.length} place{flow.nodes.length === 1 ? "" : "s"}{" "}
								and {flow.links.length} move{flow.links.length === 1 ? "" : "s"}{" "}
								between them, {periodLabel[period].toLowerCase()}.
							</p>
						</div>
					</section>
				</>
			) : (
				<div className="mt-8">
					<GraphLoading
						title="No activity here yet"
						message={
							period === "all"
								? "Browse normally. Your activity will appear here."
								: "Try All time, or browse normally to add your next dot."
						}
					>
						{period !== "all" && (
							<button
								type="button"
								onClick={() => setPeriod("all")}
								className="min-h-11 rounded-lg bg-[#bfff00] px-4 text-sm font-semibold text-[#15251b]"
							>
								Show all time
							</button>
						)}
					</GraphLoading>
				</div>
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
