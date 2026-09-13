import logo from "data-base64:~assets/icon.png";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
// Deep component imports: the per-brand index re-exports Avatar/Combine which pull
// features/ → @lobehub/ui → vfile (not resolvable by Parcel). Mono/Color are pure SVG.
import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color";
import CodexColor from "@lobehub/icons/es/Codex/components/Color";
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import GeminiCLIColor from "@lobehub/icons/es/GeminiCLI/components/Color";
import GrokMono from "@lobehub/icons/es/Grok/components/Mono";
import OllamaMono from "@lobehub/icons/es/Ollama/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import {
	buildExportJsonl,
	CLI_TARGET_DEFS,
	createEmptyStats,
	derive,
	type StatsSnapshot,
	type StoredTabEvent,
	WEB_TARGET_DEFS,
} from "@tabot/shared";
import type { ComponentType, Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import "./popup.tailwind.css";

const fetchStatsHelper = (
	setStats: Dispatch<SetStateAction<StatsSnapshot>>,
	setDexieCount: Dispatch<SetStateAction<number | null>>,
) => {
	chrome.runtime.sendMessage(
		{ type: "GET_STATS" },
		(response: StatsSnapshot | undefined) => {
			if (response) setStats(response);
		},
	);
	chrome.runtime.sendMessage(
		{ type: "GET_COUNTS" },
		(res: { dexieCount?: number; rxdbCount?: number } | undefined) => {
			const n = res?.dexieCount ?? res?.rxdbCount;
			if (typeof n === "number") setDexieCount(n);
		},
	);
};

const DASHBOARD_URL =
	process.env.PLASMO_PUBLIC_DASHBOARD_URL ??
	"https://shanvit7.github.io/tabot/dashboard";

// Same cap as the dashboard's Share Context chat body.
const MAX_CHAT_CHARS = 300_000;

// Dashboard-identical share targets — defs from @tabot/shared, icons attached
// here so the popup renders the same icon buttons as the web app.
const WEB_ICONS: Record<string, ComponentType<{ size?: number }>> = {
	ChatGPT: OpenAIMono,
	Grok: GrokMono,
	Claude: ClaudeColor,
	DeepSeek: DeepSeekColor,
	Gemini: GeminiColor,
};
const CLI_ICONS: Record<string, ComponentType<{ size?: number }>> = {
	"Claude Code": ClaudeCodeColor,
	Codex: CodexColor,
	"Gemini CLI": GeminiCLIColor,
	Ollama: OllamaMono,
};

interface ShareTarget {
	name: string;
	icon: ComponentType<{ size?: number }>;
}
interface WebButton extends ShareTarget {
	url: string;
	prompt: string;
}
interface CliButton extends ShareTarget {
	cmd: string;
}

const webTargets: WebButton[] = WEB_TARGET_DEFS.map((t) => ({
	...t,
	icon: WEB_ICONS[t.name],
}));
const cliTargets: CliButton[] = CLI_TARGET_DEFS.map((t) => ({
	...t,
	icon: CLI_ICONS[t.name],
}));

const TargetButton = ({
	label,
	Icon,
	onClick,
	disabled,
	className = "",
}: {
	label: string;
	Icon: ComponentType<{ size?: number }>;
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}) => (
	<button
		type="button"
		disabled={disabled}
		onClick={onClick}
		className={`share-btn ${className}`}
	>
		<Icon size={14} />
		{label}
	</button>
);

// Export period presets — Today is the default: share keeps to the current day.
const PERIODS = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "Last 7 days" },
	{ id: "all", label: "All time" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

// Is ts inside the selected period? Today = local calendar day.
const inPeriod = (ts: number, period: PeriodId): boolean => {
	if (period === "all") return true;
	const d = new Date(ts);
	if (period === "7d") return ts >= Date.now() - 7 * 86_400_000;
	const now = new Date();
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	);
};

// Trigger a browser download of today's/period's events as a JSONL file.
const downloadTextFile = (name: string, content: string) => {
	const url = URL.createObjectURL(
		new Blob([content], { type: "application/jsonl" }),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const exportFilename = (ext: string) =>
	`tabot-export-${new Date().toISOString().slice(0, 10)}.${ext}`;

// ─── Download checkpoint ───
// Content-hash of the last downloaded export, kept in localStorage (extension
// origin — survives popup close, no manifest change). Same hash → same file
// already downloaded → skip the repeat download, reuse the saved filename.
const CHECKPOINT_KEY = "tabot-last-download";
interface DownloadCheckpoint {
	hash: string;
	file: string;
}

// Two-lane 32-bit FNV-1a → 64-bit-ish equality hash (not crypto). Math.imul
// keeps the multiply on proper 32-bit overflow — plain JS `*` loses low bits.
const fnv1a32 = (str: string, seed: number): number => {
	let h = seed;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h;
};
const hashBody = (body: string): string =>
	`${fnv1a32(body, 0x811c9dc5).toString(16).padStart(8, "0")}${fnv1a32(
		body,
		0x01000193,
	)
		.toString(16)
		.padStart(8, "0")}`;

const readCheckpoint = (): DownloadCheckpoint | null => {
	try {
		const raw = localStorage.getItem(CHECKPOINT_KEY);
		return raw ? (JSON.parse(raw) as DownloadCheckpoint) : null;
	} catch {
		return null;
	}
};
const writeCheckpoint = (cp: DownloadCheckpoint) => {
	try {
		localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
	} catch {
		// Storage unavailable — just re-download next time, never skip incorrectly.
	}
};

const copyText = async (text: string): Promise<boolean> => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand("copy");
		ta.remove();
		return ok;
	}
};

const formatDuration = (ms: number): string => {
	if (!ms || ms < 0) return "0s";
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
};

const IndexPopup = () => {
	const [stats, setStats] = useState<StatsSnapshot>(() =>
		createEmptyStats(10_000),
	);
	const [dexieCount, setDexieCount] = useState<number | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[]>([]);
	const [trackingEnabled, setTrackingEnabled] = useState(true);
	const [sharing, setSharing] = useState(false);
	const [shareStatus, setShareStatus] = useState<string | null>(null);
	const [period, setPeriod] = useState<PeriodId>("today");
	const [pendingTarget, setPendingTarget] = useState<{
		name: string;
		file: string;
	} | null>(null);

	// Stats refresh fast (lastProcessedAt, droppedEvents stay live); derived
	// layers (sessions / contexts / top site) refresh slower like the dashboard.
	useEffect(() => {
		chrome.runtime.sendMessage(
			{ type: "GET_TRACKING" },
			(response: { enabled?: boolean } | undefined) => {
				if (typeof response?.enabled === "boolean")
					setTrackingEnabled(response.enabled);
			},
		);
		const run = () => fetchStatsHelper(setStats, setDexieCount);
		run();
		const id = setInterval(run, 1000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		const pollEvents = () =>
			chrome.runtime.sendMessage(
				{ type: "GET_EVENTS" },
				(res: StoredTabEvent[] | undefined) => {
					if (Array.isArray(res)) setEvents(res);
				},
			);
		pollEvents();
		const id = setInterval(pollEvents, 5000);
		return () => clearInterval(id);
	}, []);

	const derived = useMemo(
		() => (events.length > 0 ? derive(events) : null),
		[events],
	);
	const currentCtx = derived?.live?.currentContext ?? null;
	const live = derived?.live ?? null;
	const stretches = derived?.sessions.length ?? 0;
	const domainsVisited = useMemo(() => {
		const set = new Set<string>();
		for (const sess of derived?.sessions ?? [])
			for (const d of sess.domains) set.add(d.domain);
		return set.size;
	}, [derived]);
	const topSite = useMemo(() => {
		const counts = new Map<string, number>();
		for (const sess of derived?.sessions ?? [])
			for (const d of sess.domains)
				counts.set(d.domain, (counts.get(d.domain) ?? 0) + d.eventCount);
		return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	}, [derived]);

	const openDashboard = () => {
		chrome.tabs.create({ url: DASHBOARD_URL });
	};

	const toggleTracking = () => {
		const enabled = !trackingEnabled;
		setTrackingEnabled(enabled);
		chrome.runtime.sendMessage(
			{ type: "SET_TRACKING", enabled },
			(response: { enabled?: boolean } | undefined) => {
				if (typeof response?.enabled === "boolean")
					setTrackingEnabled(response.enabled);
			},
		);
	};

	const shareContext = async (target: WebButton) => {
		if (sharing) return;
		setSharing(true);
		try {
			if (events.length === 0) {
				setShareStatus("Nothing to share yet — browse around first.");
				return;
			}
			const scoped = events.filter((e) => inPeriod(e.timestamp, period));
			if (scoped.length === 0) {
				setShareStatus(
					period === "today"
						? "Nothing from today yet — keep browsing, then share."
						: "Nothing in this period — pick a wider one.",
				);
				return;
			}
			let body = buildExportJsonl(derive(scoped));
			if (body.length > MAX_CHAT_CHARS) {
				body = `${body.slice(0, MAX_CHAT_CHARS)}…\n[truncated ${(
					body.length - MAX_CHAT_CHARS
				).toLocaleString()} chars]`;
			}
			const hash = hashBody(body);
			const saved = readCheckpoint();
			const alreadySaved = saved?.hash === hash;
			const file = exportFilename("jsonl");
			if (alreadySaved) {
				// Same content on disk — don't re-trigger the download.
				setPendingTarget({ name: target.name, file: saved.file });
				setShareStatus(
					`You already have ${saved.file} — nothing new since. Open ${target.name} and upload it.`,
				);
			} else {
				downloadTextFile(file, body);
				writeCheckpoint({ hash, file });
				// Label swap + hint: the download lands, user uploads it on the target UI.
				setPendingTarget({ name: target.name, file });
				setShareStatus(
					`Saved ${file} — open ${target.name} and drop the file in.`,
				);
			}
			window.open(target.url, "_blank", "noopener");
		} catch {
			setShareStatus("Couldn't load your activity — try again.");
		} finally {
			setSharing(false);
		}
	};

	const shareCli = async (target: CliButton) => {
		const copied = await copyText(target.cmd);
		setShareStatus(
			copied
				? `${target.name} command copied — paste into your terminal`
				: "Couldn't copy — use the dashboard's Share Context tab instead.",
		);
		setTimeout(() => setShareStatus(null), 4000);
	};

	const formatTime = (ts: number): string => {
		if (!ts) return "Waiting for your first moment";
		const diff = Math.round((Date.now() - ts) / 1000);
		if (diff < 2) return "Picking up your activity now";
		if (diff < 60) return `Last moment ${diff}s ago`;
		if (diff < 3600) return `Last moment ${Math.round(diff / 60)}m ago`;
		return `Last moment ${Math.round(diff / 3600)}h ago`;
	};

	const totalSaved = dexieCount ?? stats.totalEvents;
	const hasShareable = (derived?.events?.length ?? 0) > 0;
	const lastWeb = webTargets.length % 2 === 1 ? webTargets.length - 1 : -1;

	return (
		<div className="box-border w-115 border-2 border-ink bg-lime-brand p-3.5 font-sans-brand text-ink">
			{/* Header */}
			<div className="mb-3.25 flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<img
						src={logo}
						alt="Tabot"
						className="h-9.5 w-9.5 border-2 border-ink bg-white object-cover"
					/>
					<div>
						<div className="text-[20px] font-extrabold leading-none">Tabot</div>
						<div className="mt-1 font-mono-brand text-[11px]">
							Thinking across tabs.
						</div>
					</div>
				</div>
				<button
					onClick={toggleTracking}
					type="button"
					aria-pressed={trackingEnabled}
					className={`cursor-pointer border-2 border-ink px-1.75 py-1.25 font-mono-brand text-[10px] font-bold shadow-hard-sm ${
						trackingEnabled ? "bg-ink text-lime-brand" : "bg-white text-ink"
					}`}
				>
					{trackingEnabled ? "PAUSE" : "RESUME"}
				</button>
			</div>

			{!hasShareable && (
				<div className="card">
					<div className="label">Nothing to share</div>
					<div className="mt-1.25 text-[13px] text-ink/60">
						Browse around first — your moments appear here.
					</div>
				</div>
			)}

			{/* Share Context — the primary reason to open the popup */}
			{hasShareable && (
				<div className="border-2 border-ink bg-ink px-4 pb-3.5 pt-3.75 text-white shadow-hard">
					<div className="flex items-center justify-between">
						<div className="label text-lime-brand">Share your context</div>
						{shareStatus && (
							<div className="max-w-[55%] text-right text-[10px] leading-[1.3] text-white">
								{shareStatus}
							</div>
						)}
					</div>
					<p className="mt-1.25 text-[11px] leading-[1.4] text-white/80">
						Shares today's activity — pick a period, then download and drop the
						file into the AI you choose.
					</p>
					{/* Period selector — Today by default */}
					<div className="mt-2">
						<div className="label text-[9px] text-lime-brand">Period</div>
						<div className="mt-1.5 flex gap-1.5">
							{PERIODS.map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => setPeriod(p.id)}
									className={`cursor-pointer border-2 border-ink px-2 py-1 text-[10px] font-bold ${
										p.id === period
											? "bg-lime-brand text-ink"
											: "bg-white text-ink/70"
									}`}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>
					<div className="mt-2.5">
						<div className="label text-[9px] text-lime-brand">Web</div>
						<div className="mt-1.5 grid grid-cols-2 gap-1.5">
							{webTargets.map((t, i) => (
								<TargetButton
									key={t.name}
									label={
										pendingTarget?.name === t.name
											? `Upload on ${t.name} ↗`
											: t.name
									}
									Icon={t.icon}
									disabled={sharing}
									onClick={() => shareContext(t)}
									className={i === lastWeb ? "col-span-2" : ""}
								/>
							))}
						</div>
					</div>
					<div className="mt-2.5">
						<div className="label text-[9px] text-lime-brand">CLI & apps</div>
						<div className="mt-1.5 flex flex-wrap gap-1.5">
							{cliTargets.map((t) => (
								<button
									key={t.name}
									type="button"
									onClick={() => shareCli(t)}
									className="cli-btn"
								>
									<t.icon size={14} />
									{t.name}
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{/* Current focus — live context insight */}
			{hasShareable && (
				<div className="card mt-3.25">
					<div className="label">On now</div>
					{currentCtx ? (
						<>
							<div className="mt-1.25 break-all text-[19px] font-extrabold leading-[1.1]">
								{currentCtx.primaryDomain}
							</div>
							<div className="mt-1 text-[11px] font-bold">
								{formatDuration(currentCtx.duration)}
								{live && live.interactionIntensity > 0
									? ` · ${live.interactionIntensity.toFixed(1)} actions/min`
									: ""}
							</div>
						</>
					) : (
						<div className="mt-1.25 text-[13px] text-ink/60">
							Nothing on yet — browse around first.
						</div>
					)}
				</div>
			)}

			{/* Insight stats — derived, not raw counters */}
			{hasShareable && (
				<div className="mt-3.25 grid grid-cols-2 gap-2">
					<div className="card">
						<div className="label">Moments saved</div>
						<div className="mt-1 text-[26px] font-extrabold leading-none tabular-nums">
							{totalSaved.toLocaleString()}
						</div>
						<div className="mt-1 text-[11px]">
							{formatTime(stats.lastProcessedAt)}
						</div>
					</div>
					<div className="card">
						<div className="label">Browsing stretches</div>
						<div className="mt-1 text-[26px] font-extrabold leading-none tabular-nums">
							{stretches.toLocaleString()}
						</div>
						<div className="mt-1 text-[11px]">
							A stretch starts after you browse
						</div>
					</div>
					<div className="card">
						<div className="label">Sites visited</div>
						<div className="mt-1 text-[26px] font-extrabold leading-none tabular-nums">
							{domainsVisited.toLocaleString()}
						</div>
						<div className="mt-1 text-[11px]">Different places you went</div>
					</div>
					<div className="card col-span-2 flex items-center gap-2 bg-orange-brand">
						<span className="text-[18px] font-extrabold leading-none">
							{topSite ?? "—"}
						</span>
						<span className="text-[12px] font-bold">most visited</span>
					</div>
				</div>
			)}

			{stats.droppedEvents > 0 && (
				<div className="mt-3.25 border-2 border-ink bg-pink-brand px-2.5 py-2 text-[11px] leading-[1.35]">
					A few moments could not be saved (
					{stats.droppedEvents.toLocaleString()}).
				</div>
			)}

			{/* Footer */}
			<div className="mt-3.25 flex items-center justify-between">
				<button
					onClick={openDashboard}
					type="button"
					className="cursor-pointer border-2 border-ink bg-white px-2.5 py-1.75 font-mono-brand text-[11px] font-extrabold uppercase shadow-hard-sm"
				>
					Go to Dashboard →
				</button>
				<span className="text-[10px] leading-[1.3] text-ink/60">
					Everything stays on this device.
				</span>
			</div>
		</div>
	);
};

export default IndexPopup;
