import { useEffect, useState } from "react";

// ponytail: single source of truth for brand tokens — matches PRODUCTS.md
const theme = {
	lime: "#BFFF00",
	black: "#000000",
	white: "#ffffff",
	border: "2px solid #000000",
	shadow: "4px 4px 0px #000000",
	shadowSm: "2px 2px 0px #000000",
	font: "'IBM Plex Sans', sans-serif",
	mono: "'IBM Plex Mono', monospace",
} as const;

const IndexPopup = () => {
	const [stats, setStats] = useState({
		totalEvents: 0,
		tabCreated: 0,
		tabActivated: 0,
		tabUpdated: 0,
		tabRemoved: 0,
		eventsProcessed: 0,
		lastProcessedAt: 0,
	});

	useEffect(() => {
		chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
			if (response) setStats(response);
		});
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
				width: 320,
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

			<button
				type="button"
				onClick={() => {
					chrome.runtime.sendMessage({
						type: "GENERATE_TEST_EVENTS",
						count: 10000,
					});
				}}
				style={{
					width: "100%",
					padding: "10px 16px",
					background: theme.black,
					color: theme.lime,
					border: theme.border,
					fontFamily: theme.font,
					fontWeight: 700,
					fontSize: 13,
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					cursor: "pointer",
				}}
			>
				Generate Test Events
			</button>
		</div>
	);
};

export default IndexPopup;
