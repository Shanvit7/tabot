import logo from "data-base64:~assets/icon.png";
import type { StatsSnapshot } from "@tabot/shared";
import { createEmptyStats } from "@tabot/shared";
import { useEffect, useState } from "react";

const theme = {
	lime: "#BFFF00",
	black: "#000000",
	white: "#FFFFFF",
	orange: "#FF6B2C",
	pink: "#FF8FD8",
	border: "2px solid #000000",
	shadow: "4px 4px 0px #000000",
	shadowSmall: "2px 2px 0px #000000",
	font: "'IBM Plex Sans', sans-serif",
	mono: "'IBM Plex Mono', monospace",
} as const;

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
	const [trackingEnabled, setTrackingEnabled] = useState(true);

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

	const formatTime = (ts: number) => {
		if (!ts) return "Waiting for your first moment";
		const diff = Math.round((Date.now() - ts) / 1000);
		if (diff < 2) return "Picking up your activity now";
		if (diff < 60) return `Last moment ${diff}s ago`;
		if (diff < 3600) return `Last moment ${Math.round(diff / 60)}m ago`;
		return `Last moment ${Math.round(diff / 3600)}h ago`;
	};

	const interactions = stats.click + stats.keyActivity + stats.scroll;
	const totalSaved = dexieCount ?? stats.totalEvents;
	const card: React.CSSProperties = {
		background: theme.white,
		border: theme.border,
		boxShadow: theme.shadowSmall,
		padding: "11px 12px",
	};
	const label: React.CSSProperties = {
		fontFamily: theme.mono,
		fontSize: 10,
		fontWeight: 700,
		letterSpacing: "0.07em",
		textTransform: "uppercase",
	};

	return (
		<div
			style={{
				width: 360,
				boxSizing: "border-box",
				padding: 14,
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
					justifyContent: "space-between",
					marginBottom: 15,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<img
						src={logo}
						alt="Tabot"
						style={{
							width: 38,
							height: 38,
							border: theme.border,
							background: theme.white,
							objectFit: "cover",
						}}
					/>
					<div>
						<div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1 }}>
							Tabot
						</div>
						<div style={{ fontFamily: theme.mono, fontSize: 11, marginTop: 4 }}>
							Thinking across tabs.
						</div>
					</div>
				</div>
				<button
					onClick={toggleTracking}
					type="button"
					aria-pressed={trackingEnabled}
					style={{
						background: trackingEnabled ? theme.black : theme.white,
						color: trackingEnabled ? theme.lime : theme.black,
						border: theme.border,
						boxShadow: theme.shadowSmall,
						cursor: "pointer",
						fontFamily: theme.mono,
						fontSize: 10,
						fontWeight: 700,
						padding: "5px 7px",
					}}
				>
					{trackingEnabled ? "PAUSE" : "RESUME"}
				</button>
			</div>

			<div
				style={{
					background: theme.black,
					color: theme.white,
					border: theme.border,
					boxShadow: theme.shadow,
					padding: "15px 16px 14px",
				}}
			>
				<div style={{ ...label, color: theme.lime }}>
					{trackingEnabled ? "Your browser, in motion" : "Tracking is paused"}
				</div>
				<div
					style={{ fontSize: 39, fontWeight: 800, lineHeight: 1, marginTop: 7 }}
				>
					{totalSaved.toLocaleString()}
				</div>
				<div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
					moments saved privately
				</div>
				<div style={{ color: theme.lime, fontSize: 11, marginTop: 13 }}>
					{trackingEnabled
						? formatTime(stats.lastProcessedAt)
						: "No new moments will be saved"}
				</div>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 8,
					marginTop: 13,
				}}
			>
				<div style={card}>
					<div style={label}>New pages</div>
					<div
						style={{
							fontSize: 25,
							fontWeight: 800,
							lineHeight: 1.1,
							marginTop: 5,
						}}
					>
						{stats.tabCreated.toLocaleString()}
					</div>
					<div style={{ fontSize: 11, marginTop: 4 }}>you opened</div>
				</div>
				<div style={card}>
					<div style={label}>Tab changes</div>
					<div
						style={{
							fontSize: 25,
							fontWeight: 800,
							lineHeight: 1.1,
							marginTop: 5,
						}}
					>
						{stats.tabActivated.toLocaleString()}
					</div>
					<div style={{ fontSize: 11, marginTop: 4 }}>along way</div>
				</div>
				<div
					style={{
						...card,
						gridColumn: "1 / -1",
						background: theme.orange,
						display: "flex",
						alignItems: "baseline",
						gap: 8,
					}}
				>
					<span style={{ fontSize: 26, fontWeight: 800 }}>
						{interactions.toLocaleString()}
					</span>
					<span style={{ fontSize: 12, fontWeight: 700 }}>
						ways you interacted with pages
					</span>
				</div>
			</div>

			<div
				style={{
					marginTop: 13,
					border: theme.border,
					background: stats.droppedEvents > 0 ? theme.pink : theme.white,
					padding: "8px 10px",
					fontSize: 11,
					lineHeight: 1.35,
				}}
			>
				{stats.droppedEvents > 0
					? `A few moments could not be saved (${stats.droppedEvents.toLocaleString()}).`
					: "Everything stays on this device. Nothing is sent anywhere."}
			</div>
		</div>
	);
};

export default IndexPopup;
