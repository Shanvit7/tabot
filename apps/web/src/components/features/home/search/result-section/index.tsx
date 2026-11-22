import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchResultKind } from "~/components/features/home/search/result-kinds";
import type { SearchState } from "~/components/features/home/search/state";
import {
	searchTimeRange,
	withinRange,
} from "~/components/features/home/search/utils";
import { readAssistantConnections } from "~/lib/history";
import {
	type SearchPeriod,
	type SearchPeriodOption,
	type SitePreview,
	searchPeriods,
} from "./types";
import { SearchResultView } from "./view";

const deriveSearchResults = (
	state: SearchState,
	selectedFilter: SearchPeriodOption,
	sitePreview: SitePreview,
	now: number,
) => {
	const { from, to } = searchTimeRange(selectedFilter.days, now);
	const range = { from, to };
	const withinSelectedRange = (timestamp: number) =>
		withinRange(timestamp, range, now);
	// Keep server relevance order across pages; client date sorting scrambles ranking.
	const results = state.results.filter((page) =>
		withinSelectedRange(page.lastSeen),
	);
	const pageCount = state.resultsTotal ?? state.results.length;
	const noteCount = state.notesTotal ?? state.notes.length;
	const visiblePages = state.searching || state.searchError ? 0 : pageCount;
	const visibleNotes = state.searching || state.searchError ? 0 : noteCount;
	// Load-more/retry flips loading/error again; keep loaded sites counted instead of flickering.
	const sitesBlocked =
		(sitePreview.loading || Boolean(sitePreview.error)) &&
		!sitePreview.sites.length;
	const visibleSites = sitesBlocked ? 0 : sitePreview.total;
	const counts: Record<SearchResultKind, number> = {
		Everything: visibleSites + visiblePages + visibleNotes,
		Sites: visibleSites,
		Pages: visiblePages,
		Notes: visibleNotes,
	};
	const countsReady: Record<SearchResultKind, boolean> = {
		Everything:
			!sitesBlocked &&
			state.hasSearched &&
			!state.searching &&
			!state.searchError,
		Sites: !sitesBlocked,
		Pages: state.hasSearched && !state.searching && !state.searchError,
		Notes: state.hasSearched && !state.searching && !state.searchError,
	};
	// Total unknown (legacy/truncated) + more pages => loaded count is a lower bound.
	const countsApprox: Record<SearchResultKind, boolean> = {
		Everything:
			(state.resultsTotal === null && state.hasMorePages) ||
			(state.notesTotal === null && state.hasMoreNotes),
		Sites: false,
		Pages: state.resultsTotal === null && state.hasMorePages,
		Notes: state.notesTotal === null && state.hasMoreNotes,
	};
	const notes = state.notes.filter((note) =>
		withinSelectedRange(note.createdAt),
	);
	const noteCountsByUrl = new Map<string, number>();
	for (const note of notes) {
		noteCountsByUrl.set(note.url, (noteCountsByUrl.get(note.url) ?? 0) + 1);
	}
	return { results, notes, noteCountsByUrl, counts, countsReady, countsApprox };
};
export const SearchResultSection = ({
	query,
	state,
	kind,
	onKindChange,
	period,
	now,
	onPeriodChange,
	onRetrySearch,
	onUpdateNote,
	onLoadMore,
}: {
	query: string;
	state: SearchState;
	kind: SearchResultKind;
	onKindChange: (kind: SearchResultKind) => void;
	period: SearchPeriod;
	now: number;
	onPeriodChange: (period: SearchPeriod) => void;
	onRetrySearch: () => void;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
}) => {
	const [chatGptConnected, setChatGptConnected] = useState(false);
	useEffect(() => {
		let active = true;
		const refreshConnections = async () => {
			try {
				const connections = await readAssistantConnections();
				if (active) setChatGptConnected(connections.chatgpt);
			} catch {
				if (active) setChatGptConnected(false);
			}
		};
		const refresh = () => void refreshConnections();
		refresh();
		window.addEventListener("focus", refresh);
		window.addEventListener("tabot:connection-check", refresh);
		return () => {
			active = false;
			window.removeEventListener("focus", refresh);
			window.removeEventListener("tabot:connection-check", refresh);
		};
	}, []);
	const siteRequestKey = JSON.stringify([query, period, now]);
	const [sitePreviewState, setSitePreviewState] = useState<
		SitePreview & { key: string }
	>({
		key: "",
		sites: [],
		total: 0,
		hasMore: false,
		loading: true,
		error: "",
	});
	const sitePreview = useMemo(
		() =>
			sitePreviewState.key === siteRequestKey
				? sitePreviewState
				: {
						...sitePreviewState,
						sites: [],
						total: 0,
						hasMore: false,
						loading: true,
						error: "",
					},
		[sitePreviewState, siteRequestKey],
	);
	const updateSitePreview = useCallback(
		(next: Omit<typeof sitePreviewState, "key">) =>
			setSitePreviewState({ ...next, key: siteRequestKey }),
		[siteRequestKey],
	);
	const selectedFilter =
		searchPeriods.find((filter) => filter.id === period) ?? searchPeriods[0];
	const { from: libraryFrom, to: libraryTo } = searchTimeRange(
		selectedFilter.days,
		now,
	);
	const { results, notes, noteCountsByUrl, counts, countsReady, countsApprox } =
		useMemo(
			() => deriveSearchResults(state, selectedFilter, sitePreview, now),
			[state, selectedFilter, sitePreview, now],
		);
	if (!query) return null;
	return (
		<SearchResultView
			query={query}
			state={state}
			kind={kind}
			period={period}
			chatGptConnected={chatGptConnected}
			siteRequestKey={siteRequestKey}
			sitePreview={sitePreview}
			libraryFrom={libraryFrom}
			libraryTo={libraryTo}
			counts={counts}
			countsReady={countsReady}
			countsApprox={countsApprox}
			results={results}
			notes={notes}
			noteCountsByUrl={noteCountsByUrl}
			onRetrySearch={onRetrySearch}
			onUpdateNote={onUpdateNote}
			onLoadMore={onLoadMore}
			onKindChange={onKindChange}
			onPeriodChange={onPeriodChange}
			onSitesStateChange={updateSitePreview}
		/>
	);
};
