import type { StatsSnapshot, StoredTabEvent } from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Empty,
	Loading,
	Panel,
	TabBar,
} from "~/components/ui/dashboard-panels";
import type { HourBucket } from "~/lib/dashboard-charts";
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
	rangeStart,
} from "~/lib/dashboard-data";
import { TAB, type Tab } from "~/lib/dashboard-tabs";
import type { CliTarget, WebTarget } from "~/lib/share-targets";

// Lazy-loaded modules (charts + share icons) — types only, no runtime import.
type ChartsApi = typeof import("~/lib/dashboard-charts");
type ShareTargets = typeof import("~/lib/share-targets");

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

// Export-period quick presets — today first, all time before custom (last).
const EXPORT_PRESETS = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "Last 7 days" },
	{ id: "30d", label: "Last 30 days" },
	{ id: "all", label: "All time" },
	{ id: "custom", label: "Custom" },
] as const;
type ExportPresetId = (typeof EXPORT_PRESETS)[number]["id"];

// ─── Chat-about-your-data targets (lazy: ~/lib/share-targets) ───

const MAX_CHAT_CHARS = 300_000;

// ─── Module-scope pure helpers (defined once, not per render) ───

// Filenames both Download flows share.
const exportFilename = (ext: string) =>
	`tabot-export-${new Date().toISOString().slice(0, 10)}.${ext}`;

const copyText = async (text: string): Promise<boolean> => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// Non-secure context (LAN/mobile) — fall back to a temp textarea.
		try {
			const el = document.createElement("textarea");
			el.value = text;
			el.style.position = "fixed";
			el.style.opacity = "0";
			document.body.appendChild(el);
			el.select();
			document.execCommand("copy");
			document.body.removeChild(el);
			return true;
		} catch {
			return false;
		}
	}
};

// ─── Tab navigation ───

// ─── Route component ───

const Dashboard = () => {
	const [tab, setTab] = useState<Tab>(TAB.OVERVIEW);
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
	const [range, setRange] = useState<RangeId>("today");
	const [exporting, setExporting] = useState(false);
	// Chat-about-your-data feedback line
	const [copiedTo, setCopiedTo] = useState<string | null>(null);
	// Export period filter: from/to as "YYYY-MM-DD" (inclusive); empty = unbounded.
	const [expFrom, setExpFrom] = useState("");
	const [expTo, setExpTo] = useState("");
	const [expPreset, setExpPreset] = useState<ExportPresetId>("all");
	// First stats/events attempt hasn't finished yet — cover the shell instead of
	// flashing "No extension" + empty cards. Gates on attempt completion, not
	// data: with no extension the fetches resolve null and stay null forever.
	const [initialized, setInitialized] = useState(false);

	// Heavy modules, lazy-loaded off the critical path:
	const [charts, setCharts] = useState<ChartsApi | null>(null);
	const [targets, setTargets] = useState<ShareTargets | null>(null);

	useEffect(() => {
		let alive = true;
		import("~/lib/dashboard-charts")
			.then((m) => {
				if (alive) setCharts(m);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	// Icons only needed on the Share Context tab — load on first open.
	useEffect(() => {
		if (tab !== TAB.SHARE_CONTEXT || targets) return;
		let alive = true;
		import("~/lib/share-targets")
			.then((m) => {
				if (alive) setTargets(m);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [tab, targets]);

	useEffect(() => {
		let alive = true;
		let firstDone = false;
		const markFirst = () => {
			if (firstDone) return;
			firstDone = true;
			if (alive) setInitialized(true);
		};

		const pollStats = async () => {
			const s = await fetchStats();
			if (!alive) return;
			if (s) setStats(s);
			markFirst();
		};
		const pollEvents = async () => {
			const ev = await fetchEvents();
			if (alive && ev && ev.length > 0) setEvents(ev);
			markFirst();
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
		() => (charts && events ? charts.buildActivityBuckets(events, range) : []),
		[charts, events, range],
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
		() => (charts && events ? charts.buildTopSites(events, range) : []),
		[charts, events, range],
	);
	const eventMix = useMemo(
		() => (charts && events ? charts.buildEventMix(events, range) : []),
		[charts, events, range],
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
		() => (charts ? charts.buildFocusMap(rangeSessions) : []),
		[charts, rangeSessions],
	);

	// Filenames both Download flows share.
	const handleDownload = (format: "jsonl" | "csv") => {
		if (!derived || !exportData) return;
		setExporting(true);
		if (format === "jsonl") {
			downloadFile(
				exportFilename("jsonl"),
				buildExportJsonl(derived),
				"application/x-ndjson",
			);
		} else {
			downloadFile(
				exportFilename("csv"),
				buildExportCsv(derived),
				"text/csv;charset=utf-8",
			);
		}
		setTimeout(() => setExporting(false), 800);
	};

	// Same canonical JSONL the Download button emits, from the selected period —
	// chat works off the selection directly, no file upload.
	const chatBody = useMemo(() => {
		if (!exportData) return null;
		let body = buildExportJsonl(exportData);
		if (body.length > MAX_CHAT_CHARS) {
			body = `${body.slice(0, MAX_CHAT_CHARS)}…\n[truncated ${(body.length - MAX_CHAT_CHARS).toLocaleString()} chars]`;
		}
		return body;
	}, [exportData]);

	const openAiChat = async (t: WebTarget) => {
		if (!chatBody || !exportData) return;
		// Gemini has no chat prefill — alert user, copy prompt, only open on OK.
		if (t.name === "Gemini") {
			const copied = await copyText(t.prompt);
			const ok = window.confirm(
				copied
					? "Gemini has no chat prefill. Prompt copied to clipboard — paste it in the chat box after Gemini opens."
					: `Gemini has no chat prefill. Copy this prompt yourself:\n\n${t.prompt.slice(0, 200)}…`,
			);
			if (!ok) return;
			window.open(t.url, "_blank", "noopener");
			return;
		}
		window.open(t.url, "_blank", "noopener");
		setCopiedTo(`${t.name} opened — prompt pre-filled in the chat box`);
		setTimeout(() => setCopiedTo(null), 3500);
	};

	const copyCli = async (t: CliTarget) => {
		const copied = await copyText(t.cmd);
		setCopiedTo(
			copied
				? `${t.name} command copied — paste into your terminal`
				: `${t.name} — copy this command:\n${t.cmd.slice(0, 120)}…`,
		);
		setTimeout(() => setCopiedTo(null), 3500);
	};

	// First stats/events attempt hasn't finished yet — cover the shell instead of
	// flashing "No extension" + empty cards while the fetch resolves.
	if (!initialized) return <Loading />;

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
								{charts && activityData.length > 0 ? (
									<charts.ActivityChart data={activityData} height={250} />
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
								{charts && focusData.length > 0 ? (
									<charts.FocusChart data={focusData} height={250} />
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
								{charts && eventMix.length > 0 ? (
									<div className="grid grid-cols-[140px_1fr] items-center gap-3 sm:grid-cols-[180px_1fr]">
										<charts.EventMixChart
											data={eventMix.slice(0, 5)}
											height={180}
										/>
										<div className="space-y-2">
											{eventMix.slice(0, 5).map((item, index) => (
												<div
													key={item.label}
													className="flex items-center gap-2 font-mono text-xs"
												>
													<span
														className={`h-3 w-3 border-hard ${charts.NEON_BG[index]}`}
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
								{charts && siteData.length > 0 ? (
									<charts.SitesChart
										data={siteData}
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
												<span className="min-w-0 wrap-break-word font-bold text-sm">
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
											<div className="mt-1 break-all text-muted-foreground">
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
												<span className="min-w-0 wrap-break-word font-bold text-sm">
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
											<div className="mt-1 break-all text-muted-foreground">
												{c.domains
													.map((d) => `${d.domain} (${d.sessionCount})`)
													.join(" · ")}
											</div>
											{c.episodes && c.episodes.length > 0 && (
												<div className="mt-1 break-all text-violet-700">
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
												<div className="mt-1 break-all text-emerald-700">
													<span className="font-semibold">seq:</span>{" "}
													{c.sequence
														.map((s) => s.split("://")[1] ?? s)
														.join(" → ")}
												</div>
											)}
											{c.mergeEvidence && c.mergeEvidence.length > 0 && (
												<div className="mt-1 break-all text-amber-700">
													<span className="font-semibold">evidence:</span>{" "}
													{c.mergeEvidence.join(", ")}
												</div>
											)}
											{c.excursions && c.excursions.length > 0 && (
												<div className="mt-1 break-all text-sky-700">
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
											<span className="min-w-0 wrap-break-word font-bold text-sm">
												{m.signature}
											</span>
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
											<div className="mt-1 break-all text-emerald-700">
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

				{tab === TAB.SHARE_CONTEXT && (
					<Panel title="Share Context">
						{!derived ? (
							<Empty text="No data to export yet — connect the extension and browse." />
						) : (
							<div className="space-y-4">
								{/* 1 of 3 — pick the period, then chat or download */}
								<div className="border-2 border-black bg-white p-4 space-y-3">
									<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
										1 · Pick the period
									</div>
									<div className="flex flex-wrap gap-2">
										{EXPORT_PRESETS.map((p) => (
											<button
												key={p.id}
												type="button"
												onClick={() => {
													setExpPreset(p.id);
													if (p.id === "today") {
														setExpFrom(fmtLocalDay(new Date()));
														setExpTo("");
													} else if (p.id === "all") {
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
										{exportCounts.memories.toLocaleString()} memories in
										selection
									</div>
								</div>

								{/* 2 of 3 — chat, first-class, works off the selection */}
								<div className="border-2 border-black bg-yellow-200 p-4 space-y-3">
									<div className="font-mono text-xs uppercase tracking-wider">
										2 · Chat about your data
									</div>
									<p className="font-mono text-xs text-muted-foreground">
										From your selection above. Web opens a prefilled chat.
										CLI/apps copy a command or prompt.
									</p>
									<div className="space-y-2 border-2 border-black bg-white p-3">
										<div className="flex items-center justify-between gap-2">
											<div className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
												Web
											</div>
											<span className="font-mono text-[10px] text-muted-foreground">
												{chatBody ? (chatBody.length / 1024).toFixed(0) : 0} KB
												to clipboard
											</span>
										</div>
										{targets ? (
											<div className="flex flex-wrap gap-2">
												{targets.WEB_TARGETS.map((t) => (
													<button
														key={t.name}
														type="button"
														disabled={!chatBody}
														onClick={() => openAiChat(t)}
														className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-lime/20 disabled:pointer-events-none disabled:opacity-40"
													>
														<t.icon size={16} />
														{t.name}
													</button>
												))}
											</div>
										) : (
											<div className="font-mono text-xs text-muted-foreground">
												Loading targets…
											</div>
										)}
									</div>
									<div className="space-y-2 border-2 border-black bg-white p-3">
										<div className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
											CLI & apps
										</div>
										{targets && (
											<div className="flex flex-wrap gap-2">
												{targets.CLI_TARGETS.map((t) => (
													<button
														key={t.name}
														type="button"
														disabled={!chatBody}
														onClick={() => copyCli(t)}
														className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-lime/20 disabled:pointer-events-none disabled:opacity-40"
													>
														<t.icon size={16} />
														{t.name}
													</button>
												))}
											</div>
										)}
									</div>
									{copiedTo && (
										<div className="font-mono text-xs font-bold">
											{copiedTo}
										</div>
									)}
									{/* 3 of 3 — download the selection */}
									<div className="border-2 border-black bg-white p-4 space-y-3">
										<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
											3 · Download the selection
										</div>
										<Button
											className="w-full"
											variant="secondary"
											disabled={exporting}
											onClick={() => handleDownload("jsonl")}
										>
											{exporting
												? "Downloading…"
												: "Download JSONL (recommended for LLMs)"}
										</Button>
										<Button
											className="w-full"
											variant="outline"
											disabled={exporting}
											onClick={() => handleDownload("csv")}
										>
											Download CSV
										</Button>
										<div className="font-mono text-xs text-muted-foreground">
											JSONL recommended for LLMs — canonical, self-describing
											events + sessions + contexts + memories. CSV is a flat
											session summary. All local — nothing leaves your machine.
										</div>
									</div>
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
