import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { dateLabel, timeLabel } from "~/components/home/reading-desk-utils";

export const SearchNoteCards = ({
	notes,
	hasMore = false,
	loadingMore = false,
	loadMoreError = "",
	onLoadMore,
}: {
	notes: ReadingDeskSearchState["notes"];
	hasMore?: boolean;
	loadingMore?: boolean;
	loadMoreError?: string;
	onLoadMore?: () => void;
}) => {
	const scrollRef = useRef<HTMLUListElement>(null);
	const virtualizer = useVirtualizer({
		count: notes.length + Number(hasMore),
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 160,
		getItemKey: (index) => notes[index]?.id ?? "notes-loader",
		overscan: 4,
	});
	useEffect(() => {
		if (
			hasMore &&
			!loadingMore &&
			!loadMoreError &&
			virtualizer
				.getVirtualItems()
				.some(({ index }) => index >= notes.length - 3)
		)
			onLoadMore?.();
	}, [
		hasMore,
		loadMoreError,
		loadingMore,
		notes.length,
		onLoadMore,
		virtualizer,
	]);
	if (!notes.length && !hasMore) return null;
	return (
		<section aria-label="Matching notes" className="mb-8">
			<h2 className="mb-3 text-lg font-medium">Notes</h2>
			<ul
				ref={scrollRef}
				className="relative h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
			>
				<li
					aria-hidden="true"
					className="w-full"
					style={{ height: virtualizer.getTotalSize() }}
				/>
				{virtualizer.getVirtualItems().map((row) => {
					const note = notes[row.index];
					if (!note)
						return (
							<li
								key="notes-loader"
								className="absolute left-0 top-0 w-full py-3 text-center text-xs text-muted-foreground"
								style={{ transform: `translateY(${row.start}px)` }}
								role="status"
							>
								{loadMoreError ? (
									<button
										type="button"
										onClick={onLoadMore}
										className="text-destructive underline underline-offset-4"
									>
										Couldn’t load notes. Retry
									</button>
								) : loadingMore ? (
									"Loading notes…"
								) : (
									"Loading more notes on scroll"
								)}
							</li>
						);
					return (
						<li
							key={row.key}
							data-index={row.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 top-0 w-full pb-3"
							style={{ transform: `translateY(${row.start}px)` }}
						>
							<div className="rounded-xl border border-border p-4">
								<p className="whitespace-pre-wrap text-sm leading-6">
									{note.text}
								</p>
								<p className="mt-3 text-xs text-muted-foreground">
									<a
										href={note.url}
										target="_blank"
										rel="noreferrer"
										className="underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
									>
										{note.title ?? note.host}
									</a>{" "}
									· {dateLabel(note.createdAt)}
									{note.session
										? ` · Session ${timeLabel(note.session.start)}–${timeLabel(note.session.end)} UTC`
										: " · No recorded session"}
								</p>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
};
