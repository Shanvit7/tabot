import type { StatsSnapshot } from "@tabot/shared";
import { createEmptyStats } from "@tabot/shared";
import { useEffect, useState } from "react";

const theme = {
	lime: "#BFFF00",
	black: "#000000",
	white: "#ffffff",
	border: "2px solid #000000",
	shadow: "4px 4px 0px #000000",
	font: "'IBM Plex Sans', sans-serif",
	mono: "'IBM Plex Mono', monospace",
} as const;

const ROWS: Array<{ key: keyof StatsSnapshot; label: string }> = [
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

const fetchStatsHelper = (
	setStats: React.Dispatch<React.SetStateAction<StatsSnapshot>>,
	setDexieCount: React.Dispatch<React.SetStateAction<number | null>>,
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

const IndexPopup = () => {
	const [stats, setStats] = useState<StatsSnapshot>(() =>
		createEmptyStats(10_000),
	);
	const [dexieCount, setDexieCount] = useState<number | null>(null);

	useEffect(() => {
		const run = () => fetchStatsHelper(setStats, setDexieCount);
		run();
		const id = setInterval(run, 1000);
		return () => clearInterval(id);
	}, []);

	const formatTime = (ts: number) => {
		if (!ts) return "never";
		const diff = Math.round((Date.now() - ts) / 1000);
		if (diff < 2) return "just now";
		if (diff < 60) return `${diff}s ago`;
		return `${Math.round(diff / 60)}m ago`;
	};

	const card: React.CSSProperties = {
		background: theme.white,
		border: theme.border,
		boxShadow: theme.shadow,
		padding: 12,
		marginBottom: 12,
	};

	const label: React.CSSProperties = {
		fontFamily: theme.mono,
		fontSize: 11,
		textTransform: "uppercase",
		letterSpacing: "0.05em",
		color: "#666",
	};

	return (
		<div
			style={{
				width: 360,
				padding: 16,
				fontFamily: theme.font,
				background: theme.lime,
				color: theme.black,
				border: theme.border,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					marginBottom: 16,
				}}
			>
				<img
					src={chrome.runtime.getURL("icon.png")}
					alt="Tabot"
					style={{ width: 40, height: 40, border: theme.border }}
				/>
				<h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Tabot</h1>
			</div>

			<div style={card}>
				<div style={label}>Events captured</div>
				<div style={{ fontSize: 24, fontWeight: 700 }}>
					{stats.totalEvents.toLocaleString()}
				</div>
			</div>

			<div style={card}>
				<div style={label}>Events processed</div>
				<div style={{ fontSize: 24, fontWeight: 700 }}>
					{stats.eventsProcessed.toLocaleString()}
				</div>
			</div>

			<div style={card}>
				<div style={label}>Worker status</div>
				<div
					style={{
						fontSize: 16,
						fontWeight: 700,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<span
						style={{
							width: 10,
							height: 10,
							background: theme.lime,
							border: theme.border,
							display: "inline-block",
						}}
					/>
					Running
				</div>
			</div>

			<div style={card}>
				<div style={label}>Last event</div>
				<div style={{ fontSize: 16, fontWeight: 700 }}>
					{formatTime(stats.lastProcessedAt)}
				</div>
			</div>

			<div style={{ ...card, padding: 10 }}>
				<div style={label}>Breakdown</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: "4px 12px",
						marginTop: 8,
						fontFamily: theme.mono,
						fontSize: 11,
					}}
				>
					{ROWS.map((r) => (
						<div
							key={r.key}
							style={{
								display: "flex",
								justifyContent: "space-between",
								gap: 8,
							}}
						>
							<span style={{ color: "#333" }}>{r.label}</span>
							<span style={{ fontWeight: 700 }}>
								{(stats[r.key] as number).toLocaleString()}
							</span>
						</div>
					))}
				</div>
			</div>

			<div
				style={{
					...card,
					display: "grid",
					gridTemplateColumns: "1fr 1fr 1fr",
					gap: 8,
					textAlign: "center",
				}}
			>
				<div>
					<div style={label}>Dropped</div>
					<div style={{ fontWeight: 700, fontSize: 16 }}>
						{stats.droppedEvents.toLocaleString()}
					</div>
				</div>
				<div>
					<div style={label}>Occupancy</div>
					<div style={{ fontWeight: 700, fontSize: 16 }}>
						{stats.bufferOccupancy}/{stats.bufferCapacity}
					</div>
				</div>
				<div>
					<div style={label}>Peak</div>
					<div style={{ fontWeight: 700, fontSize: 16 }}>
						{stats.peakBufferOccupancy.toLocaleString()}
					</div>
				</div>
				{dexieCount !== null && (
					<div
						style={{
							gridColumn: "1 / -1",
							marginTop: 4,
							fontFamily: theme.mono,
							fontSize: 11,
							color: "#333",
						}}
					>
						Dexie (IndexedDB) persisted:{" "}
						<span style={{ fontWeight: 700 }}>
							{dexieCount.toLocaleString()}
						</span>
					</div>
				)}
			</div>
		</div>
	);
};

export default IndexPopup;
