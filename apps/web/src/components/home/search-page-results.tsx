import type { HistorySearchResult } from "@tabot/shared/dashboard";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { PageFavicon } from "~/components/home/page-favicon";
import { PageReader } from "~/components/home/page-reader";
import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { dateLabel, urlLabel } from "~/components/home/reading-desk-utils";
import { SearchNoteCards } from "~/components/home/search-note-cards";
import { SearchNotesCarousel } from "~/components/home/search-notes-carousel";
import { cn } from "~/lib/utils";

const pageDescription = (page: HistorySearchResult) => {
	if (page.pageExcerptAvailable) return page.excerpt;
	if (page.pageTitle) return `Page title: ${page.pageTitle}`;
	if (page.searchQueries?.length)
		return `Google search: ${page.searchQueries[0]}`;
	return "Address saved · No title or page text captured";
};

export const SearchPageResults = ({
	results,
	selected,
	noteCountsByUrl,
	notes,
	notesFirst = false,
	onSelectPage,
	onLoadMore,
	hasMorePages,
	loadingMorePages,
	loadMoreError,
}: {
	results: HistorySearchResult[];
	selected: HistorySearchResult;
	noteCountsByUrl: Map<string, number>;
	notes: ReadingDeskSearchState["notes"];
	notesFirst?: boolean;
	onSelectPage: (url: string) => void;
	onLoadMore: (list: "pages" | "notes") => void;
	hasMorePages: boolean;
	loadingMorePages: boolean;
	loadMoreError: string;
}) => {
	const scrollRef = useRef<HTMLUListElement>(null);
	const virtualizer = useVirtualizer({
		count: results.length + Number(hasMorePages),
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 160,
		getItemKey: (index) => results[index]?.url ?? "pages-loader",
		overscan: 4,
	});
	useEffect(() => {
		if (
			hasMorePages &&
			!loadingMorePages &&
			!loadMoreError &&
			virtualizer
				.getVirtualItems()
				.some(({ index }) => index >= results.length - 3)
		)
			onLoadMore("pages");
	}, [
		hasMorePages,
		loadMoreError,
		loadingMorePages,
		onLoadMore,
		results.length,
		virtualizer,
	]);
	return (
		<div className="grid items-start gap-6 md:grid-cols-5">
			<div className="flex min-w-0 flex-col gap-4 md:col-span-2">
				{notesFirst && <SearchNotesCarousel notes={notes} />}
				<ul
					ref={scrollRef}
					aria-label="Matching pages"
					className="reading-desk-list relative h-[min(65svh,42rem)] min-h-40 overflow-x-hidden overflow-y-auto overscroll-y-contain pr-2"
				>
					<li
						aria-hidden="true"
						className="w-full"
						style={{ height: virtualizer.getTotalSize() }}
					/>
					{virtualizer.getVirtualItems().map((row) => {
						const page = results[row.index];
						if (!page)
							return (
								<li
									key="pages-loader"
									role="status"
									className="absolute left-0 top-0 w-full py-3 text-center text-xs text-muted-foreground"
									style={{ transform: `translateY(${row.start}px)` }}
								>
									{loadMoreError ? (
										<button
											type="button"
											onClick={() => onLoadMore("pages")}
											className="text-destructive underline underline-offset-4"
										>
											Couldn’t load pages. Retry
										</button>
									) : loadingMorePages ? (
										"Loading pages…"
									) : (
										"Loading more pages on scroll"
									)}
								</li>
							);
						const selectedPage = selected.url === page.url;
						const noteCount = noteCountsByUrl.get(page.url) ?? 0;
						return (
							<li
								key={row.key}
								data-index={row.index}
								ref={virtualizer.measureElement}
								className="absolute left-0 top-0 w-full"
								style={{ transform: `translateY(${row.start}px)` }}
							>
								<div
									className={cn(
										"relative flex w-full items-start gap-4 border-b border-border px-3 py-4 text-left transition-colors duration-150",
										selectedPage ? "bg-work-surface" : "hover:bg-muted/60",
									)}
								>
									<button
										type="button"
										aria-pressed={selectedPage}
										onClick={() => onSelectPage(page.url)}
										aria-label={`Show details for ${urlLabel(page)}`}
										className="absolute inset-0 z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
									/>
									<PageFavicon page={page} />
									<span className="flex min-w-0 flex-1 flex-col gap-1.5">
										<a
											href={page.url}
											target="_blank"
											rel="noreferrer"
											className="relative z-20 break-all text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
										>
											{page.host}
										</a>
										<a
											href={page.url}
											target="_blank"
											rel="noreferrer"
											className="relative z-20 wrap-break-word font-medium leading-5 underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
										>
											{urlLabel(page)}
										</a>
										{noteCount > 0 && (
											<span className="text-xs text-muted-foreground">
												{noteCount} notes
											</span>
										)}
										<span className="line-clamp-2 text-sm leading-6 text-muted-foreground">
											{pageDescription(page)}
										</span>
										<span className="text-xs text-muted-foreground">
											Last seen {dateLabel(page.lastSeen)}
										</span>
									</span>
								</div>
							</li>
						);
					})}
				</ul>
			</div>
			<div className="min-w-0 space-y-6 md:col-span-3">
				<PageReader
					key={`${selected.url}-${selected.sources[0]?.id}`}
					page={selected}
				/>
				<SearchNoteCards
					notes={
						notesFirst ? [] : notes.filter((note) => note.url === selected.url)
					}
				/>
			</div>
		</div>
	);
};
