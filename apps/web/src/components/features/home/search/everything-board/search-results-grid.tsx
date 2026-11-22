import type {
	DashboardNoteResult,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import type { LibrarySite } from "@tabot/shared/library";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { HomeResultColumn } from "~/components/features/home/components/result-column";
import { ChatGptResultAction } from "~/components/features/home/library/chatgpt-result-action";
import { PageFavicon } from "~/components/features/home/library/page-favicon";
import { approxTimeSpentLabel } from "~/components/features/home/search/utils";
import { cn } from "~/lib/utils";
import { SearchNotesResults } from "./search-notes-results";
import { SearchPagesResults } from "./search-pages-results";

type SearchResultsGridProps = {
	pagesOnly: boolean;
	notesOnly: boolean;
	sites: LibrarySite[];
	sitesLoading: boolean;
	sitesError: string;
	sitesTotal: number;
	sitesHasMore: boolean;
	onRetrySites?: () => void;
	loading: boolean;
	error: string;
	onRetry?: () => void;
	chatGptConnected: boolean;
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	noteCountsByUrl: Map<string, number>;
	onLoadMore: (list: "pages" | "notes") => void;
	hasMorePages: boolean;
	hasMoreNotes: boolean;
	loadingMorePages: boolean;
	loadingMoreNotes: boolean;
	loadMorePagesError: string;
	loadMoreNotesError: string;
	onSelectPage: (page: HistorySearchResult) => void;
	onSelectNote: (note: DashboardNoteResult) => void;
};

export const SearchResultsGrid = ({
	pagesOnly,
	notesOnly,
	sites,
	sitesLoading,
	sitesError,
	sitesTotal,
	sitesHasMore,
	onRetrySites,
	loading,
	error,
	onRetry,
	chatGptConnected,
	results,
	notes,
	noteCountsByUrl,
	onLoadMore,
	hasMorePages,
	hasMoreNotes,
	loadingMorePages,
	loadingMoreNotes,
	loadMorePagesError,
	loadMoreNotesError,
	onSelectPage,
	onSelectNote,
}: SearchResultsGridProps) => {
	"use no memo"; // TanStack Virtual mutates its instance; compiler caching hides live rows.
	const pagesScrollRef = useRef<HTMLUListElement>(null);
	const notesScrollRef = useRef<HTMLUListElement>(null);
	const pagesVirtualizer = useVirtualizer({
		count: results.length + Number(hasMorePages),
		getScrollElement: () => pagesScrollRef.current,
		estimateSize: () => 170,
		useAnimationFrameWithResizeObserver: true,
		getItemKey: (index) => results[index]?.url ?? "pages-loader",
		overscan: 4,
	});
	const notesVirtualizer = useVirtualizer({
		count: notes.length + Number(hasMoreNotes),
		getScrollElement: () => notesScrollRef.current,
		estimateSize: () => 160,
		useAnimationFrameWithResizeObserver: true,
		getItemKey: (index) =>
			notes[index] ? `note:${notes[index].id}` : "notes-loader",
		overscan: 4,
	});
	const lastPageIndex = pagesVirtualizer.getVirtualItems().at(-1)?.index ?? -1;
	const lastNoteIndex = notesVirtualizer.getVirtualItems().at(-1)?.index ?? -1;
	useEffect(() => {
		if (
			!notesOnly &&
			!loading &&
			!error &&
			hasMorePages &&
			!loadingMorePages &&
			!loadMorePagesError &&
			lastPageIndex >= Math.max(0, results.length - 3)
		)
			onLoadMore("pages");
	}, [
		notesOnly,
		loading,
		error,
		hasMorePages,
		loadingMorePages,
		loadMorePagesError,
		onLoadMore,
		lastPageIndex,
		results.length,
	]);
	useEffect(() => {
		if (
			!pagesOnly &&
			!loading &&
			!error &&
			hasMoreNotes &&
			!loadingMoreNotes &&
			!loadMoreNotesError &&
			lastNoteIndex >= Math.max(0, notes.length - 3)
		)
			onLoadMore("notes");
	}, [
		pagesOnly,
		loading,
		error,
		hasMoreNotes,
		loadingMoreNotes,
		loadMoreNotesError,
		onLoadMore,
		lastNoteIndex,
		notes.length,
	]);
	return (
		<div
			className={cn(
				"grid items-start gap-8",
				!pagesOnly && !notesOnly && "grid-cols-1 lg:grid-cols-3 lg:gap-6",
			)}
		>
			{!pagesOnly && !notesOnly && (
				<HomeResultColumn
					kind="Sites"
					count={sitesTotal}
					loading={sitesLoading}
					error={sitesError}
					onRetry={onRetrySites}
				>
					<ul
						aria-label="Matching sites"
						className="max-h-[min(65svh,42rem)] overflow-y-auto overscroll-y-contain pr-1 [scrollbar-width:thin]"
					>
						{sites.map((site) => (
							<li
								key={site.site}
								className="border-b border-border last:border-0"
							>
								<div className="flex min-w-0 items-center gap-1 py-1">
									<a
										href={`https://${site.site}/`}
										target="_blank"
										rel="noreferrer"
										className="flex min-w-0 flex-1 items-center gap-3 py-3 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring"
									>
										<PageFavicon
											page={{
												url: site.url,
												host: site.site,
												favicon: site.favicon,
											}}
										/>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium underline underline-offset-4">
												{site.site}
											</span>
											<span className="mt-1 block text-xs leading-5 text-muted-foreground">
												{site.pageCount}{" "}
												{site.pageCount === 1 ? "page" : "pages"} ·{" "}
												{site.noteCount}{" "}
												{site.noteCount === 1 ? "note" : "notes"}
												{approxTimeSpentLabel(site.estimatedActiveMs) && (
													<> · {approxTimeSpentLabel(site.estimatedActiveMs)}</>
												)}
											</span>
										</span>
									</a>
									<ChatGptResultAction
										connected={chatGptConnected}
										kind="site"
										site={site.site}
									/>
								</div>
							</li>
						))}
					</ul>
					{sitesHasMore && (
						<p className="mt-3 text-xs leading-5 text-muted-foreground">
							Showing {sites.length} of {sitesTotal}. Open Sites to browse more.
						</p>
					)}
				</HomeResultColumn>
			)}
			{!notesOnly && (
				<HomeResultColumn
					kind="Pages"
					compactHeading={pagesOnly || notesOnly}
					count={results.length}
					hasMore={hasMorePages}
					loading={loading}
					error={error}
					onRetry={onRetry}
				>
					<SearchPagesResults
						{...{
							results,
							pagesScrollRef,
							pagesVirtualizer,
							onLoadMore,
							loadingMorePages,
							hasMorePages,
							noteCountsByUrl,
							chatGptConnected,
							onSelectPage,
						}}
						loadMoreError={loadMorePagesError}
					/>
				</HomeResultColumn>
			)}
			{!pagesOnly && (
				<HomeResultColumn
					kind="Notes"
					compactHeading={pagesOnly || notesOnly}
					count={notes.length}
					hasMore={hasMoreNotes}
					loading={loading}
					error={error}
					onRetry={onRetry}
				>
					<SearchNotesResults
						{...{
							notes,
							notesScrollRef,
							notesVirtualizer,
							onLoadMore,
							loadingMoreNotes,
							hasMoreNotes,
							onSelectNote,
						}}
						loadMoreError={loadMoreNotesError}
					/>
				</HomeResultColumn>
			)}
		</div>
	);
};
