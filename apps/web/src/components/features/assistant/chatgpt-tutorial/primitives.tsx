import {
	AtSign,
	AudioLines,
	Brain,
	Clock3,
	Library,
	Mic,
	MoreHorizontal,
	PanelLeft,
	Plus,
	Search,
	SquarePen,
	Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	Easing,
	interpolate,
	useCurrentFrame,
	useCurrentScale,
} from "remotion";

export const Reveal = ({
	children,
	at = 0,
}: {
	children: ReactNode;
	at?: number;
}) => {
	const frame = useCurrentFrame();
	return (
		<div
			style={{
				opacity: interpolate(frame, [at, at + 12], [0, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				translate: `0 ${interpolate(frame, [at, at + 18], [0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}rem`,
			}}
		>
			{children}
		</div>
	);
};

// Decorative cursor; every click is frame-driven, including after seeking backwards.
export const DemoCursor = ({
	at,
	className = "",
}: {
	at: number;
	className?: string;
}) => {
	const frame = useCurrentFrame();
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 32 40"
			className={`pointer-events-none absolute z-30 h-10 w-8 drop-shadow-lg ${className}`}
			style={{
				opacity: interpolate(
					frame,
					[at - 12, at, at + 30, at + 42],
					[0, 1, 1, 0],
					{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
				),
				translate: interpolate(
					frame,
					[at - 12, at],
					["1rem 1rem", "0rem 0rem"],
					{
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
						easing: Easing.out(Easing.cubic),
					},
				),
				scale: interpolate(frame, [at, at + 5, at + 10], [1, 0.85, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
			}}
		>
			<path
				d="M3 2 29 25 17 26 12 37Z"
				fill="white"
				stroke="black"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const ChatGptShell = ({
	children,
	plugins,
}: {
	children: ReactNode;
	plugins: boolean;
}) => {
	const scale = useCurrentScale();
	// Player controls keep their screen size while the composition scales.
	return (
		<div
			className="absolute inset-0 top-24 flex bg-tutorial-browser text-tutorial-ink"
			style={{ bottom: `${Math.max(7, 4 / scale)}rem` }}
		>
			<aside className="flex w-72 shrink-0 flex-col border-r border-white/10 p-4">
				<div className="mb-7 flex items-center gap-5 px-2 pt-2">
					<span className="mr-auto text-2xl font-semibold">ChatGPT</span>
					<Search className="size-6 text-tutorial-muted" />
					<PanelLeft className="size-6 text-tutorial-muted" />
				</div>
				<div className="space-y-1 text-xl">
					{[
						{ label: "New chat", Icon: SquarePen },
						{ label: "Scheduled", Icon: Clock3 },
						{ label: "Library", Icon: Library },
						{ label: "Plugins", Icon: AtSign },
						{ label: "Codex", Icon: Terminal },
						{ label: "Explore", Icon: MoreHorizontal },
					].map(({ label, Icon }) => (
						<div
							key={label}
							className={`relative flex h-12 items-center gap-3 rounded-xl px-3 ${(plugins && label === "Plugins") || (!plugins && label === "New chat") ? "bg-white/10 text-tutorial-ink" : "text-tutorial-muted"}`}
						>
							<Icon className="size-6 shrink-0" />
							{label}
						</div>
					))}
				</div>
				<div className="mt-7 min-h-0 flex-1 space-y-4 overflow-hidden px-3 text-lg text-tutorial-muted">
					<p>Pinned</p>
					<p className="text-tutorial-ink">Browser research</p>
					<p className="pt-4">Projects</p>
					<p className="text-neutral-500">No projects</p>
					<p className="pt-4">Recents</p>
					<p>Research notes</p>
				</div>
				<div className="mt-auto flex items-center gap-3 border-t border-white/10 px-2 pt-4 text-lg">
					<span className="flex size-9 items-center justify-center rounded-full bg-neutral-700 text-sm">
						T
					</span>
					<div>
						Tabot demo
						<p className="text-sm text-tutorial-muted">Personal account</p>
					</div>
				</div>
			</aside>
			<div className="relative min-w-0 flex-1 overflow-hidden">{children}</div>
		</div>
	);
};

export const ChatComposer = ({
	children,
	tabot = false,
}: {
	children?: ReactNode;
	tabot?: boolean;
}) => (
	<div className="rounded-3xl border border-white/10 bg-neutral-900 px-5 py-4 text-xl">
		{tabot ? (
			<span className="mb-3 inline-flex rounded-lg bg-white/10 px-3 py-1 text-lg">
				Tabot
			</span>
		) : null}
		{children ? <p className="mb-5 leading-8">{children}</p> : null}
		<div className="flex items-center gap-4 text-tutorial-muted">
			<Plus className="size-6" />
			{!children ? (
				<span className="mr-auto">Ask ChatGPT</span>
			) : (
				<span className="mr-auto" />
			)}
			<Brain className="size-6" />
			<span>Think</span>
			<Mic className="ml-2 size-6" />
			<span className="flex size-10 items-center justify-center rounded-full bg-blue-600 text-white">
				<AudioLines className="size-6" />
			</span>
		</div>
	</div>
);
