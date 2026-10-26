import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronLeft,
	ChevronRight,
	Pause,
	Play,
	RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type ActivityTrail,
	TRAILS_PER_MAP,
	trailWindow,
} from "~/lib/activity-explorer";
import { prettySite } from "~/lib/context-graph-data";
import { formatDuration } from "~/lib/home-data";

const points = [
	{ x: 95, y: 120 },
	{ x: 325, y: 80 },
	{ x: 565, y: 150 },
	{ x: 805, y: 100 },
	{ x: 805, y: 335 },
	{ x: 565, y: 390 },
	{ x: 325, y: 320 },
	{ x: 95, y: 375 },
];
const host = (origin: string) => new URL(origin).host.replace(/^www\./, "");
const clock = (at: number) =>
	new Date(at).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
const dayLabel = (at: number) =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const ActivityTrailMap = ({
	trails,
	query,
}: {
	trails: ActivityTrail[];
	query: string;
}) => {
	const [dayId, setDayId] = useState<number | null>(null);
	const [trailId, setTrailId] = useState<string | null>(null);
	const [page, setPage] = useState(0);
	const [dayPage, setDayPage] = useState(0);
	const [cursor, setCursor] = useState(0);
	const [playing, setPlaying] = useState(false);
	const matching = trails.filter((trail) =>
		trail.stops.some((stop) => host(stop.origin).includes(query)),
	);
	const days = [...new Set(matching.map((trail) => trail.day))].sort(
		(a, b) => a - b,
	);
	const dayPages = Math.ceil(days.length / 7);
	const activeDayPage = Math.min(dayPage, Math.max(0, dayPages - 1));
	const visibleDays = days.slice(
		Math.max(0, days.length - (activeDayPage + 1) * 7),
		days.length - activeDayPage * 7 || undefined,
	);
	const day = visibleDays.includes(dayId ?? -1) ? dayId : visibleDays.at(-1);
	const dayTrails = matching.filter((trail) => trail.day === day);
	const trail = dayTrails.find((item) => item.id === trailId);
	const pages = Math.ceil(dayTrails.length / TRAILS_PER_MAP);
	const activePage = Math.min(page, Math.max(0, pages - 1));
	const visible = dayTrails.slice(
		activePage * TRAILS_PER_MAP,
		(activePage + 1) * TRAILS_PER_MAP,
	);
	const step = Math.min(cursor, (trail?.stops.length ?? 1) - 1);
	const window = trailWindow(trail?.stops ?? [], step);
	const stop = trail?.stops[step];
	const finished = !!trail && step === trail.stops.length - 1;
	const move = (next: number) => {
		setPlaying(false);
		setCursor(next);
	};
	useEffect(() => {
		if (!playing || !trail || finished) return;
		const pauseWhenHidden = () => {
			if (document.hidden) setPlaying(false);
		};
		const timer = setTimeout(() => {
			if (document.hidden) return setPlaying(false);
			setCursor((current) => Math.min(current + 1, trail.stops.length - 1));
		}, 1400);
		document.addEventListener("visibilitychange", pauseWhenHidden);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", pauseWhenHidden);
		};
	}, [playing, trail, finished]);

	return (
		<section
			aria-label="Time-grouped browsing trails"
			className="overflow-hidden border border-work-line bg-white"
		>
			<fieldset
				aria-label="Choose a day"
				className="grid grid-cols-4 gap-px border-b border-work-line bg-work-line sm:grid-cols-9"
			>
				<button
					type="button"
					aria-label="Earlier days"
					disabled={activeDayPage + 1 >= dayPages}
					onClick={() => setDayPage(activeDayPage + 1)}
					className="grid min-h-20 place-items-center bg-white disabled:opacity-40"
				>
					<ChevronLeft size={18} />
				</button>
				{visibleDays.map((item) => (
					<button
						key={item}
						type="button"
						aria-pressed={day === item}
						onClick={() => {
							setDayId(item);
							setTrailId(null);
							setPlaying(false);
							setPage(0);
						}}
						className="grid min-h-25 content-center justify-items-center gap-1 bg-white px-1 text-xs aria-pressed:bg-work-accent hover:bg-work-surface"
					>
						<span>
							{new Date(item).toLocaleDateString("en-GB", { weekday: "short" })}
						</span>
						<strong className="font-display text-2xl">
							{new Date(item).getDate()}
						</strong>
						<small>
							{matching.filter((entry) => entry.day === item).length} trails
						</small>
					</button>
				))}
				<button
					type="button"
					aria-label="Later days"
					disabled={activeDayPage === 0}
					onClick={() => setDayPage(activeDayPage - 1)}
					className="grid min-h-20 place-items-center bg-white disabled:opacity-40"
				>
					<ChevronRight size={18} />
				</button>
			</fieldset>
			<div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-work-line px-4 py-3 sm:px-6">
				<div className="flex items-center gap-2">
					{trail && (
						<button
							type="button"
							onClick={() => {
								setTrailId(null);
								setPlaying(false);
							}}
							aria-label="Back to daily trails"
							className="grid size-11 place-items-center hover:bg-work-surface"
						>
							<ArrowLeft size={18} />
						</button>
					)}
					<strong>{day ? dayLabel(day) : "No matching days"}</strong>
					{trail && (
						<>
							<ChevronRight size={15} />
							<span>
								{clock(trail.start)}–{clock(trail.end)}
							</span>
						</>
					)}
				</div>
				<span className="text-sm text-work-muted">
					{trail
						? `Stops ${window.start + 1}–${window.start + window.stops.length} of ${trail.stops.length}`
						: `${dayTrails.length} trails · browsing breaks stay separate`}
				</span>
			</div>
			{!matching.length ? (
				<div className="grid min-h-64 content-center justify-items-center gap-3 px-5 text-center">
					<h2 className="text-2xl font-semibold">
						{query ? "No matching trails" : "Your map starts with a visit"}
					</h2>
					<p className="max-w-lg text-work-muted">
						{query
							? "Try another website name."
							: "Browse normally with Tabot enabled. Your activity stays on this device."}
					</p>
				</div>
			) : !trail ? (
				<div className="p-5 sm:p-8">
					<div className="mb-6">
						<h2 className="text-2xl font-semibold">
							Pick a trail. Follow your footsteps.
						</h2>
						<p className="mt-1 text-work-muted">
							Each island is one browsing stretch—not an inferred task.
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{visible.map((item) => (
							<button
								key={item.id}
								type="button"
								className="group grid min-h-48 content-between border border-work-line bg-work-surface p-4 text-left transition-colors hover:border-work-ink hover:bg-white"
								onClick={() => {
									setTrailId(item.id);
									setCursor(0);
									setPlaying(false);
								}}
							>
								<span className="flex items-center justify-between font-mono text-sm">
									<strong>
										{clock(item.start)}–{clock(item.end)}
									</strong>
									<ArrowRight size={18} />
								</span>
								<svg
									viewBox="0 0 210 100"
									className="my-3 h-20 w-full text-work-ink"
									aria-hidden="true"
								>
									{item.stops.slice(0, 5).map((entry, index) => (
										<g
											key={entry.id}
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											{index > 0 && (
												<path
													d={`M${25 + (index - 1) * 40},${index % 2 ? 30 : 70} L${25 + index * 40},${index % 2 ? 70 : 30}`}
												/>
											)}
											<circle
												cx={25 + index * 40}
												cy={index % 2 ? 70 : 30}
												r="12"
												fill={
													index === 0 ? "var(--color-work-accent)" : "white"
												}
											/>
										</g>
									))}
								</svg>
								<span className="truncate font-medium">
									{[
										...new Set(
											item.stops.map((entry) => prettySite(entry.origin)),
										),
									]
										.slice(0, 3)
										.join(" / ")}
								</span>
								<span className="mt-3 flex justify-between text-sm text-work-muted">
									<span>{item.stops.length} stops</span>
									<span>Est. {formatDuration(item.duration)}</span>
								</span>
							</button>
						))}
					</div>
					<div className="mt-5 flex items-center justify-between text-sm text-work-muted">
						<span>
							Showing {visible.length} of {dayTrails.length} trails.
						</span>
						{pages > 1 && (
							<div className="flex items-center gap-3">
								<button
									type="button"
									aria-label="Previous trails"
									disabled={activePage === 0}
									onClick={() => setPage(activePage - 1)}
									className="grid size-11 place-items-center disabled:opacity-40"
								>
									<ChevronLeft />
								</button>
								<span>
									{activePage + 1} / {pages}
								</span>
								<button
									type="button"
									aria-label="Next trails"
									disabled={activePage + 1 === pages}
									onClick={() => setPage(activePage + 1)}
									className="grid size-11 place-items-center disabled:opacity-40"
								>
									<ChevronRight />
								</button>
							</div>
						)}
					</div>
				</div>
			) : (
				<div key={trail.id}>
					<div className="relative mx-auto grid min-h-[400px] max-w-5xl grid-cols-2 grid-rows-4 gap-2 p-4 sm:grid-cols-4 sm:grid-rows-2 sm:p-8">
						<svg
							viewBox="0 0 900 490"
							className="absolute inset-0 size-full"
							aria-hidden="true"
						>
							{window.stops.slice(1).map((entry, index) => {
								const a = points[index];
								const b = points[index + 1];
								const d = `M${a.x},${a.y} Q${(a.x + b.x) / 2},${Math.min(a.y, b.y) - 40} ${b.x},${b.y}`;
								return (
									<g key={entry.id}>
										<path
											d={d}
											fill="none"
											stroke="var(--color-work-line)"
											strokeWidth="3"
										/>
										<path
											d={d}
											pathLength="1"
											className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
											style={{
												strokeDashoffset: index + window.start < step ? 0 : 1,
											}}
											fill="none"
											stroke="var(--color-work-accent)"
											strokeWidth="4"
										/>
									</g>
								);
							})}
						</svg>
						{window.stops.map((entry, index) => {
							const absolute = window.start + index;
							return (
								<button
									key={entry.id}
									type="button"
									aria-current={absolute === step ? "step" : undefined}
									aria-label={`Stop ${absolute + 1}: ${host(entry.origin)}, ${clock(entry.at)}`}
									onClick={() => move(absolute)}
									className="relative z-10 flex min-w-0 flex-col items-center justify-center gap-2 self-center justify-self-center text-center"
									style={{
										gridColumn: `${index < 4 ? index + 1 : 8 - index}`,
										gridRow: `${index < 4 ? 1 : 2}`,
									}}
								>
									<span
										className={`grid size-11 place-items-center rounded-full border border-work-ink ${absolute === step ? "bg-work-accent" : absolute < step ? "bg-work-raised" : "bg-white"}`}
									>
										{absolute < step ? <Check size={19} /> : absolute + 1}
									</span>
									<strong className="max-w-32 truncate text-sm">
										{prettySite(entry.origin)}
									</strong>
									<time className="font-mono text-xs text-work-muted">
										{clock(entry.at)}
									</time>
								</button>
							);
						})}
					</div>
					<div className="grid gap-5 border-t border-work-line bg-work-surface p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-8">
						<div aria-live="polite">
							<h2 className="text-xl font-semibold">
								{finished ? "Trail explored." : prettySite(stop?.origin ?? "")}
							</h2>
							<p className="mt-1 text-sm text-work-muted">
								{finished
									? `${trail.stops.length} observed stops.`
									: `${clock(stop?.at ?? trail.start)} · Stop ${step + 1} of ${trail.stops.length}`}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								aria-label="Previous stop"
								disabled={step === 0}
								onClick={() => move(step - 1)}
								className="grid size-11 place-items-center border border-work-line disabled:opacity-40"
							>
								<ChevronLeft />
							</button>
							<button
								type="button"
								onClick={() => {
									if (finished) setCursor(0);
									setPlaying(finished || !playing);
								}}
								className="flex min-h-11 items-center gap-2 border border-work-line px-4"
							>
								{playing && !finished ? (
									<Pause size={18} />
								) : finished ? (
									<RotateCcw size={18} />
								) : (
									<Play size={18} />
								)}
								{playing && !finished
									? "Pause"
									: finished
										? "Replay"
										: "Play trail"}
							</button>
							<button
								type="button"
								disabled={finished}
								onClick={() => move(step + 1)}
								className="flex min-h-11 items-center gap-2 bg-work-accent px-4 disabled:opacity-40"
							>
								Next stop <ArrowRight size={18} />
							</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
};
