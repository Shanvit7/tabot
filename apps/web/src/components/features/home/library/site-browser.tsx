import {
	type LibraryRequest,
	type LibrarySite,
	rankLibrarySites,
} from "@tabot/shared/library";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HomeEmptyState } from "~/components/features/home/components/empty-state";
import { HomeListSkeleton } from "~/components/features/home/components/list-skeleton";
import { ChatGptResultAction } from "~/components/features/home/library/chatgpt-result-action";
import { PageFavicon } from "~/components/features/home/library/page-favicon";
import { useLibrary } from "~/components/features/home/library/use-library";
import { SearchEverythingBoard } from "~/components/features/home/search/everything-board";
import {
	approxTimeSpentLabel,
	dateLabel,
} from "~/components/features/home/search/utils";
import { Button } from "~/components/ui/button";

type Props = {
	onSitesStateChange: (state: {
		sites: LibrarySite[];
		total: number;
		hasMore: boolean;
		loading: boolean;
		error: string;
	}) => void;
	query: string;
	from?: number;
	to?: number;
	chatGptConnected: boolean;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
};

const LibraryEntries = ({
	request,
	onOpenSite,
	onUpdateNote,
	onSitesStateChange,
	chatGptConnected,
}: {
	request: LibraryRequest;
	onOpenSite: (site: string) => void;
	onUpdateNote: Props["onUpdateNote"];
	onSitesStateChange: Props["onSitesStateChange"];
	chatGptConnected: boolean;
}) => {
	const { data, loading, error, retry, loadMore } = useLibrary(request);
	const sites = useMemo(
		() => rankLibrarySites(data.sites, request.query ?? ""),
		[data.sites, request.query],
	);
	const scrollRef = useRef<HTMLUListElement>(null);
	const virtualizer = useVirtualizer({
		count: sites.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 100,
		useAnimationFrameWithResizeObserver: true,
		overscan: 4,
		getItemKey: (index) => sites[index]?.site ?? index,
	});
	useEffect(() => {
		if (request.level === "sites") {
			// react-doctor-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent, react-doctor/no-prop-callback-in-effect -- parent needs this paginated site preview for search counts.
			onSitesStateChange({
				sites,
				total: data.total,
				hasMore: data.hasMore,
				loading,
				error,
			});
		}
	}, [data, error, loading, onSitesStateChange, request.level, sites]);
	return (
		<div className="flex flex-col gap-4" aria-busy={loading}>
			<p className="sr-only" aria-live="polite">
				{data.total} {request.level === "sites" ? "sites" : "pages"}
				{request.query ? " matching your search" : " in retained history"}
			</p>
			{request.level === "sites" ? (
				!loading && !error && !data.total ? (
					<HomeEmptyState kind="Sites" />
				) : (
					<ul
						ref={scrollRef}
						onScroll={(event) => {
							const list = event.currentTarget;
							if (list.scrollHeight - list.scrollTop - list.clientHeight < 250)
								loadMore();
						}}
						aria-label="Sites"
						className="relative h-[min(60svh,36rem)] min-h-32 overflow-y-auto overscroll-y-contain scrollbar-thin"
					>
						<li
							aria-hidden="true"
							style={{ height: virtualizer.getTotalSize() }}
						/>
						{virtualizer.getVirtualItems().map((row) => {
							const site = sites[row.index];
							return (
								site && (
									<li
										key={row.key}
										data-index={row.index}
										ref={virtualizer.measureElement}
										className="absolute left-0 top-0 w-full pb-3"
										style={{ transform: `translateY(${row.start}px)` }}
									>
										<div className="relative flex min-h-20 items-center gap-3 rounded-xl border border-border bg-work-surface px-4 py-3 transition-colors hover:bg-muted/40 focus-within:border-work-ink">
											<button
												type="button"
												onClick={() => onOpenSite(site.site)}
												aria-label={`Browse pages on ${site.site}`}
												className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											/>
											<PageFavicon
												page={{
													url: site.url,
													host: site.site,
													favicon: site.favicon,
												}}
											/>
											<div className="min-w-0 flex-1">
												<a
													href={`https://${site.site}/`}
													target="_blank"
													rel="noreferrer"
													className="relative truncate text-base font-medium underline underline-offset-4 hover:decoration-2"
												>
													{site.site}
												</a>
												<p className="text-sm tabular-nums text-muted-foreground">
													{site.pageCount}{" "}
													{site.pageCount === 1 ? "page" : "pages"} ·{" "}
													{site.noteCount}{" "}
													{site.noteCount === 1 ? "note" : "notes"}
													{approxTimeSpentLabel(site.estimatedActiveMs) && (
														<>
															{" "}
															· {approxTimeSpentLabel(site.estimatedActiveMs)}
														</>
													)}
												</p>
											</div>
											<span className="hidden text-xs text-muted-foreground sm:inline">
												{dateLabel(site.lastSeen)}
											</span>
											<ChatGptResultAction
												connected={chatGptConnected}
												kind="site"
												site={site.site}
											/>
											<ChevronRight
												aria-hidden="true"
												className="size-4 shrink-0 text-muted-foreground"
											/>
										</div>
									</li>
								)
							);
						})}
						{loading && (
							<li
								className="absolute left-0 top-0 w-full"
								style={{
									transform: `translateY(${virtualizer.getTotalSize()}px)`,
								}}
							>
								<HomeListSkeleton kind="sites" count={sites.length ? 1 : 3} />
							</li>
						)}
					</ul>
				)
			) : (
				<SearchEverythingBoard
					pagesOnly
					chatGptConnected={chatGptConnected}
					results={data.pages}
					notes={[]}
					noteCountsByUrl={
						new Map(data.pages.map((page) => [page.url, page.noteCount]))
					}
					onUpdateNote={onUpdateNote}
					onLoadMore={() => (error ? retry() : loadMore())}
					hasMorePages={data.hasMore}
					hasMoreNotes={false}
					loadingMorePages={loading}
					loadingMoreNotes={false}
					loadMoreError={error}
				/>
			)}
			{error && (
				<div role="alert" className="flex flex-col items-start gap-2">
					<p className="text-sm text-destructive">{error}</p>
					<Button variant="outline" onClick={retry}>
						Retry {request.level}
					</Button>
				</div>
			)}
			{data.hasMore && request.level === "sites" && !error && (
				<Button
					variant="outline"
					className="self-start"
					disabled={loading}
					onClick={loadMore}
				>
					Load more sites
				</Button>
			)}
		</div>
	);
};

export const SiteBrowser = ({
	query,
	from,
	to,
	onUpdateNote,
	onSitesStateChange,
	chatGptConnected,
}: Props) => {
	const [site, setSite] = useState<string | null>(null);
	return (
		<section
			aria-label="Browse sites and pages"
			className="flex flex-col gap-4"
		>
			{site && (
				<nav aria-label="Library breadcrumb">
					<ol className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
						<li>
							<Button variant="ghost" onClick={() => setSite(null)}>
								Sites
							</Button>
						</li>
						<li aria-hidden="true">
							<ChevronRight className="size-4 text-muted-foreground" />
						</li>
						<li aria-current="page" className="break-all font-medium">
							{site}
						</li>
					</ol>
				</nav>
			)}
			<LibraryEntries
				key={site ?? "sites"}
				request={{
					level: site ? "pages" : "sites",
					...(site ? { site } : {}),
					query,
					from,
					to,
					limit: 20,
				}}
				onOpenSite={setSite}
				onUpdateNote={onUpdateNote}
				onSitesStateChange={onSitesStateChange}
				chatGptConnected={chatGptConnected}
			/>
		</section>
	);
};
