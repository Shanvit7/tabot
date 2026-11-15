import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import { HomeEmptyState } from "~/components/features/home/components/empty-state";
import { HomeListSkeleton } from "~/components/features/home/components/list-skeleton";
import { PageFavicon } from "~/components/features/home/library/page-favicon";
import { dateLabel } from "~/components/features/home/search/utils";

export const SearchNotesResults = ({
	notes,
	notesScrollRef,
	notesVirtualizer,
	loadMoreError,
	onLoadMore,
	loadingMoreNotes,
	hasMoreNotes,
	showEmptyStates,
	onSelectNote,
}: {
	notes: DashboardNoteResult[];
	notesScrollRef: RefObject<HTMLUListElement | null>;
	notesVirtualizer: Virtualizer<HTMLUListElement, Element>;
	loadMoreError: string;
	onLoadMore: (list: "pages" | "notes") => void;
	loadingMoreNotes: boolean;
	hasMoreNotes: boolean;
	showEmptyStates: boolean;
	onSelectNote: (note: DashboardNoteResult) => void;
}) => (
	<section aria-label="Matching notes" className="min-w-0">
		<ul
			ref={notesScrollRef}
			aria-label="Matching notes"
			className="relative h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 motion-reduce:scroll-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
		>
			<li
				aria-hidden="true"
				className="w-full"
				style={{ height: notesVirtualizer.getTotalSize() }}
			/>
			{notesVirtualizer.getVirtualItems().map((virtualRow) => {
				const note = notes[virtualRow.index];
				if (!note)
					return (
						<li
							key="notes-loader"
							className="absolute left-0 top-0 w-full pb-2"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{loadMoreError ? (
								<button
									type="button"
									onClick={() => onLoadMore("notes")}
									className="w-full cursor-pointer py-3 text-center text-xs text-destructive underline underline-offset-4"
								>
									Couldn’t load notes. Retry
								</button>
							) : (
								<div
									role="status"
									className="py-3 text-center text-xs text-muted-foreground"
								>
									{loadingMoreNotes ? (
										<HomeListSkeleton kind="notes" count={1} />
									) : null}
								</div>
							)}
						</li>
					);
				return (
					<li
						key={virtualRow.key}
						data-index={virtualRow.index}
						ref={notesVirtualizer.measureElement}
						className="absolute left-0 top-0 w-full pb-2"
						style={{ transform: `translateY(${virtualRow.start}px)` }}
					>
						<div className="relative flex min-h-28 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-work-surface p-2.5 text-left transition-colors hover:border-work-ink/40 hover:bg-muted/40 sm:p-3">
							<button
								type="button"
								onClick={() => onSelectNote(note)}
								aria-label={`Show note details from ${note.host}`}
								className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							/>
							<span className="flex w-full min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
								<span className="flex min-w-0 items-center gap-2">
									<PageFavicon page={note} />
									<a
										href={note.url}
										target="_blank"
										rel="noreferrer"
										className="relative z-20 truncate underline-offset-4 hover:underline focus-visible:underline"
									>
										{note.host}
									</a>
								</span>
								<time
									className="shrink-0 tabular-nums"
									dateTime={new Date(note.updatedAt).toISOString()}
								>
									{dateLabel(note.updatedAt)}
								</time>
							</span>
							<span className="line-clamp-3 w-full whitespace-pre-wrap wrap-break-word text-sm leading-5">
								{note.text}
							</span>
							<div className="mt-auto flex w-full min-w-0 items-center justify-between gap-2">
								<a
									href={note.url}
									target="_blank"
									rel="noreferrer"
									className="relative z-20 line-clamp-1 min-w-0 text-xs text-muted-foreground underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
								>
									{note.title ?? note.host}
								</a>
							</div>
						</div>
					</li>
				);
			})}
			{!notes.length && loadingMoreNotes && !hasMoreNotes && (
				<li className="p-2">
					<HomeListSkeleton kind="notes" />
				</li>
			)}
			{showEmptyStates &&
				!notes.length &&
				!hasMoreNotes &&
				!loadingMoreNotes && (
					<li className="py-2">
						<HomeEmptyState kind="Notes" compact />
					</li>
				)}
		</ul>
	</section>
);
