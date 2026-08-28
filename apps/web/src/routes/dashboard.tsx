import type { StatsSnapshot, StoredTabEvent } from "@tabot/shared";
import { areaY, barY, defineChart } from "@tanstack/charts";
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
const buildEventMix = (
	events: StoredTabEvent[],
	range: RangeId,
): Array<{ label: string; count: number }> => {
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
			barY(data, {
				x: "label",
				y: "visits",
				fill: "#f97316",
				stroke: "#000",
				strokeWidth: 2,
			}),
		],
		scales: {
			x: {
				scale: () => scaleBand().padding(0.2),
				axis: { tickLabels: { fontSize: 10, rotate: -25 } },
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

// ─── Route component ───

const Dashboard = () => {
	const [tab, setTab] = useState<Tab>(TAB.OVERVIEW);
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
	const [range, setRange] = useState<RangeId>("today");
	const [extId, setExtId] = useState("");
	const [exporting, setExporting] = useState<"jsonl" | "csv" | null>(null);

	useEffect(() => {
		try {
			setExtId(localStorage.getItem("tabot_extension_id") || "");
		} catch {}
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

	const activityData = useMemo(
		() => (events ? buildActivityBuckets(events, range) : []),
		[events, range],
	);
	const siteData = useMemo(
		() => (events ? buildTopSites(events, range) : []),
		[events, range],
	);
	const eventMix = useMemo(
		() => (events ? buildEventMix(events, range) : []),
		[events, range],
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
		if (!derived) return;
		setExporting(format);
		const date = new Date().toISOString().slice(0, 10);
		if (format === "jsonl") {
			downloadFile(
				`tabot-export-${date}.jsonl`,
				buildExportJsonl(derived),
				"application/x-ndjson",
			);
		} else {
			downloadFile(
				`tabot-export-${date}.csv`,
				buildExportCsv(derived),
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
							Your browsing, decoded
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
						Install the Tabot extension and open this dashboard from{" "}
						<code className="bg-black text-lime px-1">chrome://extensions</code>{" "}
						(enable Developer mode → Load unpacked{" "}
						<code className="bg-black text-lime px-1">
							apps/extension/build/chrome-mv3-prod
						</code>
						). For local dev the manifest allows{" "}
						<code className="bg-black text-lime px-1">
							http://localhost:3000/*
						</code>{" "}
						via{" "}
						<code className="bg-black text-lime px-1">
							externally_connectable
						</code>{" "}
						— paste the extension ID below if needed.
						<div className="mt-3 flex gap-2">
							<input
								value={extId}
								onChange={(e) => setExtId(e.target.value)}
								placeholder="Extension ID (from chrome://extensions)"
								aria-label="Extension ID"
								className="flex-1 border-hard px-3 py-2 font-mono text-xs bg-white"
							/>
							<Button
								size="sm"
								onClick={() => {
									try {
										localStorage.setItem("tabot_extension_id", extId.trim());
									} catch {}
								}}
							>
								Save
							</Button>
						</div>
					</div>
				)}

				<TabBar active={tab} onChange={setTab} />

				{tab === TAB.OVERVIEW && (
					<>
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
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Activities tracked
								</div>
								<div className="font-bold text-2xl">
									{events
										? events
												.filter((e) => e.timestamp >= rangeStart(range))
												.length.toLocaleString()
										: "—"}
								</div>
							</div>
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Sessions {range === "today" ? "today" : "in range"}
								</div>
								<div className="font-bold text-2xl">
									{derived ? rangeSessions.length.toLocaleString() : "—"}
								</div>
							</div>
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Active time
								</div>
								<div className="font-bold text-2xl">
									{derived ? formatDuration(activeTimeMs) : "—"}
								</div>
							</div>
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Top site
								</div>
								<div className="font-bold text-xl break-all">
									{derived ? (topSite ?? "—") : "—"}
								</div>
							</div>
						</div>

						<Panel
							title={
								range === "today"
									? "Your activity today"
									: `Your activity (${RANGES.find((r) => r.id === range)?.label})`
							}
						>
							{activityDef ? (
								<Chart
									className="ts-chart-host w-full"
									definition={activityDef}
									ariaLabel="Browser activity over the last 24 hours"
									height={220}
								/>
							) : (
								<Empty text="No activity yet — browse with the extension connected." />
							)}
						</Panel>

						<div className="grid md:grid-cols-2 gap-3 mt-6">
							<Panel title="What you did most">
								{eventMix.every((m) => m.count === 0) ? (
									<Empty text="Nothing recorded yet." />
								) : (
									<div className="space-y-2">
										{eventMix.slice(0, 6).map((m) => (
											<div
												key={m.label}
												className="flex items-center gap-2 font-mono text-xs"
											>
												<span className="flex-1 text-muted-foreground">
													{m.label}
												</span>
												<div
													className="h-3 border-hard bg-lime"
													style={{
														width: `${Math.max(4, (m.count / (eventMix[0]?.count ?? 1)) * 100)}%`,
													}}
												/>
												<span className="w-16 text-right font-bold">
													{m.count.toLocaleString()}
												</span>
											</div>
										))}
									</div>
								)}
							</Panel>
							<Panel title="Top sites">
								{sitesDef ? (
									<Chart
										className="ts-chart-host w-full"
										definition={sitesDef}
										ariaLabel="Most visited sites"
										height={220}
									/>
								) : (
									<Empty text="No sites recorded yet." />
								)}
							</Panel>
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
									{derived.events.length} events · {derived.sessions.length}{" "}
									sessions · {derived.contexts.length} contexts ·{" "}
									{derived.memories.length} memories
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
