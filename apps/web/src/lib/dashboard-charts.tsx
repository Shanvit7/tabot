import type { Session, StoredTabEvent } from "@tabot/shared";
import { areaY, barX, defineChart, dot, lineY } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart, type ChartDefinition } from "@tanstack/react-charts";
import { useMemo } from "react";
import { rangeStart } from "~/lib/dashboard-data";

// Lazy-loaded from the dashboard route via dynamic import, so @tanstack/charts
// stays out of the critical path (assets + dev compile + SSR shell render).

// event types → friendly names (non-technical audience)
const EVENT_LABELS: Record<string, string> = {
	TAB_CREATED: "Tabs opened",
	TAB_ACTIVATED: "Tab switches",
	TAB_UPDATED: "Tab updates",
	TAB_REMOVED: "Tabs closed",
	NAVIGATION: "Page visits",
	PAGE_VISIBLE: "Returned to tab",
	PAGE_HIDDEN: "Switched away",
	SCROLL: "Scrolling",
	CLICK: "Clicks",
	KEY_ACTIVITY: "Typing",
};

type Range = "today" | "7d" | "30d" | "all";

// ─── Chart data helpers (plain arrays, cheap to build each poll) ───

export interface HourBucket {
	label: string;
	events: number;
}

// last 24h by hour, or day buckets for longer ranges
const buildActivityBuckets = (
	events: StoredTabEvent[],
	range: Range,
): HourBucket[] => {
	const from = rangeStart(range);
	if (events.length === 0 || range === "all") return [];
	if (range === "today") {
		const buckets: HourBucket[] = [];
		const start = new Date();
		start.setHours(start.getHours() - 23, 0, 0, 0);
		for (let i = 0; i < 24; i += 1) {
			const d = new Date(start.getTime() + i * 3600_000);
			buckets.push({
				label: `${String(d.getHours()).padStart(2, "0")}:00`,
				events: 0,
			});
		}
		for (const e of events) {
			if (e.timestamp < from) continue;
			const idx = Math.round((e.timestamp - start.getTime()) / 3600_000);
			if (idx >= 0 && idx < buckets.length) buckets[idx].events += 1;
		}
		return buckets;
	}
	// 7d / 30d: one bar per day
	const days = range === "7d" ? 7 : 30;
	const buckets: HourBucket[] = [];
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - (days - 1));
	for (let i = 0; i < days; i += 1) {
		const d = new Date(start.getTime() + i * 86400_000);
		buckets.push({
			label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
			events: 0,
		});
	}
	for (const e of events) {
		if (e.timestamp < from) continue;
		const idx = Math.floor((e.timestamp - start.getTime()) / 86400_000);
		if (idx >= 0 && idx < buckets.length) buckets[idx].events += 1;
	}
	return buckets;
};

interface SiteDatum {
	label: string;
	visits: number;
}

// top 8 domains by NAVIGATION + TAB_ACTIVATED with a URL (hostname only)
const buildTopSites = (events: StoredTabEvent[], range: Range): SiteDatum[] => {
	const from = rangeStart(range);
	const counts = new Map<string, number>();
	for (const e of events) {
		if (e.timestamp < from) continue;
		if (e.type !== "NAVIGATION" && e.type !== "TAB_ACTIVATED") continue;
		if (!e.url) continue;
		try {
			const host = new URL(e.url).hostname.replace(/^www\./, "");
			counts.set(host, (counts.get(host) ?? 0) + 1);
		} catch {}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([label, visits]) => ({ label, visits }));
};

interface EventMixDatum {
	label: string;
	count: number;
}

const buildEventMix = (
	events: StoredTabEvent[],
	range: Range,
): EventMixDatum[] => {
	const from = rangeStart(range);
	const counts = new Map<string, number>();
	for (const e of events) {
		if (e.timestamp < from) continue;
		counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([type, count]) => ({
			label: EVENT_LABELS[type] ?? type,
			count,
		}))
		.sort((a, b) => b.count - a.count);
};

interface FocusDatum {
	id: string;
	switches: number;
	interactions: number;
	radius: number;
}

const buildFocusMap = (sessions: Session[]): FocusDatum[] =>
	sessions.map((session) => ({
		id: session.id,
		switches: session.tabSwitchCount,
		interactions: session.interactionCount,
		radius: Math.min(12, Math.max(4, Math.sqrt(session.eventCount))),
	}));

// ─── Chart definitions (memoized per data ref so pointer focus survives) ───

export const NEON = [
	"#bfff00",
	"#f97316",
	"#06b6d4",
	"#ec4899",
	"#a78bfa",
	"#10b981",
];

/** Tailwind class equivalents of NEON — use for className styling (no style props). */
export const NEON_BG = [
	"bg-[#bfff00]",
	"bg-[#f97316]",
	"bg-[#06b6d4]",
	"bg-[#ec4899]",
	"bg-[#a78bfa]",
	"bg-[#10b981]",
];

const activityChart = (data: HourBucket[]): ChartDefinition<HourBucket> =>
	defineChart({
		marks: [
			areaY(data, {
				x: "label",
				y: "events",
				fill: "#bfff00",
				fillOpacity: 0.7,
			}),
			lineY(data, {
				x: "label",
				y: "events",
				stroke: "#000",
				strokeWidth: 3,
			}),
			dot(data, {
				x: "label",
				y: "events",
				r: 4,
				fill: "#f97316",
				stroke: "#000",
				strokeWidth: 2,
			}),
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
		svgAnimation: true,
		theme: {
			foreground: "#000",
			muted: "#666",
			grid: "#d4d4d4",
			palette: NEON,
		},
	});

const sitesChart = (data: SiteDatum[]): ChartDefinition<SiteDatum> =>
	defineChart({
		marks: [
			barX(data, {
				x: "visits",
				y: "label",
				fill: "#f97316",
				stroke: "#000",
				strokeWidth: 2,
			}),
		],
		scales: {
			x: {
				scale: () => scaleLinear().nice(4),
				grid: true,
				axis: { tickLabels: { fontSize: 10 } },
			},
			y: {
				scale: () => scaleBand().padding(0.2),
				axis: { tickLabels: { fontSize: 11 } },
			},
		},
		tooltip: false,
		svgAnimation: true,
		theme: {
			foreground: "#000",
			muted: "#666",
			grid: "#d4d4d4",
			palette: NEON,
		},
	});

const focusChart = (data: FocusDatum[]): ChartDefinition<FocusDatum> =>
	defineChart({
		marks: [
			dot(data, {
				x: "switches",
				y: "interactions",
				r: "radius",
				key: "id",
				fill: "#ec4899",
				stroke: "#000",
				strokeWidth: 2,
			}),
		],
		scales: {
			x: {
				scale: () => scaleLinear().nice(4),
				grid: true,
				axis: { tickLabels: { fontSize: 10 } },
			},
			y: {
				scale: () => scaleLinear().nice(4),
				grid: true,
				axis: { tickLabels: { fontSize: 10 } },
			},
		},
		tooltip: false,
		svgAnimation: true,
		theme: {
			foreground: "#000",
			muted: "#666",
			grid: "#d4d4d4",
			palette: NEON,
		},
	});

const eventMixChart = (
	data: EventMixDatum[],
): ChartDefinition<EventMixDatum> => {
	const slices = pie(data, { value: "count" });

	return defineChart({
		marks: [
			polar({
				inset: 8,
				radiusRatio: 0.84,
				scales: { angle: null, radius: null },
				marks: [
					radialArc(slices, {
						innerRadius: ({ radius }) => radius * 0.56,
						cornerRadius: 0,
						color: "label",
						key: "label",
						stroke: "#000",
						strokeWidth: 2,
					}),
				],
			}),
		],
		scales: { x: null, y: null },
		color: {
			domain: data.map((item) => item.label),
			range: NEON,
		},
		tooltip: false,
		svgAnimation: true,
	});
};

// ─── Chart panels (defs memoized here so @tanstack/charts stays lazy) ───

export const ActivityChart = ({
	data,
	height,
}: {
	data: HourBucket[];
	height?: number;
}) => {
	const def = useMemo(() => activityChart(data), [data]);
	return (
		<Chart
			className="ts-chart-host w-full"
			definition={def}
			ariaLabel="When browser activity was busiest"
			ariaDescription="Each point shows how many browser moments Tabot recorded in that hour or day. Taller peaks mean more activity."
			height={height ?? 250}
		/>
	);
};

export const FocusChart = ({
	data,
	height,
}: {
	data: FocusDatum[];
	height?: number;
}) => {
	const def = useMemo(() => focusChart(data), [data]);
	return (
		<Chart
			className="ts-chart-host w-full"
			definition={def}
			ariaLabel="How browsing stretches compare"
			ariaDescription="Each bubble is one browsing stretch. Bubbles farther right had more tab changes. Bubbles higher up had more clicks, scrolling, or typing. Bigger bubbles contain more activity."
			height={height ?? 250}
		/>
	);
};

export const EventMixChart = ({
	data,
	height,
}: {
	data: EventMixDatum[];
	height?: number;
}) => {
	const def = useMemo(() => eventMixChart(data), [data]);
	return (
		<Chart
			className="ts-chart-host w-full"
			definition={def}
			ariaLabel="Browser activity mix"
			ariaDescription="Proportional breakdown of recorded browser signal types."
			height={height ?? 180}
		/>
	);
};

export const SitesChart = ({
	data,
	height,
}: {
	data: SiteDatum[];
	height?: number;
}) => {
	const def = useMemo(() => sitesChart(data), [data]);
	return (
		<Chart
			className="ts-chart-host w-full"
			definition={def}
			ariaLabel="Sites returned to most often"
			ariaDescription="Sites ranked by how often you opened them or returned to their tabs."
			height={height ?? 220}
		/>
	);
};

export { buildActivityBuckets, buildEventMix, buildFocusMap, buildTopSites };
