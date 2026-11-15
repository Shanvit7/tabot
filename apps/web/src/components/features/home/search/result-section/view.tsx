import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import { DingToaster } from "~/components/alerts/ding-toaster";
import { HomeEmptyState } from "~/components/features/home/components/empty-state";
import { HomeListSkeleton } from "~/components/features/home/components/list-skeleton";
import { SiteBrowser } from "~/components/features/home/library/site-browser";
import { SearchEverythingBoard } from "~/components/features/home/search/everything-board";
import { SearchFeedback } from "~/components/features/home/search/feedback";
import { SearchResultFilters } from "~/components/features/home/search/result-filters";
import type { SearchResultKind } from "~/components/features/home/search/result-kinds";
import type { SearchState } from "~/components/features/home/search/state";
import { type SearchPeriod, type SitePreview, searchPeriods } from "./types";

type SearchResultViewProps = {
	query: string;
	state: SearchState;
	kind: SearchResultKind;
	period: SearchPeriod;
	chatGptConnected: boolean;
	siteRequestKey: string;
	sitePreview: SitePreview;
	libraryFrom: number | undefined;
	libraryTo: number | undefined;
	counts: Record<SearchResultKind, number>;
	empty: boolean;
	results: SearchState["results"];
	notes: DashboardNoteResult[];
	noteCountsByUrl: Map<string, number>;
	onRetrySearch: () => void;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
	onKindChange: (kind: SearchResultKind) => void;
	onPeriodChange: (period: SearchPeriod) => void;
	onSitesStateChange: (next: Omit<SitePreview, "key">) => void;
};

export const SearchResultView = ({
	query,
	state,
	kind,
	period,
	chatGptConnected,
	siteRequestKey,
	sitePreview,
	libraryFrom,
	libraryTo,
	counts,
	empty,
	results,
	notes,
	noteCountsByUrl,
	onRetrySearch,
	onUpdateNote,
	onLoadMore,
	onKindChange,
	onPeriodChange,
	onSitesStateChange,
}: SearchResultViewProps) => {
	const initialSearch =
		state.searching && !state.hasSearched && kind !== "Sites";
	const loadingResults = (
		<div
			className={
				kind === "Everything" ? "grid gap-4 lg:grid-cols-2" : "max-w-3xl"
			}
		>
			{kind !== "Notes" && <HomeListSkeleton kind="pages" />}
			{kind !== "Pages" && <HomeListSkeleton kind="notes" />}
		</div>
	);
	return (
		<section
			aria-label="Search results"
			aria-busy={state.searching}
			className="mt-8"
		>
			<DingToaster position="top-center" theme="light" />
			{kind !== "Sites" && (
				<SearchFeedback state={state} onRetrySearch={onRetrySearch} />
			)}
			{initialSearch ? (
				loadingResults
			) : (
				<>
					<SearchResultFilters
						kind={kind}
						onKindChange={onKindChange}
						period={period}
						periods={searchPeriods}
						counts={counts}
						onPeriodChange={(value) => onPeriodChange(value as SearchPeriod)}
					/>
					<div
						id="search-panel-sites"
						role="tabpanel"
						aria-labelledby="search-tab-sites"
						className="text-sm"
						hidden={kind !== "Sites"}
					>
						<SiteBrowser
							key={siteRequestKey}
							onSitesStateChange={onSitesStateChange}
							query={query}
							from={libraryFrom}
							to={libraryTo}
							chatGptConnected={chatGptConnected}
							onUpdateNote={onUpdateNote}
						/>
					</div>
					{kind !== "Sites" && (
						<div
							id={`search-panel-${kind.toLowerCase()}`}
							role="tabpanel"
							aria-labelledby={`search-tab-${kind.toLowerCase()}`}
							className="text-sm"
						>
							{state.searching ? (
								loadingResults
							) : empty ? (
								<HomeEmptyState kind={kind} />
							) : (
								<SearchEverythingBoard
									sites={sitePreview.sites}
									sitesLoading={sitePreview.loading}
									sitesError={sitePreview.error}
									pagesOnly={kind === "Pages"}
									notesOnly={kind === "Notes"}
									chatGptConnected={chatGptConnected}
									showEmptyStates={
										kind !== "Everything" ||
										(!sitePreview.loading && !state.searchError)
									}
									results={results}
									notes={notes}
									noteCountsByUrl={noteCountsByUrl}
									onUpdateNote={onUpdateNote}
									onLoadMore={onLoadMore}
									hasMorePages={state.hasMorePages}
									hasMoreNotes={state.hasMoreNotes}
									loadingMorePages={state.loadingMorePages}
									loadingMoreNotes={state.loadingMoreNotes}
									loadMoreError={state.loadMoreError}
								/>
							)}
						</div>
					)}
				</>
			)}
		</section>
	);
};
