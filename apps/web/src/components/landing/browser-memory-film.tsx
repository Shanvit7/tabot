import {
	Easing,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

const activities = [
	{ domain: "github.com", title: "tabot · event pipeline", color: "#a3e635" },
	{
		domain: "linear.app",
		title: "Instrument the worker queue",
		color: "#7dd3fc",
	},
	{ domain: "docs.google.com", title: "Architecture notes", color: "#fbbf24" },
];

export const BrowserMemoryFilm = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	return (
		<div
			style={{
				background: "#0c151f",
				color: "#eef2e9",
				display: "flex",
				flexDirection: "column",
				fontFamily: "IBM Plex Sans, sans-serif",
				height: "100%",
				overflow: "hidden",
				padding: 44,
				position: "relative",
				width: "100%",
			}}
		>
			<div
				style={{
					alignItems: "center",
					display: "flex",
					justifyContent: "space-between",
					marginBottom: 36,
				}}
			>
				<div style={{ alignItems: "center", display: "flex", gap: 14 }}>
					<div
						style={{
							background: "#a3e635",
							borderRadius: 99,
							height: 12,
							width: 12,
						}}
					/>
					<div
						style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.04em" }}
					>
						Tabot
					</div>
				</div>
				<div
					style={{
						background: "#182631",
						border: "1px solid #2b3c47",
						borderRadius: 999,
						color: "#a8bbc3",
						fontFamily: "IBM Plex Mono, monospace",
						fontSize: 13,
						letterSpacing: "0.08em",
						padding: "9px 13px",
					}}
				>
					LOCAL ONLY
				</div>
			</div>

			<div style={{ display: "flex", flex: 1, gap: 24, minHeight: 0 }}>
				<div
					style={{
						background: "#111e28",
						border: "1px solid #2b3c47",
						borderRadius: 18,
						flex: 1.2,
						padding: 24,
					}}
				>
					<div
						style={{
							color: "#a8bbc3",
							fontFamily: "IBM Plex Mono, monospace",
							fontSize: 14,
							letterSpacing: "0.08em",
							marginBottom: 20,
						}}
					>
						CURRENT THREAD
					</div>
					<div
						style={{
							fontSize: 28,
							fontWeight: 650,
							letterSpacing: "-0.045em",
							lineHeight: 1.06,
						}}
					>
						Building the event pipeline
					</div>
					<div
						style={{
							alignItems: "center",
							display: "flex",
							gap: 10,
							marginTop: 26,
						}}
					>
						<div
							style={{
								background: "#a3e635",
								borderRadius: 99,
								height: 9,
								width: 9,
							}}
						/>
						<div style={{ color: "#b7c8cf", fontSize: 16 }}>
							3 related tabs, one working session
						</div>
					</div>
					<div
						style={{ background: "#2b3c47", height: 1, margin: "30px 0 20px" }}
					/>
					<div style={{ color: "#a8bbc3", fontSize: 16, lineHeight: 1.5 }}>
						Tabot records the signals that connect your work without reading
						page content.
					</div>
				</div>

				<div
					style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12 }}
				>
					{activities.map((activity, index) => (
						<div
							key={activity.domain}
							style={{
								background: "#111e28",
								border: "1px solid #2b3c47",
								borderRadius: 16,
								opacity: interpolate(
									frame,
									[index * 9, index * 9 + fps / 2],
									[0, 1],
									{
										easing: Easing.bezier(0.16, 1, 0.3, 1),
										extrapolateLeft: "clamp",
										extrapolateRight: "clamp",
									},
								),
								padding: "17px 18px",
								scale: spring({
									config: { damping: 22, mass: 0.7, stiffness: 160 },
									fps,
									frame: frame - index * 9,
								}),
							}}
						>
							<div style={{ alignItems: "center", display: "flex", gap: 10 }}>
								<div
									style={{
										background: activity.color,
										borderRadius: 99,
										height: 8,
										width: 8,
									}}
								/>
								<div
									style={{
										color: "#a8bbc3",
										fontFamily: "IBM Plex Mono, monospace",
										fontSize: 13,
									}}
								>
									{activity.domain}
								</div>
							</div>
							<div
								style={{
									fontSize: 17,
									fontWeight: 600,
									letterSpacing: "-0.02em",
									marginTop: 8,
								}}
							>
								{activity.title}
							</div>
						</div>
					))}
				</div>
			</div>

			<div
				style={{
					alignItems: "center",
					display: "flex",
					gap: 12,
					marginTop: 28,
				}}
			>
				<div
					style={{
						background: "#a3e635",
						borderRadius: 99,
						height: 10,
						width: 10,
					}}
				/>
				<div
					style={{
						color: "#d6e1e2",
						fontFamily: "IBM Plex Mono, monospace",
						fontSize: 15,
					}}
				>
					Signals stay on this device
				</div>
				<div style={{ background: "#2b3c47", flex: 1, height: 1 }} />
			</div>
		</div>
	);
};
