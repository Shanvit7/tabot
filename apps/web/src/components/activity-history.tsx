import type { Memory } from "@tabot/shared";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronLeft,
	ChevronRight,
	Pause,
	Play,
	Repeat2,
	RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ActivitySwitch } from "~/lib/activity-explorer";
import { prettySite } from "~/lib/context-graph-data";

const host = (origin: string) => new URL(origin).host.replace(/^www\./, "");
const clock = (at: number) =>
	new Date(at).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
const date = (at: number) =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const dayStart = (at: number) => new Date(at).setHours(0, 0, 0, 0);

const sectionClass =
	"overflow-hidden border border-work-line bg-[var(--color-preview-trace)] text-[var(--color-preview-text)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-work-accent [&_button:focus-visible]:shadow-none [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-work-accent [&_input:focus-visible]:shadow-none";
const dayPickerClass =
	"flex min-w-0 gap-2 border-b border-work-muted bg-work-canvas px-2 pb-4 text-work-ink max-[640px]:gap-1";
const dayButtonClass =
	"grid min-w-[70px] flex-1 content-center justify-items-center gap-1 border border-work-line p-3 text-center text-xs hover:border-work-ink aria-pressed:border-work-ink aria-pressed:bg-work-accent max-[640px]:min-w-0 max-[640px]:px-0";
const headingClass =
	"flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-work-muted px-6 py-3 text-xs max-sm:px-4";
const emptyClass =
	"flex min-h-[340px] flex-col justify-center gap-4 px-8 py-12 max-sm:px-5";
const buttonClass =
	"inline-flex min-h-11 items-center justify-center gap-2 border border-work-muted px-3 text-sm transition-colors hover:border-work-accent motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40";

// A reel has one active switch and at most five neighboring frames. Breaks are never graph edges.
export const ActivityTimeline = ({
	timeline,
}: {
	timeline: ActivitySwitch[];
}) => {
	const [dayId, setDayId] = useState<number | null>(null);
	const [dayPage, setDayPage] = useState(0);
	const [cursor, setCursor] = useState(0);
	const [playing, setPlaying] = useState(false);
	const days = [...new Set(timeline.map((link) => dayStart(link.at)))].sort(
		(a, b) => a - b,
	);
	const dayPages = Math.ceil(days.length / 7);
	const activeDayPage = Math.min(dayPage, Math.max(0, dayPages - 1));
	const visibleDays = days.slice(
		Math.max(0, days.length - (activeDayPage + 1) * 7),
		days.length - activeDayPage * 7 || undefined,
	);
	const day = visibleDays.includes(dayId ?? -1) ? dayId : visibleDays.at(-1);
	const entries = useMemo(
		() =>
			timeline
				.filter((link) => dayStart(link.at) === day)
				.sort((a, b) => a.at - b.at),
		[timeline, day],
	);
	const step = Math.min(cursor, Math.max(0, entries.length - 1));
	const current = entries[step];
	const finished = step === entries.length - 1;
	const start = Math.max(0, Math.min(step - 2, entries.length - 5));
	const move = (next: number) => {
		setPlaying(false);
		setCursor(next);
	};

	useEffect(() => {
		if (!playing || finished || !current) return;
		const pause = () => {
			if (document.hidden) setPlaying(false);
		};
		const timer = setTimeout(() => {
			if (document.hidden) {
				setPlaying(false);
				return;
			}
			setCursor(step + 1);
		}, 1400);
		document.addEventListener("visibilitychange", pause);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", pause);
		};
	}, [playing, finished, current, step]);

	return (
		<section
			className={`${sectionClass} ${"relative"}`}
			aria-label="Browsing timeline replay"
		>
			<fieldset className={dayPickerClass} aria-label="Choose timeline day">
				<button
					type="button"
					aria-label="Earlier days"
					disabled={activeDayPage + 1 >= dayPages}
					onClick={() => setDayPage(activeDayPage + 1)}
					className="grid min-h-11 w-9 shrink-0 place-items-center disabled:opacity-40"
				>
					<ChevronLeft size={18} />
				</button>
				{visibleDays.map((item) => (
					<button
						type="button"
						key={item}
						aria-pressed={day === item}
						onClick={() => {
							setDayId(item);
							move(0);
						}}
						className={dayButtonClass}
					>
						<span className="text-xs">
							{new Date(item).toLocaleDateString("en-GB", { weekday: "short" })}
						</span>
						<strong className="font-mono text-2xl font-medium max-[640px]:text-xl">
							{new Date(item).getDate()}
						</strong>
						<small className="text-[11px]">
							{timeline.filter((link) => dayStart(link.at) === item).length}{" "}
							switches
						</small>
					</button>
				))}
				<button
					type="button"
					aria-label="Later days"
					disabled={activeDayPage === 0}
					onClick={() => setDayPage(activeDayPage - 1)}
					className="grid min-h-11 w-9 shrink-0 place-items-center disabled:opacity-40"
				>
					<ChevronRight size={18} />
				</button>
			</fieldset>
			{!current ? (
				<div className={emptyClass}>
					<h2 className="text-2xl font-medium">No matching website switches</h2>
					<p className="max-w-[50ch] text-sm leading-relaxed">
						Clear filters or restore sample records. A single website stop does
						not make a switch.
					</p>
				</div>
			) : (
				<>
					<div className={headingClass}>
						<strong className="text-[15px] font-medium">
							{date(current.at)}
						</strong>
						<span>
							Moment {step + 1} of {entries.length} · local time
						</span>
					</div>
					<div
						className="px-10 pt-8 pb-10 max-sm:px-4 max-sm:py-6"
						aria-live="polite"
						aria-atomic="true"
					>
						<time
							className="block text-center font-mono text-[clamp(56px,6vw,88px)] leading-none tracking-tight tabular-nums"
							dateTime={new Date(current.at).toISOString()}
						>
							{clock(current.at)}
						</time>
						<div
							className="mx-auto mt-6 grid max-w-[800px] grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] items-center max-sm:grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] max-sm:gap-2"
							key={current.id}
						>
							<div className="flex min-w-0 flex-col items-center gap-2 text-center">
								<span className="text-xs">From</span>
								<span className="my-1 grid size-16 place-items-center rounded-full border border-work-muted bg-preview-raised text-2xl font-medium max-sm:size-14">
									{prettySite(current.source).slice(0, 1)}
								</span>
								<h2 className="max-w-full break-words text-[clamp(22px,2.5vw,32px)] font-medium tracking-tight max-sm:text-xl">
									{prettySite(current.source)}
								</h2>
								<small className="max-w-full break-all text-xs">
									{host(current.source)}
								</small>
							</div>
							<div className="my-4 flex items-center text-work-accent before:h-0.5 before:flex-1 before:bg-work-accent">
								<ArrowRight size={28} className="shrink-0" />
							</div>
							<div className="flex min-w-0 flex-col items-center gap-2 text-center">
								<span className="text-xs">To</span>
								<span className="my-1 grid size-16 place-items-center rounded-full border border-work-accent bg-work-accent text-2xl font-medium text-work-ink max-sm:size-14">
									{prettySite(current.target).slice(0, 1)}
								</span>
								<h2 className="max-w-full break-words text-[clamp(22px,2.5vw,32px)] font-medium tracking-tight max-sm:text-xl">
									{prettySite(current.target)}
								</h2>
								<small className="max-w-full break-all text-xs">
									{host(current.target)}
								</small>
							</div>
						</div>
					</div>
					<div className="px-8 pb-5 max-sm:px-4">
						<label
							htmlFor="reel-position"
							className="flex justify-between gap-4 text-[13px]"
						>
							Scrub recorded switches{" "}
							<span className="font-mono">
								{step + 1} / {entries.length}
							</span>
						</label>
						<input
							id="reel-position"
							type="range"
							min="0"
							max={Math.max(1, entries.length - 1)}
							value={step}
							disabled={entries.length < 2}
							aria-valuetext={`${clock(current.at)}, ${host(current.source)} to ${host(current.target)}`}
							onChange={(event) => move(Number(event.target.value))}
							className="my-1 block h-11 w-full cursor-ew-resize accent-work-accent disabled:cursor-not-allowed"
						/>
						<div className="flex justify-between gap-4 text-xs max-sm:gap-2 max-sm:text-[11px]">
							<time className="shrink-0 font-mono">{clock(entries[0].at)}</time>
							<span className="max-w-[150px] text-center">
								Gaps skipped · not real-time video
							</span>
							<time className="shrink-0 font-mono">
								{clock(entries.at(-1)?.at ?? current.at)}
							</time>
						</div>
					</div>
					<fieldset
						className="flex min-w-0 gap-2 overflow-x-auto px-8 pt-3 pb-6 max-sm:px-4"
						aria-label="Nearby recorded switches"
					>
						{entries.slice(start, start + 5).map((entry, index) => (
							<button
								type="button"
								key={entry.id}
								aria-current={step === start + index ? "step" : undefined}
								onClick={() => move(start + index)}
								className="grid min-w-[130px] flex-1 content-start gap-3 border border-work-muted bg-preview-raised p-4 text-left hover:border-work-accent aria-current:border-work-accent aria-current:bg-work-accent aria-current:text-work-ink"
							>
								<time className="font-mono text-[15px]">{clock(entry.at)}</time>
								<span className="flex flex-wrap items-center gap-1.5 break-all text-xs">
									{prettySite(entry.source)}{" "}
									<ArrowRight size={14} aria-hidden="true" />{" "}
									{prettySite(entry.target)}
								</span>
							</button>
						))}
					</fieldset>
					<div className="flex items-center justify-between gap-6 border-t border-work-muted bg-preview-raised p-6 max-sm:flex-wrap max-sm:gap-5 max-sm:px-4">
						<div className="flex items-center gap-4">
							<span className="grid size-12 shrink-0 place-items-center bg-work-accent text-[22px] font-medium text-work-ink">
								{finished ? <Check size={22} /> : <Play size={22} />}
							</span>
							<div>
								<h2 className="text-[22px] font-medium tracking-tight max-sm:text-xl">
									{finished
										? "End of recorded day."
										: "Follow the next switch."}
								</h2>
								<p className="mt-1 text-xs leading-relaxed">
									Only observed website changes. Browsing breaks stay separate.
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2 max-sm:w-full">
							<button
								type="button"
								aria-label="Previous moment"
								disabled={step === 0}
								onClick={() => move(step - 1)}
								className={buttonClass}
							>
								<ChevronLeft size={20} />
							</button>
							<button
								type="button"
								onClick={() => {
									if (finished) setCursor(0);
									setPlaying(finished || !playing);
								}}
								disabled={entries.length < 2}
								className={buttonClass}
							>
								{playing && !finished ? (
									<Pause size={18} />
								) : finished ? (
									<RotateCcw size={18} />
								) : (
									<Play size={18} />
								)}
								{playing && !finished
									? "Pause replay"
									: finished
										? "Replay day"
										: "Play day"}
							</button>
							<button
								type="button"
								className="inline-flex min-h-11 items-center justify-center gap-2 bg-work-accent px-4 text-sm text-work-ink disabled:cursor-not-allowed disabled:opacity-40 max-sm:ml-auto"
								disabled={finished}
								onClick={() => move(step + 1)}
							>
								Next moment <ArrowRight size={18} />
							</button>
						</div>
					</div>
				</>
			)}
		</section>
	);
};

// Signatures are first-appearance summaries, not verbatim replays. Membership uses occurrence.domains.
// Catalog, signature, and evidence each render at most six items; native sliders reach every appearance.
export const ActivityPatterns = ({
	patterns,
	hasQuery,
	timeline,
	onReplay,
}: {
	patterns: Memory[];
	hasQuery: boolean;
	timeline: ActivitySwitch[];
	onReplay: (from: number, to: number) => void;
}) => {
	const [patternId, setPatternId] = useState<string | null>(null);
	const [page, setPage] = useState(0);
	const [cursor, setCursor] = useState(0);
	const [originId, setOriginId] = useState("");
	const [sitePage, setSitePage] = useState(0);
	const selected = patterns.find((pattern) => pattern.id === patternId);
	const pages = Math.ceil(patterns.length / 6);
	const activePage = Math.min(page, Math.max(0, pages - 1));
	const step = Math.min(
		cursor,
		Math.max(0, (selected?.occurrences.length ?? 1) - 1),
	);
	const occurrence = selected?.occurrences[step];
	const signature = selected?.fingerprint.orderedOrigins ?? [];
	const visibleSites = signature.slice(sitePage * 6, sitePage * 6 + 6);
	const focusedOrigin = visibleSites.includes(originId)
		? originId
		: visibleSites[0];
	const dateStart = Math.floor(step / 6) * 6;
	const canReplay =
		occurrence &&
		timeline.some(
			(link) =>
				link.at >= occurrence.startTimestamp &&
				link.at <= occurrence.endTimestamp,
		);

	return (
		<section className={sectionClass} aria-label="Recurring activity explorer">
			<div className={headingClass}>
				{selected ? (
					<button
						type="button"
						onClick={() => setPatternId(null)}
						className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
					>
						<ArrowLeft size={16} /> All patterns
					</button>
				) : (
					<strong className="text-[15px] font-medium">
						{patterns.length} recurring patterns
					</strong>
				)}
				<span>
					{selected
						? `${selected.occurrences.length} separate appearances`
						: "Derived from separate activity periods"}
				</span>
			</div>
			{!patterns.length ? (
				<div className={emptyClass}>
					<h2 className="text-2xl font-medium">
						{hasQuery
							? "No matching recurring patterns"
							: "A rhythm needs a repeat."}
					</h2>
					<p className="max-w-[50ch] text-sm leading-relaxed">
						{hasQuery
							? "Try another website or clear search."
							: "This sample period has no separate similar appearances. Try the week or restore the small sample."}
					</p>
				</div>
			) : !selected ? (
				<div className="bg-[radial-gradient(var(--work-muted)_0.6px,transparent_0.6px)] bg-size-[24px_24px] p-8 max-sm:px-4 max-sm:py-6">
					<div className="mb-6">
						<h2 className="text-[clamp(22px,2.5vw,30px)] font-medium tracking-tight">
							Seen this rhythm before?
						</h2>
						<p className="mt-2 text-[13px]">
							Pick a familiar combination. Compare the dates behind it.
						</p>
					</div>
					<div className="grid grid-cols-1 gap-4 py-4 pb-8 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
						{patterns
							.slice(activePage * 6, activePage * 6 + 6)
							.map((pattern, index) => (
								<button
									type="button"
									key={pattern.id}
									aria-label={`Explore ${pattern.fingerprint.orderedOrigins.map(prettySite).slice(0, 2).join(" + ")}, ${pattern.occurrences.length} appearances`}
									onClick={() => {
										setPatternId(pattern.id);
										setCursor(0);
										setOriginId("");
										setSitePage(0);
									}}
									className={`group flex min-w-0 flex-col border border-work-muted bg-preview-raised p-5 text-left transition-colors hover:border-work-accent hover:bg-work-ink motion-reduce:transition-none ${index % 3 === 1 ? "xl:translate-y-6" : ""}`}
								>
									<span className="flex w-full items-center justify-between gap-2 text-xs">
										<span>{pattern.occurrences.length} appearances</span>
										<Repeat2 size={18} className="text-work-accent" />
									</span>
									<svg
										viewBox="0 0 210 100"
										aria-hidden="true"
										className="my-3 max-h-[130px] w-full overflow-visible max-sm:max-h-[100px]"
									>
										{pattern.fingerprint.orderedOrigins.length > 1 && (
											<path
												d={
													pattern.fingerprint.orderedOrigins.length > 2
														? "M30 60 Q67 0 105 30 T180 60"
														: "M30 60 Q67 0 105 30"
												}
												className="fill-none stroke-work-accent [stroke-width:1.5]"
											/>
										)}
										{pattern.fingerprint.orderedOrigins
											.slice(0, 3)
											.map((origin, index) => (
												<g key={origin}>
													<circle
														cx={30 + index * 75}
														cy={index === 1 ? 30 : 60}
														r="16"
														className="fill-work-ink stroke-work-accent [stroke-width:2] first:fill-work-accent group-hover:fill-work-accent"
													/>
													<text
														x={30 + index * 75}
														y={(index === 1 ? 30 : 60) + 5}
														textAnchor="middle"
														className="fill-work-accent font-sans text-sm group-hover:fill-work-ink"
													>
														{prettySite(origin).slice(0, 1)}
													</text>
												</g>
											))}
									</svg>
									<span className="block min-h-10 overflow-wrap-anywhere text-sm font-medium group-hover:text-white max-sm:mb-4 max-sm:min-h-0">
										{pattern.fingerprint.orderedOrigins
											.slice(0, 2)
											.map(prettySite)
											.join(" + ")}
										{pattern.fingerprint.orderedOrigins.length > 2 &&
											` + ${pattern.fingerprint.orderedOrigins.length - 2} more`}
									</span>
									<span className="mt-auto flex w-full items-center justify-between gap-2 border-t border-work-muted pt-4 text-xs group-hover:text-white">
										{date(pattern.firstSeen)}–{date(pattern.lastSeen)}
										<span className="flex items-center gap-2">
											Explore <ArrowRight size={16} />
										</span>
									</span>
								</button>
							))}
					</div>
					<div className="flex flex-wrap items-center justify-between gap-4 text-xs">
						<span>Similar activity, not proof of a task or intent.</span>
						{pages > 1 && (
							<div className="flex items-center gap-4">
								<button
									type="button"
									aria-label="Previous patterns"
									disabled={activePage === 0}
									onClick={() => setPage(activePage - 1)}
									className="grid size-11 place-items-center disabled:opacity-40"
								>
									<ChevronLeft size={18} />
								</button>
								<span>
									{activePage + 1} / {pages}
								</span>
								<button
									type="button"
									aria-label="Next patterns"
									disabled={activePage + 1 === pages}
									onClick={() => setPage(activePage + 1)}
									className="grid size-11 place-items-center disabled:opacity-40"
								>
									<ChevronRight size={18} />
								</button>
							</div>
						)}
					</div>
				</div>
			) : (
				occurrence && (
					<>
						<div className="bg-[radial-gradient(var(--work-muted)_0.6px,transparent_0.6px)] bg-size-[24px_24px] p-8 max-sm:px-4 max-sm:py-6">
							<div className="mb-6 text-center">
								<h2 className="text-[clamp(22px,2.5vw,30px)] font-medium tracking-tight">
									Follow a website through the repeats.
								</h2>
								<p className="mt-2 text-[13px]">
									Signature in first-appearance order; return visits collapsed.
									Select a website to inspect its evidence.
								</p>
							</div>
							<fieldset
								className="flex min-w-0 justify-center px-0 py-4 max-sm:flex-wrap max-sm:gap-x-0 max-sm:gap-y-4"
								aria-label="Pattern signature websites"
							>
								{visibleSites.map((origin, index) => (
									<button
										type="button"
										key={origin}
										aria-pressed={focusedOrigin === origin}
										onClick={() => setOriginId(origin)}
										className="relative flex min-w-0 max-w-[180px] flex-1 flex-col items-center gap-2 px-2 pb-3 text-center max-sm:max-w-[50%] max-sm:basis-1/2"
									>
										<span
											className="grid size-[72px] place-items-center rounded-full border border-work-muted bg-preview-raised text-[28px] aria-pressed:bg-work-accent aria-pressed:text-work-ink"
											aria-hidden="true"
										>
											{prettySite(origin).slice(0, 1)}
										</span>
										<strong className="text-base font-medium">
											{prettySite(origin)}
										</strong>
										<small className="max-w-full break-all text-xs">
											{host(origin)}
										</small>
										{index < visibleSites.length - 1 && (
											<span
												aria-hidden="true"
												className="absolute top-9 left-[calc(50%+36px)] h-px w-[calc(100%-72px)] bg-work-muted max-sm:hidden"
											/>
										)}
									</button>
								))}
							</fieldset>
							{signature.length > 6 && (
								<div className="mt-4 flex items-center justify-center gap-4 text-xs">
									<button
										type="button"
										aria-label="Previous signature websites"
										disabled={sitePage === 0}
										onClick={() => setSitePage(sitePage - 1)}
										className="grid size-11 place-items-center disabled:opacity-40"
									>
										<ChevronLeft size={18} />
									</button>
									<span>
										Websites {sitePage * 6 + 1}–
										{Math.min(sitePage * 6 + 6, signature.length)} of{" "}
										{signature.length}
									</span>
									<button
										type="button"
										aria-label="Next signature websites"
										disabled={(sitePage + 1) * 6 >= signature.length}
										onClick={() => setSitePage(sitePage + 1)}
										className="grid size-11 place-items-center disabled:opacity-40"
									>
										<ChevronRight size={18} />
									</button>
								</div>
							)}
						</div>
						<div className="border-t border-work-muted px-8 py-6 max-sm:px-4">
							<div className="mb-5 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
								<div>
									<h3 className="text-[22px] font-medium tracking-tight">
										Find the echoes.
									</h3>
									<p className="mt-1 text-[13px]">
										{focusedOrigin ? prettySite(focusedOrigin) : "Website"}{" "}
										membership · select a dated appearance.
									</p>
								</div>
								<span className="flex items-center gap-2 text-xs">
									<Check size={15} /> Listed{" "}
									<span
										aria-hidden="true"
										className="inline-block h-px w-3 bg-current"
									/>{" "}
									Not listed
								</span>
							</div>
							<fieldset
								className="grid min-w-0 grid-cols-3 gap-2 md:grid-cols-6"
								aria-label="Supporting appearances"
							>
								{selected.occurrences
									.slice(dateStart, dateStart + 6)
									.map((item, index) => {
										const present = item.domains.includes(focusedOrigin);
										return (
											<button
												type="button"
												key={item.contextId}
												aria-label={`${date(item.startTimestamp)} ${clock(item.startTimestamp)}, ${focusedOrigin ? prettySite(focusedOrigin) : "website"} ${present ? "listed" : "not listed"}`}
												aria-pressed={step === dateStart + index}
												onClick={() => setCursor(dateStart + index)}
												className="flex min-w-0 flex-col items-center gap-2 border border-work-muted px-2 py-4 hover:border-work-accent aria-pressed:border-work-accent aria-pressed:bg-preview-raised"
											>
												<span
													className={`grid size-11 place-items-center rounded-full border border-dashed border-work-muted aria-pressed:border-solid ${present ? "border-work-accent text-work-accent" : ""}`}
													aria-hidden="true"
												>
													{present ? (
														<Check size={22} />
													) : (
														<span className="h-px w-3 bg-current" />
													)}
												</span>
												<strong className="text-sm font-medium">
													{date(item.startTimestamp)}
												</strong>
												<time className="font-mono text-xs">
													{clock(item.startTimestamp)}
												</time>
											</button>
										);
									})}
							</fieldset>
							<div className="px-0 pt-6 pb-5">
								<label
									htmlFor="echo-position"
									className="flex justify-between gap-4 text-[13px]"
								>
									Browse appearances{" "}
									<span className="font-mono">
										{step + 1} / {selected.occurrences.length}
									</span>
								</label>
								<input
									id="echo-position"
									type="range"
									min="0"
									max={Math.max(1, selected.occurrences.length - 1)}
									value={step}
									disabled={selected.occurrences.length < 2}
									aria-valuetext={`${date(occurrence.startTimestamp)} ${clock(occurrence.startTimestamp)}`}
									onChange={(event) => setCursor(Number(event.target.value))}
									className="my-1 block h-11 w-full cursor-ew-resize accent-work-accent disabled:cursor-not-allowed"
								/>
							</div>
						</div>
						<div className="flex items-center justify-between gap-6 border-t border-work-muted bg-preview-raised p-6 max-sm:flex-wrap max-sm:gap-5 max-sm:px-4">
							<div aria-live="polite" className="min-w-0">
								<h3 className="text-xl font-medium tracking-tight max-sm:text-lg">
									{date(occurrence.startTimestamp)} ·{" "}
									{clock(occurrence.startTimestamp)}–
									{clock(occurrence.endTimestamp)}
								</h3>
								<p className="mt-1 break-all text-[13px]">
									{focusedOrigin ? host(focusedOrigin) : "Website"}:{" "}
									{occurrence.domains.includes(focusedOrigin)
										? "listed in this appearance"
										: "not listed in this appearance"}
									.
								</p>
							</div>
							<div className="flex items-center gap-2 max-sm:w-full">
								<button
									type="button"
									aria-label="Previous appearance"
									disabled={step === 0}
									onClick={() => setCursor(step - 1)}
									className={buttonClass}
								>
									<ChevronLeft size={20} />
								</button>
								<button
									type="button"
									aria-label="Next appearance"
									disabled={step + 1 === selected.occurrences.length}
									onClick={() => setCursor(step + 1)}
									className={buttonClass}
								>
									<ChevronRight size={20} />
								</button>
								<button
									type="button"
									disabled={!canReplay}
									onClick={() =>
										onReplay(occurrence.startTimestamp, occurrence.endTimestamp)
									}
									className="inline-flex min-h-11 items-center justify-center gap-2 bg-work-accent px-4 text-sm text-work-ink disabled:cursor-not-allowed disabled:opacity-40 max-sm:ml-auto"
								>
									<Play size={18} /> Replay time window
								</button>
							</div>
						</div>
						<p className="bg-preview-raised px-6 pb-5 text-xs leading-relaxed max-sm:px-4">
							{!canReplay && "No website switches in this time window. "}
							Signatures group similar activity, not identical routes.
							Checkmarks show recorded website membership; replay shows switches
							within the selected time window.
						</p>
					</>
				)
			)}
		</section>
	);
};
