import {
	AbsoluteFill,
	Easing,
	Interactive,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

const moments = [
	{ label: "Search", x: 118, y: 160, color: "#7dd3fc", delay: 0 },
	{ label: "Open page", x: 690, y: 138, color: "#fbbf24", delay: 8 },
	{ label: "Back to it", x: 708, y: 396, color: "#f9a8d4", delay: 16 },
	{ label: "New tab", x: 112, y: 412, color: "#c4b5fd", delay: 24 },
] as const;

const ambientDots = Array.from({ length: 30 }, (_, index) => ({
	x: (index * 83 + 41) % 960,
	y: (index * 137 + 53) % 620,
	size: index % 3 === 0 ? 3 : 2,
}));

export const BrowserContextFilm = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const collect = interpolate(frame, [54, 105], [0, 1], {
		easing: Easing.bezier(0.65, 0, 0.35, 1),
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const ready = interpolate(frame, [100, 122], [0, 1], {
		easing: Easing.bezier(0.16, 1, 0.3, 1),
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const useIt = interpolate(frame, [132, 153], [0, 1], {
		easing: Easing.bezier(0.16, 1, 0.3, 1),
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<AbsoluteFill
			style={{
				background:
					"radial-gradient(circle at 50% 50%, #183d35 0%, #0b1d21 35%, #061014 78%)",
				color: "#eff8ed",
				fontFamily: "IBM Plex Sans, sans-serif",
				overflow: "hidden",
			}}
		>
			<svg
				height="620"
				style={{ inset: 0, position: "absolute", width: "960px" }}
				viewBox="0 0 960 620"
			>
				<title>Browser moments gathering into local Tabot context</title>
				<defs>
					<filter id="context-glow">
						<feGaussianBlur stdDeviation="7" />
					</filter>
					<linearGradient id="context-beam" x1="0" x2="1">
						<stop stopColor="#bfff00" stopOpacity="0" />
						<stop offset="0.5" stopColor="#bfff00" stopOpacity="0.75" />
						<stop offset="1" stopColor="#bfff00" stopOpacity="0" />
					</linearGradient>
				</defs>
				{moments.map((moment) => {
					const startX = moment.x + 86;
					const startY = moment.y + 39;
					const length = Math.hypot(480 - startX, 308 - startY);
					const draw = interpolate(
						frame,
						[moment.delay + 15, moment.delay + 49],
						[length, 0],
						{
							extrapolateLeft: "clamp",
							extrapolateRight: "clamp",
						},
					);

					return (
						<path
							d={`M ${startX} ${startY} Q 480 ${startY} 480 308`}
							fill="none"
							key={moment.label}
							stroke={moment.color}
							strokeDasharray={length}
							strokeDashoffset={draw}
							strokeOpacity={0.3 * (1 - collect)}
							strokeWidth="1.5"
						/>
					);
				})}
				<circle
					cx="480"
					cy="308"
					fill="#bfff00"
					filter="url(#context-glow)"
					opacity={0.16 + ready * 0.62}
					r={30 + ready * 46}
				/>
				<circle
					cx="480"
					cy="308"
					fill="none"
					opacity={0.12 + ready * 0.44}
					r={76 + Math.sin(frame / 7) * 3}
					stroke="#bfff00"
					strokeWidth="1"
				/>
				<path
					d="M 565 308 L 812 308"
					filter="url(#context-glow)"
					opacity={useIt * 0.9}
					stroke="url(#context-beam)"
					strokeWidth="7"
				/>
			</svg>

			{ambientDots.map((dot, index) => (
				<div
					key={`${dot.x}-${dot.y}`}
					style={{
						background: "#d9ff98",
						borderRadius: 999,
						height: dot.size,
						left: dot.x,
						opacity: 0.1 + (Math.sin(frame / 10 + index) + 1) * 0.08,
						position: "absolute",
						top: dot.y,
						width: dot.size,
					}}
				/>
			))}

			<Interactive.Div
				name="Tabot label"
				style={{
					alignItems: "center",
					display: "flex",
					gap: 10,
					left: 38,
					opacity: interpolate(frame, [0, 12], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
					position: "absolute",
					top: 30,
				}}
			>
				<span
					style={{
						background: "#bfff00",
						borderRadius: 99,
						height: 10,
						width: 10,
					}}
				/>
				<span
					style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.04em" }}
				>
					TABOT
				</span>
				<span
					style={{
						border: "1px solid #4e706a",
						borderRadius: 99,
						color: "#a8c7bc",
						fontSize: 11,
						letterSpacing: "0.04em",
						padding: "6px 9px",
					}}
				>
					KEPT LOCAL
				</span>
			</Interactive.Div>

			<Interactive.Div
				name="Work statement"
				style={{
					left: 38,
					opacity: interpolate(frame, [4, 22, 84, 101], [0, 1, 1, 0], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
					position: "absolute",
					top: 84,
				}}
			>
				<div
					style={{ color: "#9fbdb3", fontSize: 13, letterSpacing: "0.06em" }}
				>
					YOUR DAY MOVES FAST
				</div>
				<div
					style={{
						fontSize: 32,
						fontWeight: 650,
						letterSpacing: "-0.04em",
						marginTop: 7,
					}}
				>
					Keep what happened together.
				</div>
			</Interactive.Div>

			{moments.map((moment) => {
				const scale = spring({
					config: { damping: 18, mass: 0.65, stiffness: 155 },
					fps,
					frame: frame - moment.delay - 6,
				});
				const currentX = moment.x + (480 - (moment.x + 86)) * collect;
				const currentY = moment.y + (308 - (moment.y + 39)) * collect;

				return (
					<Interactive.Div
						key={moment.label}
						name={`${moment.label} browser moment`}
						style={{
							background:
								"linear-gradient(135deg, rgba(31, 65, 65, 0.94), rgba(11, 29, 33, 0.9))",
							border: `1px solid ${moment.color}55`,
							borderRadius: 13,
							boxShadow: `0 18px 40px ${moment.color}18`,
							left: currentX,
							opacity:
								interpolate(frame, [moment.delay, moment.delay + 12], [0, 1], {
									extrapolateLeft: "clamp",
									extrapolateRight: "clamp",
								}) *
								(1 - collect * 0.92),
							padding: "12px 14px",
							position: "absolute",
							scale: Math.max(0.01, scale) * (1 - collect * 0.58),
							top: currentY,
							translate: "-50% -50%",
							width: 172,
						}}
					>
						<div
							style={{
								color: moment.color,
								fontSize: 11,
								letterSpacing: "0.06em",
							}}
						>
							BROWSER MOMENT
						</div>
						<div
							style={{
								fontSize: 17,
								fontWeight: 600,
								letterSpacing: "-0.025em",
								marginTop: 7,
							}}
						>
							{moment.label}
						</div>
					</Interactive.Div>
				);
			})}

			<Interactive.Div
				name="Context core"
				style={{
					background: "linear-gradient(145deg, #d9ff8b, #91c900)",
					border: "1px solid #efffc6",
					borderRadius: 22,
					boxShadow:
						"0 0 0 8px rgba(191,255,0,0.1), 0 0 55px rgba(191,255,0,0.34)",
					color: "#102219",
					left: 480,
					opacity: ready,
					padding: "18px 20px",
					position: "absolute",
					scale: spring({
						config: { damping: 13, mass: 0.8, stiffness: 120 },
						fps,
						frame: frame - 101,
					}),
					top: 308,
					translate: "-50% -50%",
					width: 238,
				}}
			>
				<div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
					YOUR CONTEXT
				</div>
				<div
					style={{
						fontSize: 25,
						fontWeight: 700,
						letterSpacing: "-0.04em",
						lineHeight: 1,
						marginTop: 9,
					}}
				>
					All in one place.
				</div>
				<div
					style={{ fontSize: 13, fontWeight: 600, marginTop: 8, opacity: 0.7 }}
				>
					Built from browser activity.
				</div>
			</Interactive.Div>

			<Interactive.Div
				name="Use your context"
				style={{
					background: "rgba(8, 22, 25, 0.88)",
					border: "1px solid #bfff00",
					borderRadius: 16,
					boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
					left: 682,
					opacity: useIt,
					padding: "16px 18px",
					position: "absolute",
					scale: spring({
						config: { damping: 18, mass: 0.6, stiffness: 150 },
						fps,
						frame: frame - 134,
					}),
					top: 308,
					translate: "0 -50%",
					width: 200,
				}}
			>
				<div
					style={{ color: "#bfff00", fontSize: 11, letterSpacing: "0.08em" }}
				>
					WHEN YOU NEED IT
				</div>
				<div
					style={{
						fontSize: 20,
						fontWeight: 650,
						letterSpacing: "-0.04em",
						lineHeight: 1.05,
						marginTop: 9,
					}}
				>
					Continue with clarity.
				</div>
				<div
					style={{
						color: "#a9c1b6",
						fontSize: 12,
						lineHeight: 1.35,
						marginTop: 9,
					}}
				>
					Use it yourself or with an AI you choose.
				</div>
			</Interactive.Div>

			<Interactive.Div
				name="Closing statement"
				style={{
					bottom: 36,
					left: 38,
					opacity: interpolate(frame, [148, 164], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
					position: "absolute",
				}}
			>
				<div
					style={{ color: "#bfff00", fontSize: 12, letterSpacing: "0.08em" }}
				>
					LOCAL-FIRST
				</div>
				<div
					style={{
						fontSize: 27,
						fontWeight: 650,
						letterSpacing: "-0.04em",
						marginTop: 6,
					}}
				>
					Your activity. Yours to use.
				</div>
			</Interactive.Div>
		</AbsoluteFill>
	);
};
