import type { StatsSnapshot, StoredTabEvent } from "@tabot/shared";
import { areaY, barX, defineChart, dot, lineY } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart, type ChartDefinition } from "@tanstack/react-charts";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Empty, Panel, TabBar } from "~/components/ui/dashboard-panels";
import {
	buildExportCsv,
	buildExportJsonl,
	derive,
	downloadFile,
	fetchEvents,
	fetchStats,
	filterDerived,
	formatAgo,
	formatDuration,
} from "~/lib/dashboard-data";
import { TAB, type Tab } from "~/lib/dashboard-tabs";

// ─── Human labels for event types (non-technical audience) ───

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

// event type (SCREAMING) → StatsSnapshot key (camelCase)
// (kept only if a future tab needs the raw breakdown)

const RANGES = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "7 days" },
	{ id: "30d", label: "30 days" },
	{ id: "all", label: "All time" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

// Local "YYYY-MM-DD" (toISOString is UTC — would shift the day in negative offsets)
const fmtLocalDay = (d: Date): string =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Export-period quick presets (same labels as overview ranges)
const EXPORT_PRESETS = [
	{ id: "all", label: "All time" },
	{ id: "7d", label: "Last 7 days" },
	{ id: "30d", label: "Last 30 days" },
	{ id: "custom", label: "Custom" },
] as const;
type ExportPresetId = (typeof EXPORT_PRESETS)[number]["id"];

const rangeStart = (r: RangeId): number => {
	if (r === "all") return 0;
	const d = new Date();
	if (r === "today") d.setHours(0, 0, 0, 0);
	else d.setDate(d.getDate() - (r === "7d" ? 7 : 30));
	return d.getTime();
};

// ─── Tab navigation ───

// ─── Chart data helpers (plain arrays, cheap to build each poll) ───

interface HourBucket {
	label: string;
	events: number;
}

// last 24h by hour, or day buckets for longer ranges
const buildActivityBuckets = (
	events: StoredTabEvent[],
	range: RangeId,
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
const buildTopSites = (
	events: StoredTabEvent[],
	range: RangeId,
): SiteDatum[] => {
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

// event types → friendly names, sorted desc, filtered to range
interface EventMixDatum {
	label: string;
	count: number;
}

interface FocusDatum {
	id: string;
	switches: number;
	interactions: number;
	radius: number;
}

const buildFocusMap = (
	sessions: ReturnType<typeof derive>["sessions"],
): FocusDatum[] =>
	sessions.map((session) => ({
		id: session.id,
		switches: session.tabSwitchCount,
		interactions: session.interactionCount,
		radius: Math.min(12, Math.max(4, Math.sqrt(session.eventCount))),
	}));

const buildEventMix = (
	events: StoredTabEvent[],
	range: RangeId,
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

// ─── Chart definitions (memoized per tab so pointer focus survives) ───

const NEON = ["#bfff00", "#f97316", "#06b6d4", "#ec4899", "#a78bfa", "#10b981"];

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

// ─── Route component ───

const Dashboard = () => {
	const [tab, setTab] = useState<Tab>(TAB.OVERVIEW);
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
	const [range, setRange] = useState<RangeId>("today");
	const [exporting, setExporting] = useState<"jsonl" | "csv" | null>(null);
	// Export period filter: from/to as "YYYY-MM-DD" (inclusive); empty = unbounded.
	const [expFrom, setExpFrom] = useState("");
	const [expTo, setExpTo] = useState("");
	const [expPreset, setExpPreset] = useState<ExportPresetId>("all");

	useEffect(() => {
		let alive = true;

		const pollStats = async () => {
			const s = await fetchStats();
			if (!alive || !s) return;
			setStats(s);
		};
		const pollEvents = async () => {
			const ev = await fetchEvents();
			if (alive && ev && ev.length > 0) setEvents(ev);
		};

		pollStats();
		pollEvents();
		const tStats = setInterval(pollStats, 1000);
		const tEvents = setInterval(pollEvents, 5000); // derived layers refresh slower
		return () => {
			alive = false;
			clearInterval(tStats);
			clearInterval(tEvents);
		};
	}, []);

	const hasExtension = stats !== null;
	const derived = useMemo(() => (events ? derive(events) : null), [events]);
	// Full filtered data for export (overlap semantics on the selected period)
	const exportData = useMemo(() => {
		if (!derived) return null;
		const dayBounds = (d: string): number | undefined => {
			if (!d) return undefined;
			const t = new Date(`${d}T00:00:00`).getTime();
			return Number.isNaN(t) ? undefined : t;
		};
		const from = dayBounds(expFrom);
		const toRaw = dayBounds(expTo);
		const to = toRaw === undefined ? undefined : toRaw + 86_400_000 - 1;
		return filterDerived(derived, from, to);
	}, [derived, expFrom, expTo]);
	// Live preview counts for the selected period
	const exportCounts = useMemo(
		() =>
			exportData
				? {
						events: exportData.events.length,
						sessions: exportData.sessions.length,
						contexts: exportData.contexts.length,
						memories: exportData.memories.length,
					}
				: { events: 0, sessions: 0, contexts: 0, memories: 0 },
		[exportData],
	);
	const lastSessions = derived?.sessions.slice(-10).reverse() ?? [];
	const lastContexts = derived?.contexts.slice(-10).reverse() ?? [];
	const lastMemories = derived?.memories ?? [];

	// sessions overlapping the selected range
	const rangeSessions = useMemo(
		() =>
			(derived?.sessions ?? []).filter(
				(x) => x.startTimestamp >= rangeStart(range),
			),
		[derived, range],
	);
	const activeTimeMs = useMemo(
		() => rangeSessions.reduce((sum, x) => sum + x.duration, 0),
		[rangeSessions],
	);
	const topSite = useMemo(() => {
		const counts = new Map<string, number>();
		for (const sess of rangeSessions)
			for (const d of sess.domains)
				counts.set(d.domain, (counts.get(d.domain) ?? 0) + d.eventCount);
		const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
		return top ? top[0] : null;
	}, [rangeSessions]);

	const rangeEvents = useMemo(
		() => events?.filter((event) => event.timestamp >= rangeStart(range)) ?? [],
		[events, range],
	);
	const activityData = useMemo(
		() => (events ? buildActivityBuckets(events, range) : []),
		[events, range],
	);
	const busiestMoment = useMemo(
		() =>
			activityData.reduce<HourBucket | null>(
				(peak, bucket) =>
					!peak || bucket.events > peak.events ? bucket : peak,
				null,
			),
		[activityData],
	);
	const siteData = useMemo(
		() => (events ? buildTopSites(events, range) : []),
		[events, range],
	);
	const eventMix = useMemo(
		() => (events ? buildEventMix(events, range) : []),
		[events, range],
	);
	const tabSwitches = useMemo(
		() => rangeEvents.filter((event) => event.type === "TAB_ACTIVATED").length,
		[rangeEvents],
	);
	const interactionCount = useMemo(
		() =>
			rangeEvents.filter(
				(event) =>
					event.type === "CLICK" ||
					event.type === "SCROLL" ||
					event.type === "KEY_ACTIVITY",
			).length,
		[rangeEvents],
	);
	const navigationCount = useMemo(
		() => rangeEvents.filter((event) => event.type === "NAVIGATION").length,
		[rangeEvents],
	);
	const domainCount = useMemo(
		() =>
			new Set(
				rangeSessions.flatMap((session) =>
					session.domains.map((domain) => domain.domain),
				),
			).size,
		[rangeSessions],
	);
	const focusData = useMemo(
		() => buildFocusMap(rangeSessions),
		[rangeSessions],
	);
	const focusDef = useMemo(
		() => (focusData.length > 0 ? focusChart(focusData) : null),
		[focusData],
	);
	const eventMixDef = useMemo(
		() => (eventMix.length > 0 ? eventMixChart(eventMix.slice(0, 5)) : null),
		[eventMix],
	);
	const activityDef = useMemo(
		() => (activityData.length > 0 ? activityChart(activityData) : null),
		[activityData],
	);
	const sitesDef = useMemo(
		() => (siteData.length > 0 ? sitesChart(siteData) : null),
		[siteData],
	);

	const handleExport = (format: "jsonl" | "csv") => {
		if (!derived || !exportData) return;
		setExporting(format);
		const date = new Date().toISOString().slice(0, 10);
		if (format === "jsonl") {
			downloadFile(
				`tabot-export-${date}.jsonl`,
				buildExportJsonl(exportData),
				"application/x-ndjson",
			);
		} else {
			downloadFile(
				`tabot-export-${date}.csv`,
				buildExportCsv(exportData),
				"text/csv",
			);
		}
		setTimeout(() => setExporting(null), 800);
	};

	return (
		<div className="min-h-screen bg-black flex items-center justify-center p-4 md:p-8">
			<div className="bg-white border-hard shadow-hard-xl p-6 md:p-8 max-w-5xl w-full">
				<div className="flex items-center gap-4 mb-6">
					<img
						src={`${import.meta.env.BASE_URL}logo.png`}
						alt="Tabot"
						className="h-16 w-16 border-hard"
					/>
					<div>
						<h1 className="text-3xl font-bold tracking-tight">Tabot</h1>
						<p className="font-mono text-sm text-muted-foreground">
							Thinking across tabs.
						</p>
					</div>
					<div className="ml-auto flex items-center gap-2 font-mono text-xs">
						<span
							className={`w-3 h-3 border-hard inline-block ${hasExtension ? "bg-lime" : "bg-zinc-300"}`}
						/>
						{hasExtension ? "Connected" : "No extension"}
					</div>
				</div>

				{!hasExtension && (
					<div className="border-hard bg-lime/20 p-4 mb-6 font-mono text-xs leading-relaxed">
						<div className="font-bold uppercase tracking-wider mb-1">
							Extension not detected
						</div>
						Load the unpacked extension and reload this page.
					</div>
				)}

				<TabBar active={tab} onChange={setTab} />

				{tab === TAB.OVERVIEW && (
					<>
						<div className="mb-6 flex flex-col gap-4 border-hard bg-lime p-4 shadow-hard-sm md:flex-row md:items-end md:justify-between">
							<div>
								<h2 className="text-3xl font-bold tracking-tight">
									Your browsing story
								</h2>
								<p className="mt-1 max-w-xl text-sm">
									Follow what you did, where you went, and when your browser got
									busy.
								</p>
							</div>
							<div className="font-mono text-xs uppercase tracking-wider">
								{rangeEvents.length.toLocaleString()} moments captured
							</div>
						</div>
						<div className="flex flex-wrap gap-2 mb-4">
							{RANGES.map((r) => (
								<button
									key={r.id}
									type="button"
									onClick={() => setRange(r.id)}
									className={`font-mono text-xs uppercase tracking-wider border-2 px-3 py-1.5 ${
										range === r.id
											? "bg-lime text-black border-black"
											: "bg-white text-black border-black hover:bg-lime/20"
									}`}
								>
									{r.label}
								</button>
							))}
						</div>
						<div className="mb-3 border-hard bg-black p-4 text-white shadow-hard-sm">
							<div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] md:items-center">
								<div>
									<h3 className="text-2xl font-bold">What this tells you</h3>
									<p className="mt-1 max-w-md text-sm text-zinc-300">
										Lots of tab changes and page hops can mean your attention
										was split. Lots of hands-on activity in fewer places can
										mean you settled into work.
									</p>
								</div>
								<div className="border-hard bg-pink-300 p-3 text-black">
									<div className="font-mono text-xs uppercase tracking-wider">
										You did
									</div>
									<div className="mt-1 text-2xl font-bold tabular-nums">
										{interactionCount.toLocaleString()} things
									</div>
									<div className="mt-1 font-mono text-xs">
										Clicked, scrolled, or typed
									</div>
								</div>
								<div className="border-hard bg-orange-400 p-3 text-black">
									<div className="font-mono text-xs uppercase tracking-wider">
										You opened
									</div>
									<div className="mt-1 text-2xl font-bold tabular-nums">
										{navigationCount.toLocaleString()} pages
									</div>
									<div className="mt-1 font-mono text-xs">
										New pages that loaded
									</div>
								</div>
								<div className="border-hard bg-cyan-300 p-3 text-black">
									<div className="font-mono text-xs uppercase tracking-wider">
										You explored
									</div>
									<div className="mt-1 text-2xl font-bold tabular-nums">
										{domainCount.toLocaleString()} sites
									</div>
									<div className="mt-1 font-mono text-xs">
										Different places in your browser
									</div>
								</div>
							</div>
						</div>
						<div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
							<div className="border-hard bg-black p-4 text-white shadow-hard-sm">
								<div className="font-mono text-xs uppercase tracking-wider text-lime">
									Browser moments
								</div>
								<div className="mt-2 text-3xl font-bold tabular-nums">
									{events ? rangeEvents.length.toLocaleString() : "—"}
								</div>
								<div className="mt-1 font-mono text-xs text-zinc-400">
									Tab moves, page loads, and actions
								</div>
							</div>
							<div className="border-hard bg-white p-4 shadow-hard-sm">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Browsing stretches
								</div>
								<div className="mt-2 text-3xl font-bold tabular-nums">
									{derived ? rangeSessions.length.toLocaleString() : "—"}
								</div>
								<div className="mt-1 font-mono text-xs text-muted-foreground">
									{derived && rangeSessions.length > 0
										? `${formatDuration(activeTimeMs / rangeSessions.length)} average span`
										: "A stretch starts after you browse"}
								</div>
							</div>
							<div className="border-hard bg-orange-400 p-4 shadow-hard-sm">
								<div className="font-mono text-xs uppercase tracking-wider">
									Times you changed tabs
								</div>
								<div className="mt-2 text-3xl font-bold tabular-nums">
									{tabSwitches.toLocaleString()}
								</div>
								<div className="mt-1 font-mono text-xs">
									{rangeSessions.length > 0
										? `${(tabSwitches / rangeSessions.length).toFixed(1)} per stretch`
										: "No tab changes yet"}
								</div>
							</div>
							<div className="border-hard bg-cyan-300 p-4 shadow-hard-sm">
								<div className="font-mono text-xs uppercase tracking-wider">
									Most visited site
								</div>
								<div className="mt-2 break-all text-xl font-bold">
									{derived ? (topSite ?? "—") : "—"}
								</div>
								<div className="mt-1 font-mono text-xs">
									Site you returned to most
								</div>
							</div>
						</div>

						<div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
							<div className="border-hard bg-zinc-100 p-4 shadow-hard-sm">
								<div className="mb-3 flex flex-wrap items-end justify-between gap-2">
									<div>
										<h3 className="text-xl font-bold">
											When your browser got busy
										</h3>
										<p className="font-mono text-xs text-muted-foreground">
											Taller peaks mean more things happening in your browser.
										</p>
									</div>
									<span className="border-hard bg-white px-2 py-1 font-mono text-xs">
										{busiestMoment
											? `Busiest: ${busiestMoment.label} (${busiestMoment.events})`
											: "Waiting for activity"}
									</span>
								</div>
								{activityDef ? (
									<Chart
										className="ts-chart-host w-full"
										definition={activityDef}
										ariaLabel="When browser activity was busiest"
										ariaDescription="Each point shows how many browser moments Tabot recorded in that hour or day. Taller peaks mean more activity."
										height={250}
									/>
								) : (
									<Empty text="No activity yet — browse with the extension connected." />
								)}
							</div>
							<div className="border-hard bg-pink-300 p-4 shadow-hard-sm">
								<h3 className="text-xl font-bold">
									How each browsing stretch felt
								</h3>
								<p className="mb-3 font-mono text-xs">
									Each bubble is one stretch of browsing. Read it left to right,
									then bottom to top.
								</p>
								{focusDef ? (
									<Chart
										className="ts-chart-host w-full"
										definition={focusDef}
										ariaLabel="How browsing stretches compare"
										ariaDescription="Each bubble is one browsing stretch. Bubbles farther right had more tab changes. Bubbles higher up had more clicks, scrolling, or typing. Bigger bubbles contain more activity."
										height={250}
									/>
								) : (
									<Empty text="Browse for a while to compare your stretches." />
								)}
								<div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider">
									<span>More tab changes →</span>
									<span>More hands-on activity ↑</span>
								</div>
							</div>
						</div>

						<div className="mt-6 grid gap-3 md:grid-cols-2">
							<div className="border-hard bg-white p-4 shadow-hard-sm">
								<h3 className="text-xl font-bold">What you did most</h3>
								<p className="mb-3 font-mono text-xs text-muted-foreground">
									Your browser actions, grouped by type
								</p>
								{eventMixDef ? (
									<div className="grid grid-cols-[140px_1fr] items-center gap-3 sm:grid-cols-[180px_1fr]">
										<Chart
											className="ts-chart-host w-full"
											definition={eventMixDef}
											ariaLabel="Browser activity mix"
											ariaDescription="Proportional breakdown of recorded browser signal types."
											height={180}
										/>
										<div className="space-y-2">
											{eventMix.slice(0, 5).map((item, index) => (
												<div
													key={item.label}
													className="flex items-center gap-2 font-mono text-xs"
												>
													<span
														className="h-3 w-3 border-hard"
														style={{ backgroundColor: NEON[index] }}
													/>
													<span className="min-w-0 flex-1 truncate">
														{item.label}
													</span>
													<span className="font-bold tabular-nums">
														{item.count.toLocaleString()}
													</span>
												</div>
											))}
										</div>
									</div>
								) : (
									<Empty text="Nothing recorded yet." />
								)}
							</div>
							<div className="border-hard bg-yellow-200 p-4 shadow-hard-sm">
								<h3 className="text-xl font-bold">
									Sites you kept returning to
								</h3>
								<p className="mb-3 font-mono text-xs">
									A longer bar means you opened or returned to that site more
									often.
								</p>
								{sitesDef ? (
									<Chart
										className="ts-chart-host w-full"
										definition={sitesDef}
										ariaLabel="Sites returned to most often"
										ariaDescription="Sites ranked by how often you opened them or returned to their tabs."
										height={Math.max(220, siteData.length * 36 + 48)}
									/>
								) : (
									<Empty text="No sites recorded yet." />
								)}
							</div>
						</div>

						<div className="flex gap-3 mt-6">
							<Button
								className="flex-1"
								onClick={() => window.location.reload()}
							>
								Refresh
							</Button>
						</div>
					</>
				)}

				{tab === TAB.ACTIVITY && (
					<>
						<Panel title="Sessions">
							{lastSessions.length === 0 ? (
								<Empty text="No sessions yet — browse with the extension connected." />
							) : (
								<div className="space-y-3">
									{lastSessions.map((sess) => (
										<div
											key={sess.id}
											className="border-hard bg-zinc-50 p-3 font-mono text-xs"
										>
											<div className="flex flex-wrap gap-x-4 gap-y-1">
												<span className="font-bold text-sm">
													{sess.domains[0]?.domain ?? "?"}
												</span>
												<span className="text-muted-foreground">
													{new Date(sess.startTimestamp).toLocaleString(
														Intl.DateTimeFormat().resolvedOptions().locale,
														{
															localeMatcher: "lookup",
															timeZone:
																Intl.DateTimeFormat().resolvedOptions()
																	.timeZone,
														},
													)}
												</span>
												<span className="text-muted-foreground">
													{formatDuration(sess.duration)}
												</span>
											</div>
											<div className="mt-1 flex flex-wrap gap-3 text-muted-foreground">
												<span>{sess.eventCount} events</span>
												<span>{sess.interactionCount} interactions</span>
												<span>{sess.navigationCount} navigations</span>
												<span>{sess.tabSwitchCount} tab switches</span>
											</div>
											<div className="mt-1 text-muted-foreground">
												{sess.domains.map((d) => d.domain).join(" · ")}
											</div>
										</div>
									))}
								</div>
							)}
						</Panel>

						<Panel title="Contexts" className="mt-6">
							{lastContexts.length === 0 ? (
								<Empty text="No contexts yet." />
							) : (
								<div className="space-y-3">
									{lastContexts.map((c) => (
										<div
											key={c.id}
											className="border-hard bg-zinc-50 p-3 font-mono text-xs"
										>
											<div className="flex flex-wrap gap-x-4 gap-y-1">
												<span className="font-bold text-sm">
													{c.primaryDomain}
												</span>
												<span className="text-muted-foreground">
													{new Date(c.startTimestamp).toLocaleString(
														Intl.DateTimeFormat().resolvedOptions().locale,
														{
															localeMatcher: "lookup",
															timeZone:
																Intl.DateTimeFormat().resolvedOptions()
																	.timeZone,
														},
													)}
												</span>
												<span className="text-muted-foreground">
													{formatDuration(c.duration)}
												</span>
												<span className="text-muted-foreground">
													{c.sessionCount} sessions
												</span>
											</div>
											<div className="mt-1 flex flex-wrap gap-3 text-muted-foreground">
												<span>{c.totalEventCount} events</span>
												<span>{c.totalInteractionCount} interactions</span>
												<span>recurrence {c.recurrenceCount}</span>
											</div>
											<div className="mt-1 text-muted-foreground">
												{c.domains
													.map((d) => `${d.domain} (${d.sessionCount})`)
													.join(" · ")}
											</div>
											{c.episodes && c.episodes.length > 0 && (
												<div className="mt-1 text-violet-700">
													<span className="font-semibold">episodes:</span>{" "}
													{c.episodes.length}
													{" · "}
													{c.episodes
														.map((e) =>
															e.domains
																.map((d) => d.split("://")[1] ?? d)
																.join(" → "),
														)
														.join(" || ")}
												</div>
											)}
											{c.sequence && (
												<div className="mt-1 text-emerald-700">
													<span className="font-semibold">seq:</span>{" "}
													{c.sequence
														.map((s) => s.split("://")[1] ?? s)
														.join(" → ")}
												</div>
											)}
											{c.mergeEvidence && c.mergeEvidence.length > 0 && (
												<div className="mt-1 text-amber-700">
													<span className="font-semibold">evidence:</span>{" "}
													{c.mergeEvidence.join(", ")}
												</div>
											)}
											{c.excursions && c.excursions.length > 0 && (
												<div className="mt-1 text-sky-700">
													<span className="font-semibold">excursion:</span>{" "}
													{c.excursions
														.map(
															(e) =>
																`${e.activities.map((a) => a.origin || a.exactUrl).join(" → ")}`,
														)
														.join(" · ")}
												</div>
											)}
										</div>
									))}
								</div>
							)}
						</Panel>
					</>
				)}

				{tab === TAB.MEMORIES && (
					<Panel title={`Memories (${derived?.memories.length ?? 0})`}>
						{lastMemories.length === 0 ? (
							<Empty text="No memories yet — need ≥2 related contexts or ≥500 events in one." />
						) : (
							<div className="space-y-3">
								{lastMemories.map((m) => (
									<div
										key={m.id}
										className="border-hard bg-zinc-50 p-3 font-mono text-xs"
									>
										<div className="flex flex-wrap gap-x-4 gap-y-1">
											<span className="font-bold text-sm">{m.signature}</span>
											<span className="text-muted-foreground">{m.kind}</span>
											<span className="text-muted-foreground">
												strength {m.strength.toFixed(2)}
											</span>
											<span className="text-muted-foreground">
												conf {(m.confidence ?? 0).toFixed(2)}
											</span>
											<span className="text-muted-foreground">
												stale {formatAgo(m.staleness)}
											</span>
										</div>
										<div className="mt-1 whitespace-pre-line text-muted-foreground">
											{m.observation}
										</div>
										{m.sequence && (
											<div className="mt-1 text-emerald-700">
												<span className="font-semibold">seq:</span>{" "}
												{m.sequence
													.map((s) => s.split("://")[1] ?? s)
													.join(" → ")}
											</div>
										)}
										<div className="mt-1 text-muted-foreground">
											{m.contextCount} contexts · {m.totalSessionCount} sessions
											· {m.totalEventCount} events
										</div>
									</div>
								))}
							</div>
						)}
					</Panel>
				)}

				{tab === TAB.EXPORT && (
					<Panel title="Export">
						{!derived ? (
							<Empty text="No data to export yet — connect the extension and browse." />
						) : (
							<div className="space-y-4">
								<div className="font-mono text-xs text-muted-foreground">
									Export the raw events plus derived sessions, contexts, and
									memories.
									<strong className="text-black">
										{" "}
										JSONL + manifest is the canonical format
									</strong>{" "}
									(self-describing, reproducible); CSV is a flat convenience
									view of sessions only and is <strong>not canonical</strong>.
								</div>

								{/* Period filter — neobrutal themed, native date inputs */}
								<div className="border-2 border-black bg-white p-4 space-y-3">
									<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
										Export period
									</div>
									<div className="flex flex-wrap gap-2">
										{EXPORT_PRESETS.map((p) => (
											<button
												key={p.id}
												type="button"
												onClick={() => {
													setExpPreset(p.id);
													if (p.id === "all") {
														setExpFrom("");
														setExpTo("");
													} else if (p.id === "7d" || p.id === "30d") {
														const d = new Date();
														d.setDate(d.getDate() - (p.id === "7d" ? 7 : 30));
														setExpFrom(fmtLocalDay(d));
														setExpTo("");
													}
												}}
												className={`font-mono text-xs uppercase tracking-wider border-2 px-3 py-1.5 ${
													expPreset === p.id
														? "bg-lime text-black border-black"
														: "bg-white text-black border-black hover:bg-lime/20"
												}`}
											>
												{p.label}
											</button>
										))}
									</div>
									{expPreset === "custom" && (
										<div className="flex flex-wrap items-center gap-3">
											<label className="font-mono text-xs uppercase tracking-wider">
												From
												<input
													type="date"
													value={expFrom}
													max={expTo || undefined}
													onChange={(e) => {
														setExpFrom(e.target.value);
													}}
													className="ml-2 border-2 border-black px-2 py-1 font-mono text-xs bg-white"
												/>
											</label>
											<label className="font-mono text-xs uppercase tracking-wider">
												To
												<input
													type="date"
													value={expTo}
													min={expFrom || undefined}
													onChange={(e) => {
														setExpTo(e.target.value);
													}}
													className="ml-2 border-2 border-black px-2 py-1 font-mono text-xs bg-white"
												/>
											</label>
										</div>
									)}
									<div className="font-mono text-xs text-muted-foreground">
										{exportCounts.events.toLocaleString()} events ·{" "}
										{exportCounts.sessions.toLocaleString()} sessions ·{" "}
										{exportCounts.contexts.toLocaleString()} contexts ·{" "}
										{exportCounts.memories.toLocaleString()} memories
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<Button
										variant="default"
										disabled={exporting === "jsonl"}
										onClick={() => handleExport("jsonl")}
									>
										{exporting === "jsonl" ? "Exporting…" : "Export JSONL"}
									</Button>
									<Button
										variant="outline"
										disabled={exporting === "csv"}
										onClick={() => handleExport("csv")}
									>
										{exporting === "csv"
											? "Exporting…"
											: "Export CSV (non-canonical)"}
									</Button>
								</div>

								<div className="font-mono text-xs text-muted-foreground">
									Total available: {derived.events.length} events ·{" "}
									{derived.sessions.length} sessions · {derived.contexts.length}{" "}
									contexts · {derived.memories.length} memories
								</div>
							</div>
						)}
					</Panel>
				)}
			</div>
		</div>
	);
};

export const Route = createFileRoute("/dashboard")({
	component: Dashboard,
});
