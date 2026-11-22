import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import { DingToaster } from "~/components/alerts/ding-toaster";
import { SiteBrowser } from "~/components/features/home/library/site-browser";
import { SearchEverythingBoard } from "~/components/features/home/search/everything-board";
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
	countsReady: Record<SearchResultKind, boolean>;
	countsApprox: Record<SearchResultKind, boolean>;
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
	onSitesStateChange: (next: SitePreview) => void;
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
	countsReady,
	countsApprox,
	results,
	notes,
	noteCountsByUrl,
	onRetrySearch,
	onUpdateNote,
	onLoadMore,
	onKindChange,
	onPeriodChange,
	onSitesStateChange,
}: SearchResultViewProps) => (
	<section aria-label="Search results" className="mt-8">
		<DingToaster position="top-center" theme="light" />
		<SearchResultFilters
			kind={kind}
			onKindChange={onKindChange}
			period={period}
			periods={searchPeriods}
			counts={counts}
			countsReady={countsReady}
			countsApprox={countsApprox}
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
				visible={kind === "Sites"}
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
				<SearchEverythingBoard
					key={`${siteRequestKey}:${kind}`}
					sites={sitePreview.sites}
					sitesLoading={sitePreview.loading}
					sitesError={sitePreview.error}
					sitesTotal={sitePreview.total}
					sitesHasMore={sitePreview.hasMore}
					onRetrySites={sitePreview.retry}
					loading={state.searching || !state.hasSearched}
					error={state.searchError}
					onRetry={onRetrySearch}
					pagesOnly={kind === "Pages"}
					notesOnly={kind === "Notes"}
					chatGptConnected={chatGptConnected}
					results={results}
					notes={notes}
					noteCountsByUrl={noteCountsByUrl}
					onUpdateNote={onUpdateNote}
					onLoadMore={onLoadMore}
					hasMorePages={state.hasMorePages}
					hasMoreNotes={state.hasMoreNotes}
					loadingMorePages={state.loadingMorePages}
					loadingMoreNotes={state.loadingMoreNotes}
					loadMorePagesError={state.loadMorePagesError}
					loadMoreNotesError={state.loadMoreNotesError}
				/>
			</div>
		)}
	</section>
);
