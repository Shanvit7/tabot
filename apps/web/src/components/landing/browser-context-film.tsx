import {
	AbsoluteFill,
	Easing,
	Interactive,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { cn } from "~/lib/utils";

const moments = [
	{
		border: "border-[#7dd3fc55]",
		color: "#7dd3fc",
		delay: 0,
		label: "Search",
		shadow: "shadow-[0_18px_40px_#7dd3fc18]",
		text: "text-[#7dd3fc]",
		x: 118,
		y: 212,
	},
	{
		border: "border-[#fbbf2455]",
		color: "#fbbf24",
		delay: 8,
		label: "Open page",
		shadow: "shadow-[0_18px_40px_#fbbf2418]",
		text: "text-[#fbbf24]",
		x: 690,
		y: 138,
	},
	{
		border: "border-[#f9a8d455]",
		color: "#f9a8d4",
		delay: 16,
		label: "Back to it",
		shadow: "shadow-[0_18px_40px_#f9a8d418]",
		text: "text-[#f9a8d4]",
		x: 708,
		y: 396,
	},
	{
		border: "border-[#c4b5fd55]",
		color: "#c4b5fd",
		delay: 24,
		label: "New tab",
		shadow: "shadow-[0_18px_40px_#c4b5fd18]",
		text: "text-[#c4b5fd]",
		x: 112,
		y: 412,
	},
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
		<AbsoluteFill className="overflow-hidden bg-[radial-gradient(circle_at_50%_50%,#183d35_0%,#0b1d21_35%,#061014_78%)] font-sans text-[#eff8ed]">
			<svg
				className="absolute inset-0 w-240"
				height="620"
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
					className="absolute rounded-full bg-[#d9ff98]"
					key={`${dot.x}-${dot.y}`}
					style={{
						height: dot.size,
						left: dot.x,
						opacity: 0.1 + (Math.sin(frame / 10 + index) + 1) * 0.08,
						top: dot.y,
						width: dot.size,
					}}
				/>
			))}

			<Interactive.Div
				className="absolute left-9.5 top-7.5 flex items-center gap-2.5"
				name="Tabot label"
				style={{
					opacity: interpolate(frame, [0, 12], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
				}}
			>
				<span className="size-2.5 rounded-full bg-[#bfff00]" />
				<span className="text-[19px] font-bold tracking-[-0.04em]">TABOT</span>
				<span className="rounded-full border border-[#4e706a] px-2.25 py-1.5 text-[11px] tracking-[0.04em] text-[#a8c7bc]">
					KEPT LOCAL
				</span>
			</Interactive.Div>

			<Interactive.Div
				className="absolute left-9.5 top-21"
				name="Work statement"
				style={{
					opacity: interpolate(frame, [4, 22, 84, 101], [0, 1, 1, 0], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
				}}
			>
				<div className="text-[13px] tracking-[0.06em] text-[#9fbdb3]">
					YOUR DAY MOVES FAST
				</div>
				<div className="mt-1.75 text-[32px] font-[650] tracking-[-0.04em]">
					Keep what happened together.
				</div>
			</Interactive.Div>

			{moments.map((moment) => {
				const scale = spring({
					config: { damping: 18, mass: 0.65, stiffness: 155 },
					fps,
					frame: frame - moment.delay - 6,
				});
				const currentX = moment.x + (480 - moment.x) * collect;
				const currentY = moment.y + (308 - moment.y) * collect;

				return (
					<Interactive.Div
						className={cn(
							"absolute w-43 -translate-x-1/2 -translate-y-1/2 rounded-[13px] border bg-[linear-gradient(135deg,rgba(31,65,65,0.94),rgba(11,29,33,0.9))] p-[12px_14px]",
							moment.border,
							moment.shadow,
						)}
						key={moment.label}
						name={`${moment.label} browser moment`}
						style={{
							left: currentX,
							opacity:
								interpolate(frame, [moment.delay, moment.delay + 12], [0, 1], {
									extrapolateLeft: "clamp",
									extrapolateRight: "clamp",
								}) *
								(1 - collect * 0.92),
							scale: Math.max(0.01, scale) * (1 - collect * 0.58),
							top: currentY,
						}}
					>
						<div className={cn("text-[11px] tracking-[0.06em]", moment.text)}>
							BROWSER MOMENT
						</div>
						<div className="mt-1.75 text-[17px] font-semibold tracking-tight">
							{moment.label}
						</div>
					</Interactive.Div>
				);
			})}

			<Interactive.Div
				className="absolute left-120 top-77 w-59.5 -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-[#efffc6] bg-[linear-gradient(145deg,#d9ff8b,#91c900)] p-[18px_20px] text-[#102219] shadow-[0_0_0_8px_rgba(191,255,0,0.1),0_0_55px_rgba(191,255,0,0.34)]"
				name="Context core"
				style={{
					opacity: ready,
					scale: spring({
						config: { damping: 13, mass: 0.8, stiffness: 120 },
						fps,
						frame: frame - 101,
					}),
				}}
			>
				<div className="text-[11px] font-bold tracking-[0.08em]">
					YOUR CONTEXT
				</div>
				<div className="mt-2.25 text-[25px] font-bold leading-none tracking-[-0.04em]">
					All in one place.
				</div>
				<div className="mt-2 text-[13px] font-semibold opacity-70">
					Built from browser activity.
				</div>
			</Interactive.Div>

			<Interactive.Div
				className="absolute left-170.5 top-77 w-50 -translate-y-1/2 rounded-2xl border border-[#bfff00] bg-[rgba(8,22,25,0.88)] p-[16px_18px] shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
				name="Use your context"
				style={{
					opacity: useIt,
					scale: spring({
						config: { damping: 18, mass: 0.6, stiffness: 150 },
						fps,
						frame: frame - 134,
					}),
				}}
			>
				<div className="text-[11px] tracking-[0.08em] text-[#bfff00]">
					WHEN YOU NEED IT
				</div>
				<div className="mt-2.25 text-[20px] font-[650] leading-[1.05] tracking-[-0.04em]">
					Continue with clarity.
				</div>
				<div className="mt-2.25 text-[12px] leading-[1.35] text-[#a9c1b6]">
					Use it yourself or with an AI you choose.
				</div>
			</Interactive.Div>

			<Interactive.Div
				className="absolute bottom-9 left-9.5"
				name="Closing statement"
				style={{
					opacity: interpolate(frame, [148, 164], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
				}}
			>
				<div className="text-[12px] tracking-[0.08em] text-[#bfff00]">
					PRIVACY-FIRST
				</div>
				<div className="mt-1.5 text-[27px] font-[650] tracking-[-0.04em]">
					Your activity. Yours to use.
				</div>
			</Interactive.Div>
		</AbsoluteFill>
	);
};
