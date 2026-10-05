import type { ActivityStats } from "~/lib/activity-flow-stats";

export const WeekStrip = ({ stats }: { stats: ActivityStats }) => (
	<span className="flex items-center gap-2">
		<span className="text-xs font-medium text-[#476151]">Last 7 days</span>
		{stats.week.map((day) => (
			<span
				key={day.key}
				title={`${day.label}: ${day.active ? "active" : "no browsing"}`}
				className={`grid size-7 place-items-center rounded-md text-[11px] font-semibold ${
					day.active
						? "bg-[#bfff00] text-[#15251b]"
						: "bg-[#e9eee8] text-[#8fae95]"
				}`}
			>
				{day.label}
			</span>
		))}
	</span>
);
