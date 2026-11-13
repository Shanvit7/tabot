import type { HistorySearchResult } from "@tabot/shared/dashboard";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import { HomeEmptyState } from "~/components/features/home/components/empty-state";
import { HomeListSkeleton } from "~/components/features/home/components/list-skeleton";
import { ChatGptResultAction } from "~/components/features/home/library/chatgpt-result-action";
import { PageFavicon } from "~/components/features/home/library/page-favicon";
import {
	approxTimeSpentLabel,
	dateLabel,
	urlLabel,
} from "~/components/features/home/search/utils";

const description = (page: HistorySearchResult) => {
	if (page.pageExcerptAvailable) return page.excerpt;
	if (page.pageTitle) return `Page title: ${page.pageTitle}`;
	if (page.searchQueries?.length)
		return `Google search: ${page.searchQueries[0]}`;
	return "Address saved · No title or page text captured";
};

export const SearchPagesResults = ({
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
}: {
	results: HistorySearchResult[];
	pagesScrollRef: RefObject<HTMLUListElement | null>;
	pagesVirtualizer: Virtualizer<HTMLUListElement, Element>;
	loadMoreError: string;
	onLoadMore: (list: "pages" | "notes") => void;
	loadingMorePages: boolean;
	hasMorePages: boolean;
	showEmptyStates: boolean;
	noteCountsByUrl: Map<string, number>;
	chatGptConnected: boolean;
	onSelectPage: (page: HistorySearchResult) => void;
}) => (
	<section aria-label="Matching pages" className="min-w-0">
		<ul
			ref={pagesScrollRef}
			aria-label="Matching pages"
			className="relative h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 motion-reduce:scroll-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
		>
			<li
				aria-hidden="true"
				className="w-full"
				style={{ height: pagesVirtualizer.getTotalSize() }}
			/>
			{pagesVirtualizer.getVirtualItems().map((virtualRow) => {
				const page = results[virtualRow.index];
				if (!page)
					return (
						<li
							key="pages-loader"
							className="absolute left-0 top-0 w-full pb-2"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{loadMoreError ? (
								<button
									type="button"
									onClick={() => onLoadMore("pages")}
									className="w-full cursor-pointer py-3 text-center text-xs text-destructive underline underline-offset-4"
								>
									Couldn’t load pages. Retry
								</button>
							) : (
								<div
									role="status"
									className="py-3 text-center text-xs text-muted-foreground"
								>
									{loadingMorePages ? (
										<HomeListSkeleton kind="pages" count={1} />
									) : null}
								</div>
							)}
						</li>
					);
				return (
					<li
						key={virtualRow.key}
						data-index={virtualRow.index}
						ref={pagesVirtualizer.measureElement}
						className="absolute left-0 top-0 w-full pb-2"
						style={{ transform: `translateY(${virtualRow.start}px)` }}
					>
						<div className="relative flex min-h-28 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-work-surface p-2.5 transition-colors hover:border-work-ink/40 hover:bg-muted/40 sm:p-3">
							<button
								type="button"
								onClick={() => onSelectPage(page)}
								aria-label={`Show details for ${urlLabel(page)}`}
								className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							/>
							<span className="flex min-w-0 items-center gap-2">
								<PageFavicon page={page} />
								<a
									href={page.url}
									target="_blank"
									rel="noreferrer"
									className="relative z-20 truncate text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
								>
									{page.host}
								</a>
							</span>
							<a
								href={page.url}
								target="_blank"
								rel="noreferrer"
								className="relative z-20 line-clamp-2 w-full wrap-break-word text-sm font-medium leading-5 underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
							>
								{urlLabel(page)}
							</a>
							<p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
								{description(page)}
							</p>
							<div className="mt-auto flex w-full items-center justify-between gap-2">
								<span className="text-xs tabular-nums text-muted-foreground">
									{noteCountsByUrl.get(page.url)
										? `${noteCountsByUrl.get(page.url)} notes · `
										: ""}
									{dateLabel(page.lastSeen)}
									{approxTimeSpentLabel(page.estimatedActiveMs) && (
										<> · {approxTimeSpentLabel(page.estimatedActiveMs)}</>
									)}
								</span>
								<ChatGptResultAction
									connected={chatGptConnected}
									kind="page"
									host={page.host}
									url={page.url}
								/>
							</div>
						</div>
					</li>
				);
			})}
			{!results.length && loadingMorePages && !hasMorePages && (
				<li className="p-2">
					<HomeListSkeleton kind="pages" />
				</li>
			)}
			{showEmptyStates &&
				!results.length &&
				!hasMorePages &&
				!loadingMorePages && (
					<li className="py-2">
						<HomeEmptyState kind="Pages" compact />
					</li>
				)}
		</ul>
	</section>
);
