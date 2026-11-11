// biome-ignore-all lint/a11y/noNoninteractiveTabindex: the scrollable note region needs keyboard access.
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { dateLabel } from "~/components/home/reading-desk-utils";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export const SearchNotesCarousel = ({
	notes,
}: {
	notes: ReadingDeskSearchState["notes"];
}) => {
	const railRef = useRef<HTMLUListElement>(null);
	const railId = useId();
	const [canPrevious, setCanPrevious] = useState(false);
	const [canNext, setCanNext] = useState(false);
	const updateScroll = useCallback(() => {
		const rail = railRef.current;
		if (!rail) return;
		setCanPrevious(rail.scrollLeft > 1);
		setCanNext(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh overflow controls when note count changes.
	useEffect(() => {
		const rail = railRef.current;
		if (!rail) return;
		updateScroll();
		const observer = new ResizeObserver(updateScroll);
		observer.observe(rail);
		return () => observer.disconnect();
	}, [notes.length, updateScroll]);
	const move = (direction: -1 | 1) => {
		const rail = railRef.current;
		if (rail) rail.scrollBy({ left: direction * rail.clientWidth });
	};
	if (!notes.length) return null;
	return (
		<section
			aria-label="Matching notes"
			aria-roledescription={notes.length > 1 ? "carousel" : undefined}
			className="min-w-0 shrink-0"
		>
			<div className="mb-1 flex items-center justify-between gap-3">
				<h2 className="text-sm font-medium">
					Notes{" "}
					<span className="ml-1 text-sm font-normal tabular-nums text-muted-foreground">
						{notes.length}
					</span>
				</h2>
				{notes.length > 1 && (
					<div className="flex gap-2">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-11 cursor-pointer rounded-full"
							aria-label="Previous notes"
							aria-controls={railId}
							disabled={!canPrevious}
							onClick={() => move(-1)}
						>
							<ArrowLeft aria-hidden="true" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-11 cursor-pointer rounded-full"
							aria-label="Next notes"
							aria-controls={railId}
							disabled={!canNext}
							onClick={() => move(1)}
						>
							<ArrowRight aria-hidden="true" />
						</Button>
					</div>
				)}
			</div>
			<ul
				id={railId}
				ref={railRef}
				onScroll={updateScroll}
				className="flex items-start snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-1 px-1 pb-1 pt-1 motion-reduce:scroll-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
			>
				{notes.map((note) => (
					<li
						key={note.id}
						className={cn(
							"flex shrink-0 snap-start flex-col gap-2 rounded-xl border border-border bg-work-surface p-3 transition-colors duration-150 focus-within:border-work-ink hover:border-work-ink/40",
							notes.length === 1
								? "w-full"
								: "w-[min(20rem,calc(100%_-_2rem))]",
						)}
					>
						<div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
							<a
								href={note.url}
								target="_blank"
								rel="noreferrer"
								className="truncate underline-offset-4 hover:underline focus-visible:underline"
							>
								{note.host}
							</a>
							<time
								dateTime={new Date(note.createdAt).toISOString()}
								className="shrink-0 tabular-nums"
							>
								{dateLabel(note.createdAt)}
							</time>
						</div>
						<section
							aria-label={`Note from ${note.host}`}
							tabIndex={0}
							className="max-h-24 overflow-y-auto overscroll-y-contain scroll-smooth rounded-sm pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:scroll-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
						>
							<p className="whitespace-pre-wrap wrap-break-word text-sm leading-6">
								{note.text}
							</p>
						</section>
						<div className="flex min-w-0 items-center">
							<a
								href={note.url}
								target="_blank"
								rel="noreferrer"
								title={note.title ?? note.host}
								className="min-w-0 truncate text-xs text-muted-foreground underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
							>
								{note.title ?? note.host}
							</a>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
};
