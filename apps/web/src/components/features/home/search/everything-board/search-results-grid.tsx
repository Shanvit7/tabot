import type {
	DashboardNoteResult,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import type { LibrarySite } from "@tabot/shared/library";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { HomeEmptyState } from "~/components/features/home/components/empty-state";
import { HomeListSkeleton } from "~/components/features/home/components/list-skeleton";
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
	chatGptConnected: boolean;
	showEmptyStates: boolean;
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	noteCountsByUrl: Map<string, number>;
	onLoadMore: (list: "pages" | "notes") => void;
	hasMorePages: boolean;
	hasMoreNotes: boolean;
	loadingMorePages: boolean;
	loadingMoreNotes: boolean;
	loadMoreError: string;
	onSelectPage: (page: HistorySearchResult) => void;
	onSelectNote: (note: DashboardNoteResult) => void;
};

export const SearchResultsGrid = ({
	pagesOnly,
	notesOnly,
	sites,
	sitesLoading,
	sitesError,
	chatGptConnected,
	showEmptyStates,
	results,
	notes,
	noteCountsByUrl,
	onLoadMore,
	hasMorePages,
	hasMoreNotes,
	loadingMorePages,
	loadingMoreNotes,
	loadMoreError,
	onSelectPage,
	onSelectNote,
}: SearchResultsGridProps) => {
	const pagesScrollRef = useRef<HTMLUListElement>(null);
	const notesScrollRef = useRef<HTMLUListElement>(null);
	const pagesVirtualizer = useVirtualizer({
		count: results.length + Number(hasMorePages),
		getScrollElement: () => pagesScrollRef.current,
		estimateSize: () => 140,
		useAnimationFrameWithResizeObserver: true,
		getItemKey: (index) => results[index]?.url ?? "pages-loader",
		overscan: 4,
	});
	const notesVirtualizer = useVirtualizer({
		count: notes.length + Number(hasMoreNotes),
		getScrollElement: () => notesScrollRef.current,
		estimateSize: () => 150,
		useAnimationFrameWithResizeObserver: true,
		getItemKey: (index) => notes[index]?.id ?? "notes-loader",
		overscan: 4,
	});
	useEffect(() => {
		if (
			hasMorePages &&
			!loadingMorePages &&
			!loadMoreError &&
			pagesVirtualizer
				.getVirtualItems()
				.some(({ index }) => index >= results.length - 3)
		)
			onLoadMore("pages");
	}, [
		hasMorePages,
		loadingMorePages,
		loadMoreError,
		onLoadMore,
		pagesVirtualizer,
		results.length,
	]);
	useEffect(() => {
		if (
			hasMoreNotes &&
			!loadingMoreNotes &&
			!loadMoreError &&
			notesVirtualizer
				.getVirtualItems()
				.some(({ index }) => index >= notes.length - 3)
		)
			onLoadMore("notes");
	}, [
		hasMoreNotes,
		loadingMoreNotes,
		loadMoreError,
		notes.length,
		notesVirtualizer,
		onLoadMore,
	]);
	return (
		<div
			className={cn(
				"grid items-start gap-3 sm:gap-5",
				!pagesOnly && !notesOnly && "grid-cols-1 md:grid-cols-3",
			)}
		>
			{!pagesOnly && !notesOnly && (
				<section aria-label="Matching sites" className="min-w-0">
					<ul className="max-h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-width:thin]">
						{sites.map((site) => (
							<li
								key={site.site}
								className="border-b border-border last:border-0"
							>
								<div className="flex min-w-0 items-center gap-1">
									<a
										href={`https://${site.site}/`}
										target="_blank"
										rel="noreferrer"
										className="flex min-w-0 flex-1 items-center gap-2 py-3 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring"
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
											<span className="block text-xs text-muted-foreground">
												{site.pageCount} pages · {site.noteCount} notes
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
						{!sites.length &&
							(sitesLoading || Boolean(sitesError) || showEmptyStates) && (
								<li className="py-3 text-xs text-muted-foreground">
									{sitesError ||
										(sitesLoading ? (
											<HomeListSkeleton kind="sites" count={2} />
										) : (
											<HomeEmptyState kind="Sites" compact />
										))}
								</li>
							)}
					</ul>
				</section>
			)}
			{!notesOnly && (
				<SearchPagesResults
					{...{
						results,
						pagesScrollRef,
						pagesVirtualizer,
						loadMoreError,
						onLoadMore,
						loadingMorePages,
						hasMorePages,
						showEmptyStates,
						noteCountsByUrl,
						chatGptConnected,
						onSelectPage,
					}}
				/>
			)}
			{!pagesOnly && (
				<SearchNotesResults
					{...{
						notes,
						notesScrollRef,
						notesVirtualizer,
						loadMoreError,
						onLoadMore,
						loadingMoreNotes,
						hasMoreNotes,
						showEmptyStates,
						onSelectNote,
					}}
				/>
			)}
		</div>
	);
};
