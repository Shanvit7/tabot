import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ActivitySignalGarden } from "~/components/activity-signal-garden";
import { HomeShell } from "~/components/home-shell";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { buildActivityFlow } from "~/lib/activity-flow-data";
import { rangeStart } from "~/lib/home-data";
import { useAssistantConnection } from "~/providers/assistant-connection";

const periods = ["today", "7d", "30d", "all"] as const;
type Period = (typeof periods)[number];
const labels: Record<Period, string> = {
	today: "Today",
	"7d": "7 days",
	"30d": "30 days",
	all: "All time",
};

const Activities = () => {
	const { events, initialized, hasExtension, degraded } = useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const assistantConnected = useAssistantConnection();
	const [period, setPeriod] = useState<Period>("7d");
	const flow = useMemo(
		() =>
			events?.length
				? buildActivityFlow(events, rangeStart(period), Date.now(), 8)
				: null,
		[events, period],
	);

	if (!initialized || redirecting)
		return (
			<HomeShell>
				<GraphLoading />
			</HomeShell>
		);

	return (
		<HomeShell degraded={degraded}>
			<header className="activities-heading">
				<h1>See the threads between.</h1>
				<p>
					Follow observed connections between websites—and when they happened.
				</p>
			</header>
			<fieldset className="garden-periods">
				<legend className="sr-only">Activity period</legend>
				{periods.map((option) => (
					<button
						key={option}
						type="button"
						aria-pressed={period === option}
						onClick={() => setPeriod(option)}
					>
						{labels[option]}
					</button>
				))}
			</fieldset>
			{events === null ? (
				<p role="status" className="garden-empty">
					Activity could not be loaded. Your local data is unchanged; Tabot will
					retry automatically.
				</p>
			) : flow?.nodes.length ? (
				<ActivitySignalGarden
					flow={flow}
					periodLabel={labels[period]}
					assistantConnected={assistantConnected === true}
				/>
			) : (
				<GraphLoading
					title={
						period === "all"
							? "Your activity map starts here"
							: "No activity in this period"
					}
					message={
						period === "all"
							? "Browse normally with Tabot enabled. Your activity stays on this device."
							: "Try a wider date range to find your browsing."
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
