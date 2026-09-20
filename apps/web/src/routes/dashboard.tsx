import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityList } from "~/components/dashboard-lists";
import { DashboardShell } from "~/components/dashboard-shell";
import { MemoryList } from "~/components/memory-list";
import { Button } from "~/components/ui/button";
import { Empty, Loading } from "~/components/ui/dashboard-panels";
import { useDashboardData } from "~/hooks/use-dashboard-data";
import type { HourBucket } from "~/lib/dashboard-charts";
import {
	buildExportJsonl,
	downloadFile,
	exportFilename,
	filterDerived,
	formatDuration,
	rangeStart,
	sanitizeDerived,
} from "~/lib/dashboard-data";
import type { CliTarget, WebTarget } from "~/lib/share-targets";

type ChartsApi = typeof import("~/lib/dashboard-charts");
type ShareTargets = typeof import("~/lib/share-targets");

const RANGES = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "7 days" },
	{ id: "30d", label: "30 days" },
	{ id: "all", label: "All time" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const EXPORT_PRESETS = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "Last 7 days" },
	{ id: "30d", label: "Last 30 days" },
	{ id: "all", label: "All time" },
	{ id: "custom", label: "Custom" },
] as const;
type ExportPresetId = (typeof EXPORT_PRESETS)[number]["id"];

const formatLocalDay = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const copyText = async (text: string): Promise<boolean> => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const element = document.createElement("textarea");
			element.value = text;
			element.className = "fixed opacity-0";
			document.body.appendChild(element);
			element.select();
			document.execCommand("copy");
			element.remove();
			return true;
		} catch {
			return false;
		}
	}
};

const Dashboard = () => {
	const { derived, events, hasExtension, initialized } = useDashboardData();
	const [range, setRange] = useState<RangeId>("today");
	const [exporting, setExporting] = useState(false);
	const [downloaded, setDownloaded] = useState(false);
	const [copiedTo, setCopiedTo] = useState<string | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportPreset, setExportPreset] = useState<ExportPresetId>("all");
	const [exportFrom, setExportFrom] = useState("");
	const [exportTo, setExportTo] = useState("");
	const [charts, setCharts] = useState<ChartsApi | null>(null);
	const [targets, setTargets] = useState<ShareTargets | null>(null);

	useEffect(() => {
		let alive = true;
		import("~/lib/dashboard-charts")
			.then((module) => {
				if (alive) setCharts(module);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	useEffect(() => {
		if (!derived) return;
		let alive = true;
		import("~/lib/share-targets")
			.then((module) => {
				if (alive) setTargets(module);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [derived]);

	const exportData = useMemo(() => {
		if (!derived) return null;
		if (exportPreset !== "custom") {
			return filterDerived(derived, rangeStart(exportPreset));
		}
		const start = exportFrom
			? new Date(`${exportFrom}T00:00:00`).getTime()
			: undefined;
		const end = exportTo
			? new Date(`${exportTo}T00:00:00`).getTime() + 86_399_999
			: undefined;
		return filterDerived(
			derived,
			Number.isNaN(start ?? 0) ? undefined : start,
			Number.isNaN(end ?? 0) ? undefined : end,
		);
	}, [derived, exportFrom, exportPreset, exportTo]);
	const exportCounts = useMemo(
		() => ({
			events: exportData?.events.length ?? 0,
			sessions: exportData?.sessions.length ?? 0,
			contexts: exportData?.contexts.length ?? 0,
			memories: exportData?.memories.length ?? 0,
		}),
		[exportData],
	);
	const readyLayers = Object.values(exportCounts).filter(
		(count) => count > 0,
	).length;
	const recentSessions = derived?.sessions.slice(-5).reverse() ?? [];
	const recentContexts = derived?.contexts.slice(-3).reverse() ?? [];
	const recentMemories = derived?.memories.slice(-3).reverse() ?? [];

	const rangeSessions = useMemo(
		() =>
			(derived?.sessions ?? []).filter(
				(session) => session.startTimestamp >= rangeStart(range),
			),
		[derived, range],
	);
	const rangeEvents = useMemo(
		() => events?.filter((event) => event.timestamp >= rangeStart(range)) ?? [],
		[events, range],
	);
	const activeTimeMs = useMemo(
		() => rangeSessions.reduce((total, session) => total + session.duration, 0),
		[rangeSessions],
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
	const activityData = useMemo(
		() => (charts && events ? charts.buildActivityBuckets(events, range) : []),
		[charts, events, range],
	);
	const focusData = useMemo(
		() => (charts ? charts.buildFocusMap(rangeSessions) : []),
		[charts, rangeSessions],
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

	const handleDownload = async () => {
		if (!exportData) return;
		setExporting(true);
		setExportError(null);
		try {
			downloadFile(
				exportFilename(exportData.events, "jsonl"),
				buildExportJsonl(await sanitizeDerived(exportData)),
				"application/x-ndjson",
			);
			setDownloaded(true);
			setCopiedTo(
				"Data downloaded. Open an assistant, then upload it in chat.",
			);
			setTimeout(() => setCopiedTo(null), 3500);
		} catch {
			setExportError("Redaction failed — nothing was downloaded.");
		} finally {
			setTimeout(() => setExporting(false), 800);
		}
	};

	const openAiChat = (target: WebTarget) => {
		window.open(target.url, "_blank", "noopener");
		setCopiedTo(`${target.name} opened. Upload downloaded data in chat.`);
		setTimeout(() => setCopiedTo(null), 3500);
	};

	const copyCli = async (target: CliTarget) => {
		const copied = await copyText(target.cmd);
		setCopiedTo(
			copied
				? `${target.name} command copied.`
				: `Copy command for ${target.name}.`,
		);
		setTimeout(() => setCopiedTo(null), 3500);
	};

	if (!initialized) return <Loading />;

	return (
		<DashboardShell>
			{!hasExtension && (
				<div className="mb-6 border-hard bg-yellow-200 p-4 font-mono text-xs leading-relaxed">
					<strong className="block text-sm">Extension not detected</strong>
					Load unpacked extension, then reload this page.
				</div>
			)}

			<section
				aria-labelledby="share-context-heading"
				className="border-hard bg-lime p-5 shadow-hard-lg md:p-6"
			>
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:items-start">
					<div>
						<h1
							id="share-context-heading"
							className="max-w-xl text-4xl font-bold leading-none tracking-tight md:text-5xl"
						>
							Share your context. Keep your momentum.
						</h1>
						<p className="mt-4 max-w-xl text-base leading-relaxed">
							Package browser activity into portable, sanitized context for any
							assistant or tool. Nothing leaves device until you choose.
						</p>
						<div className="mt-6 flex flex-wrap gap-2">
							{EXPORT_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									onClick={() => {
										setDownloaded(false);
										setExportPreset(preset.id);
										if (preset.id === "today") {
											setExportFrom(formatLocalDay(new Date()));
										}
									}}
									className={`border-2 border-black px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${exportPreset === preset.id ? "bg-black text-lime" : "bg-white hover:bg-yellow-200"}`}
								>
									{preset.label}
								</button>
							))}
						</div>
						{exportPreset === "custom" && (
							<div className="mt-3 flex flex-wrap gap-3 font-mono text-xs">
								<label className="flex items-center gap-2">
									From
									<input
										type="date"
										value={exportFrom}
										max={exportTo || undefined}
										onChange={(event) => {
											setDownloaded(false);
											setExportFrom(event.target.value);
										}}
										className="border-2 border-black bg-white px-2 py-1"
									/>
								</label>
								<label className="flex items-center gap-2">
									To
									<input
										type="date"
										value={exportTo}
										min={exportFrom || undefined}
										onChange={(event) => {
											setDownloaded(false);
											setExportTo(event.target.value);
										}}
										className="border-2 border-black bg-white px-2 py-1"
									/>
								</label>
							</div>
						)}
					</div>
					<div className="bg-black p-5 text-white">
						<div className="flex items-end justify-between gap-4">
							<div>
								<h2 className="text-2xl font-bold">Context pack</h2>
								<p className="mt-1 font-mono text-xs text-zinc-300">
									{readyLayers}/4 layers ready to share
								</p>
							</div>
							<span className="font-mono text-4xl font-bold text-lime tabular-nums">
								{readyLayers}
							</span>
						</div>
						<fieldset className="m-0 mt-5 grid min-w-0 grid-cols-4 gap-2 border-0 p-0">
							<legend className="sr-only">
								{readyLayers} of 4 context layers ready
							</legend>
							{Object.entries(exportCounts).map(([layer, count]) => (
								<div
									key={layer}
									className={
										count > 0
											? "bg-lime p-2 text-black"
											: "bg-zinc-700 p-2 text-zinc-300"
									}
								>
									<div className="font-mono text-[10px] uppercase tracking-wider">
										{layer}
									</div>
									<div className="mt-1 text-lg font-bold tabular-nums">
										{count.toLocaleString()}
									</div>
								</div>
							))}
						</fieldset>
					</div>
				</div>

				{derived ? (
					<div className="mt-6 border-t-2 border-black pt-5">
						<h2 className="text-xl font-bold">Share data with an assistant</h2>
						<p className="mt-1 max-w-2xl text-sm">
							Download selected browser data, then upload it in your assistant.
							Nothing leaves this device until you upload it.
						</p>
						<div className="mt-4 flex flex-wrap items-center gap-4">
							<Button
								variant="secondary"
								size="lg"
								disabled={exporting}
								onClick={handleDownload}
							>
								{exporting ? "Preparing context…" : "Download Context"}
							</Button>
							<p className="font-mono text-xs font-bold">
								{downloaded
									? "Data ready. Choose an assistant and upload it in chat."
									: "Download Context first, then choose an assistant."}
							</p>
						</div>
						<div className="mt-5 border-t-2 border-black pt-5">
							<h3 className="text-base font-bold">Choose an assistant</h3>
							<div className="mt-3 flex flex-wrap gap-2">
								{targets ? (
									targets.WEB_TARGETS.map((target) => (
										<button
											key={target.name}
											type="button"
											disabled={!downloaded}
											onClick={() => openAiChat(target)}
											className="inline-flex items-center gap-2 border-2 border-black bg-white px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-hard-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50"
										>
											<target.icon size={18} /> {target.name}
										</button>
									))
								) : (
									<span className="font-mono text-xs">
										Preparing assistants…
									</span>
								)}
							</div>
							<div className="mt-4 flex flex-wrap items-center gap-2">
								<p className="font-mono text-xs">Using local assistant?</p>
								{targets?.CLI_TARGETS.map((target) => (
									<button
										key={target.name}
										type="button"
										disabled={!downloaded}
										onClick={() => copyCli(target)}
										className="border-2 border-black bg-lime px-3 py-2 font-mono text-xs font-bold hover:bg-white disabled:opacity-50"
									>
										{target.name}
									</button>
								))}
							</div>
						</div>
						{copiedTo && (
							<p className="mt-4 font-mono text-xs font-bold" role="status">
								{copiedTo}
							</p>
						)}
						{exportError && (
							<p className="mt-4 font-mono text-xs font-bold" role="alert">
								{exportError}
							</p>
						)}
					</div>
				) : (
					<p className="mt-6 border-t-2 border-black pt-5 font-mono text-xs">
						Browse with extension connected to build context pack.
					</p>
				)}
			</section>

			<section
				aria-labelledby="browser-summary-heading"
				className="mt-10 border-t-2 border-black pt-8"
			>
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<h2
							id="browser-summary-heading"
							className="text-3xl font-bold tracking-tight"
						>
							Browser activity
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Observed activity, never productivity scoring.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{RANGES.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setRange(item.id)}
								className={`border-2 border-black px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider ${range === item.id ? "bg-black text-lime" : "bg-white hover:bg-lime"}`}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
				<div className="mt-5 grid gap-3 sm:grid-cols-3">
					<div className="border-hard bg-black p-4 text-white">
						<div className="font-mono text-xs uppercase tracking-wider text-lime">
							Moments
						</div>
						<div className="mt-2 text-3xl font-bold tabular-nums">
							{events ? rangeEvents.length.toLocaleString() : "—"}
						</div>
						<p className="mt-1 font-mono text-xs text-zinc-400">
							Events captured
						</p>
					</div>
					<div className="border-hard bg-cyan-300 p-4">
						<div className="font-mono text-xs uppercase tracking-wider">
							Browsing stretches
						</div>
						<div className="mt-2 text-3xl font-bold tabular-nums">
							{rangeSessions.length.toLocaleString()}
						</div>
						<p className="mt-1 font-mono text-xs">
							{rangeSessions.length
								? `${formatDuration(activeTimeMs / rangeSessions.length)} average`
								: "No stretches yet"}
						</p>
					</div>
					<div className="border-hard bg-pink-300 p-4">
						<div className="font-mono text-xs uppercase tracking-wider">
							Sites explored
						</div>
						<div className="mt-2 text-3xl font-bold tabular-nums">
							{domainCount.toLocaleString()}
						</div>
						<p className="mt-1 font-mono text-xs">Different domains visited</p>
					</div>
				</div>
				<div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
					<div className="border-hard bg-zinc-100 p-4">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<h3 className="text-xl font-bold">When browser got busy</h3>
								<p className="mt-1 font-mono text-xs text-muted-foreground">
									Peaks show more browser activity.
								</p>
							</div>
							{busiestMoment && (
								<span className="border-hard bg-white px-2 py-1 font-mono text-xs">
									Busiest: {busiestMoment.label}
								</span>
							)}
						</div>
						<div className="mt-4">
							{charts && activityData.length ? (
								<charts.ActivityChart data={activityData} height={250} />
							) : (
								<Empty text="No activity yet." />
							)}
						</div>
					</div>
					<div className="border-hard bg-yellow-200 p-4">
						<h3 className="text-xl font-bold">Browsing stretches</h3>
						<p className="mt-1 font-mono text-xs">
							Tab changes and hands-on activity.
						</p>
						<div className="mt-4">
							{charts && focusData.length ? (
								<charts.FocusChart data={focusData} height={250} />
							) : (
								<Empty text="Browse for a while to compare stretches." />
							)}
						</div>
					</div>
				</div>
			</section>

			<section aria-labelledby="activity-heading" className="mt-10">
				<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2
							id="activity-heading"
							className="text-3xl font-bold tracking-tight"
						>
							Recent activity
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Latest browsing stretches and grouped contexts.
						</p>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link to="/activities">Load more activity</Link>
					</Button>
				</div>
				<ActivityList sessions={recentSessions} contexts={recentContexts} />
			</section>

			<section aria-labelledby="memories-heading" className="mt-10">
				<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2
							id="memories-heading"
							className="text-3xl font-bold tracking-tight"
						>
							Recent memories
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Recurring browser patterns, backed by your recorded activity.
						</p>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link to="/memories">Load more memories</Link>
					</Button>
				</div>
				<MemoryList memories={recentMemories} />
			</section>
		</DashboardShell>
	);
};

export const Route = createFileRoute("/dashboard")({
	head: () => ({
		meta: [
			{ title: "Dashboard | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Dashboard,
});
