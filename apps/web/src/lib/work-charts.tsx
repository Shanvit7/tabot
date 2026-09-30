import type { Memory, StoredTabEvent } from "@tabot/shared";
import { areaY, barX, defineChart, dot, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { rangeStart } from "~/lib/home-data";

type Range = "today" | "7d" | "30d" | "all";
export interface HourBucket {
	label: string;
	events: number;
}

export const buildActivityBuckets = (
	events: StoredTabEvent[],
	range: Range,
): HourBucket[] => {
	if (!events.length) return [];
	const counts = new Map<string, number>();
	const from = rangeStart(range);
	for (const event of events) {
		if (event.timestamp < from) continue;
		const date = new Date(event.timestamp);
		const label =
			range === "all"
				? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
				: range === "today"
					? `${String(date.getHours()).padStart(2, "0")}:00`
					: `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return [...counts]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([label, total]) => ({ label, events: total }));
};

export const ActivityChart = ({
	data,
	height = 300,
}: {
	data: HourBucket[];
	height?: number;
}) => {
	const definition = useMemo(
		() =>
			defineChart({
				marks: [
					areaY(data, { x: "label", y: "events", fill: "#e1eae0" }),
					lineY(data, {
						x: "label",
						y: "events",
						stroke: "#15251b",
						strokeWidth: 2,
					}),
					dot(data, { x: "label", y: "events", r: 4, fill: "#476151" }),
				],
				scales: {
					x: {
						scale: () => scaleBand().padding(0.2),
						axis: { tickLabels: { fontSize: 10 } },
					},
					y: {
						scale: () => scaleLinear().nice(4),
						grid: true,
						axis: { tickLabels: { fontSize: 10 } },
					},
				},
				tooltip: false,
			}),
		[data],
	);
	return (
		<Chart
			className="ts-chart-host w-full"
			definition={definition}
			ariaLabel="Recorded browser activity over time"
			ariaDescription="Each point counts browser moments in an hour, day, or month. Taller peaks mean more recorded moments, not productivity."
			height={height}
		/>
	);
};

export const MemoryChart = ({ memories }: { memories: Memory[] }) => {
	const rows = useMemo(
		() =>
			memories.slice(0, 8).map((memory, index) => ({
				label: `${index + 1}. ${(memory.fingerprint.domains[0]?.domain ?? "Pattern").replace(/^https?:\/\//, "").slice(0, 18)}`,
				occurrences: memory.occurrences.length,
			})),
		[memories],
	);
	const definition = useMemo(
		() =>
			defineChart({
				marks: [barX(rows, { x: "occurrences", y: "label", fill: "#476151" })],
				scales: {
					x: {
						scale: () => scaleLinear().nice(4),
						axis: {
							ticks: {
								count: 3,
								format: (value) =>
									Number.isInteger(value) ? String(value) : "",
							},
							label: "Separate observed periods",
						},
						grid: true,
					},
					y: {
						scale: () => scaleBand().padding(0.35),
						axis: { tickLabels: { fontSize: 11 } },
					},
				},
				tooltip: false,
			}),
		[rows],
	);
	return (
		<Chart
			className="ts-chart-host w-full"
			definition={definition}
			ariaLabel="Recurring patterns by number of separate activity periods"
			height={Math.max(220, rows.length * 48)}
		/>
	);
};
