import { Clock3, Compass, Flame, Repeat, Timer } from "lucide-react";
import { StatTile } from "~/components/activity-stat-tile";
import type { ActivityStats } from "~/lib/activity-flow-stats";
import { prettySite } from "~/lib/context-graph-data";
import { formatDuration } from "~/lib/home-data";

const hourLabel = (hour: number) =>
	new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, {
		hour: "numeric",
		hour12: true,
	});

export const GamifiedStats = ({
	stats,
	totalMs,
	periodLabel,
	isToday,
}: {
	stats: ActivityStats;
	totalMs: number;
	periodLabel: string;
	isToday: boolean;
}) => (
	<section aria-label="What this stretch of browsing looked like">
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<StatTile
				icon={isToday ? Clock3 : Flame}
				value={
					isToday
						? formatDuration(totalMs)
						: stats.streakDays > 0
							? `${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`
							: "—"
				}
				label={isToday ? "Browsing time" : "Active streak"}
				detail={
					isToday
						? "estimated for this period"
						: `${stats.activeDays} active day${stats.activeDays === 1 ? "" : "s"} this stretch`
				}
			/>
			<StatTile
				icon={Timer}
				value={stats.focusMs > 0 ? formatDuration(stats.focusMs) : "—"}
				label="Longest focus"
				detail={
					stats.focusOrigin
						? `kept returning to ${prettySite(stats.focusOrigin)}`
						: "no single-place stretch yet"
				}
			/>
			<StatTile
				icon={Compass}
				value={`${stats.distinctSites}`}
				label="Places explored"
				detail={`${stats.distinctSites === 1 ? "a place" : "places"} visited`}
			/>
			<StatTile
				icon={Repeat}
				value={`${stats.returningSites}`}
				label="Came back to"
				detail="places you revisited on another day"
			/>
		</div>
		{stats.busiestHour !== null && (
			<p className="mt-4 text-xs text-[#476151]">
				{periodLabel}: most recorded activity was around{" "}
				{hourLabel(stats.busiestHour)}.
			</p>
		)}
	</section>
);
