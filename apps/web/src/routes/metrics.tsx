import {
	createEmptyStats,
	DEFAULT_CAPACITY,
	type StatsSnapshot,
	type StoredTabEvent,
} from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	buildExportCsv,
	buildExportJsonl,
	derive,
	downloadFile,
	fetchCounts,
	fetchEvents,
	fetchStats,
	formatAgo,
	formatDuration,
} from "~/lib/metrics-data";

const BREAKDOWN: Array<{ key: keyof StatsSnapshot; label: string }> = [
	{ key: "tabCreated", label: "TAB_CREATED" },
	{ key: "tabActivated", label: "TAB_ACTIVATED" },
	{ key: "tabUpdated", label: "TAB_UPDATED" },
	{ key: "tabRemoved", label: "TAB_REMOVED" },
	{ key: "navigation", label: "NAVIGATION" },
	{ key: "pageVisible", label: "PAGE_VISIBLE" },
	{ key: "pageHidden", label: "PAGE_HIDDEN" },
	{ key: "scroll", label: "SCROLL" },
	{ key: "click", label: "CLICK" },
	{ key: "keyActivity", label: "KEY_ACTIVITY" },
];

const TAB = {
	PIPELINE: "pipeline",
	SESSIONS: "sessions",
	CONTEXTS: "contexts",
	MEMORIES: "memories",
	LIVE: "live",
	EXPORT: "export",
} as const;
type Tab = (typeof TAB)[keyof typeof TAB];

const Panel = ({
	title,
	children,
	className = "",
}: {
	title: string;
	children: React.ReactNode;
	className?: string;
}) => (
	<div className={`border-hard shadow-hard-sm p-4 ${className}`}>
		<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
			{title}
		</div>
		{children}
	</div>
);

const Empty = ({ text }: { text: string }) => (
	<div className="font-mono text-xs text-muted-foreground py-6 text-center">
		{text}
	</div>
);

const TabBar = ({
	active,
	onChange,
}: {
	active: Tab;
	onChange: (t: Tab) => void;
}) => (
	<div className="flex flex-wrap gap-2 mb-6">
		{(Object.values(TAB) as Tab[]).map((t) => (
			<button
				key={t}
				type="button"
				onClick={() => onChange(t)}
				className={`font-mono text-xs uppercase tracking-wider border-2 px-3 py-1.5 ${
					active === t
						? "bg-lime text-black border-black"
						: "bg-white text-black border-black hover:bg-lime/20"
				}`}
			>
				{t}
			</button>
		))}
	</div>
);

const Metrics = () => {
	const [tab, setTab] = useState<Tab>(TAB.PIPELINE);
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [dexieCount, setDexieCount] = useState<number | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
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
			const n = await fetchCounts();
			if (alive && n !== null) setDexieCount(n);
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
	const s = stats ?? createEmptyStats(DEFAULT_CAPACITY);
	const derived = useMemo(() => (events ? derive(events) : null), [events]);
	const lastSessions = derived?.sessions.slice(-10).reverse() ?? [];
	const lastContexts = derived?.contexts.slice(-10).reverse() ?? [];
	const lastMemories = derived?.memories ?? [];

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
					<img src="/logo.png" alt="Tabot" className="h-16 w-16 border-hard" />
					<div>
						<h1 className="text-3xl font-bold tracking-tight">Tabot</h1>
						<p className="font-mono text-sm text-muted-foreground">
							Browser Activity Pipeline
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

				{tab === TAB.PIPELINE && (
					<>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Events
								</div>
								<div className="font-bold text-2xl">
									{s.totalEvents.toLocaleString()}
								</div>
							</div>
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Processed
								</div>
								<div className="font-bold text-2xl">
									{s.eventsProcessed.toLocaleString()}
								</div>
							</div>
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Dropped
								</div>
								<div className="font-bold text-2xl">
									{s.droppedEvents.toLocaleString()}
								</div>
							</div>
							<div className="border-hard shadow-hard-sm p-4">
								<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
									Dexie (IndexedDB)
								</div>
								<div className="font-bold text-2xl">
									{dexieCount === null ? "—" : dexieCount.toLocaleString()}
								</div>
							</div>
						</div>

						<Panel title="Breakdown">
							<div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono text-xs">
								{BREAKDOWN.map((r) => (
									<div
										key={r.key}
										className="border-hard bg-zinc-50 px-2 py-2 flex flex-col"
									>
										<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
											{r.label}
										</span>
										<span className="font-bold text-sm">
											{(s[r.key] as number).toLocaleString()}
										</span>
									</div>
								))}
							</div>
							<div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
								<span>
									Occupancy:{" "}
									<span className="font-bold text-black">
										{s.bufferOccupancy}/{s.bufferCapacity}
									</span>
								</span>
								<span>
									Peak:{" "}
									<span className="font-bold text-black">
										{s.peakBufferOccupancy.toLocaleString()}
									</span>
								</span>
								<span>
									Last event:{" "}
									<span className="font-bold text-black">
										{formatAgo(s.lastProcessedAt)}
									</span>
								</span>
							</div>
						</Panel>

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

				{tab === TAB.SESSIONS && (
					<Panel title={`Sessions (${derived?.sessions.length ?? 0})`}>
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
												{new Date(sess.startTimestamp).toLocaleString()}
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
				)}

				{tab === TAB.CONTEXTS && (
					<Panel title={`Contexts (${derived?.contexts.length ?? 0})`}>
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
												{new Date(c.startTimestamp).toLocaleString()}
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
												stale{" "}
												{formatAgo(m.staleness ? Date.now() - m.staleness : 0)}
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

				{tab === TAB.LIVE && (
					<Panel title="Live Context">
						{!derived?.live ? (
							<Empty text="No live context yet — need events." />
						) : (
							<div className="space-y-4">
								<div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
									<span>
										Active tab:{" "}
										<span className="font-bold">
											{derived.live.activeTabId}
										</span>
									</span>
									<span>
										Window:{" "}
										<span className="font-bold">
											{derived.live.activeWindowId}
										</span>
									</span>
									<span>
										Intensity:{" "}
										<span className="font-bold">
											{derived.live.interactionIntensity.toFixed(1)}/min
										</span>
									</span>
								</div>
								{derived.live.currentUrl && (
									<div className="font-mono text-xs break-all">
										<span className="text-muted-foreground">Current URL: </span>
										<span className="font-bold">{derived.live.currentUrl}</span>
									</div>
								)}
								{derived.live.recentNavigations.length > 0 && (
									<div>
										<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
											Recent navigations
										</div>
										<div className="space-y-1 font-mono text-xs">
											{derived.live.recentNavigations.map((u, i) => (
												<div
													// biome-ignore lint/suspicious/noArrayIndexKey: static append-only list, index is the stable key
													key={i}
													className="truncate text-muted-foreground"
												>
													{u}
												</div>
											))}
										</div>
									</div>
								)}
								{derived.live.relatedContexts.length > 0 && (
									<div>
										<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
											Related contexts
										</div>
										<div className="space-y-1 font-mono text-xs">
											{derived.live.relatedContexts.map((rc) => (
												<div
													key={rc.context.id}
													className="text-muted-foreground"
												>
													{rc.context.primaryDomain} —{" "}
													{Math.round(rc.similarity * 100)}% ·{" "}
													{rc.sharedDomains.join(", ")}
												</div>
											))}
										</div>
									</div>
								)}
								{derived.live.relatedMemories.length > 0 && (
									<div>
										<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
											Related memories
										</div>
										<div className="space-y-1 font-mono text-xs">
											{derived.live.relatedMemories.map((rm) => (
												<div
													key={rm.memory.id}
													className="text-muted-foreground"
												>
													{rm.memory.signature} —{" "}
													{Math.round(rm.similarity * 100)}%
												</div>
											))}
										</div>
									</div>
								)}
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

export const Route = createFileRoute("/metrics")({
	component: Metrics,
});
