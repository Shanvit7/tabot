import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import type { LibrarySite } from "@tabot/shared/library";
import { useCallback, useEffect, useState } from "react";
import type { SearchResultKind } from "~/components/features/home/search/result-kinds";
import type { SearchState } from "~/components/features/home/search/state";
import { withinRange } from "~/components/features/home/search/utils";
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
	kind: SearchResultKind,
	selectedFilter: SearchPeriodOption,
	sitePreview: SitePreview,
	now: number,
) => {
	const withinSelectedRange = (timestamp: number) =>
		withinRange(timestamp, selectedFilter.days, now);
	const firstNoteByUrl = new Map<string, DashboardNoteResult>();
	for (const note of state.notes) {
		if (!firstNoteByUrl.has(note.url)) firstNoteByUrl.set(note.url, note);
	}
	const results = state.results
		.filter((page) => {
			const note = firstNoteByUrl.get(page.url);
			return (
				(kind !== "Notes" || Boolean(note)) &&
				(kind !== "Notes" ||
					withinSelectedRange(note?.createdAt ?? page.lastSeen)) &&
				(kind === "Notes" || withinSelectedRange(page.lastSeen))
			);
		})
		.sort((a, b) => b.lastSeen - a.lastSeen);
	const pageCount = state.results.filter((page) =>
		withinSelectedRange(page.lastSeen),
	).length;
	const noteCount = state.notes.filter((note) =>
		withinSelectedRange(note.createdAt),
	).length;
	const counts: Record<SearchResultKind, number> = state.searching
		? { Everything: 0, Sites: 0, Pages: 0, Notes: 0 }
		: {
				Everything: sitePreview.total + pageCount + noteCount,
				Sites: sitePreview.total,
				Pages: pageCount,
				Notes: noteCount,
			};
	const notes = state.notes
		.filter((note) => kind !== "Pages" && withinSelectedRange(note.createdAt))
		.sort((a, b) => b.createdAt - a.createdAt);
	const noteCountsByUrl = new Map<string, number>();
	for (const note of notes) {
		noteCountsByUrl.set(note.url, (noteCountsByUrl.get(note.url) ?? 0) + 1);
	}
	const empty =
		!state.searching &&
		!state.searchError &&
		(kind === "Everything"
			? !sitePreview.loading &&
				!sitePreview.error &&
				!sitePreview.total &&
				!results.length &&
				!notes.length
			: kind === "Pages"
				? !results.length
				: kind === "Notes"
					? !notes.length
					: false);
	return { results, notes, noteCountsByUrl, counts, empty };
};
export const SearchResultSection = ({
	query,
	state,
	onRetrySearch,
	onUpdateNote,
	onLoadMore,
}: {
	query: string;
	state: SearchState;
	onRetrySearch: () => void;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
}) => {
	const [period, setPeriod] = useState<SearchPeriod>("today");
	const [kind, setKind] = useState<SearchResultKind>("Everything");
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
	const siteRequestKey = `${query}:${period}`;
	const [sitePreviewState, setSitePreviewState] = useState<{
		key: string;
		sites: LibrarySite[];
		total: number;
		hasMore: boolean;
		loading: boolean;
		error: string;
	}>({
		key: "",
		sites: [],
		total: 0,
		hasMore: false,
		loading: true,
		error: "",
	});
	const sitePreview =
		sitePreviewState.key === siteRequestKey
			? sitePreviewState
			: {
					...sitePreviewState,
					sites: [],
					total: 0,
					hasMore: false,
					loading: true,
					error: "",
				};
	const updateSitePreview = useCallback(
		(next: Omit<typeof sitePreviewState, "key">) =>
			setSitePreviewState({ ...next, key: siteRequestKey }),
		[siteRequestKey],
	);
	const [now] = useState(Date.now);
	const selectedFilter =
		searchPeriods.find((filter) => filter.id === period) ?? searchPeriods[0];
	const libraryFrom = Number.isFinite(selectedFilter.days)
		? now - selectedFilter.days * 86_400_000
		: undefined;
	const libraryTo =
		selectedFilter.days === 2
			? now - 86_400_000
			: Number.isFinite(selectedFilter.days)
				? now
				: undefined;
	const { results, notes, noteCountsByUrl, counts, empty } =
		deriveSearchResults(state, kind, selectedFilter, sitePreview, now);
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
			empty={empty}
			results={results}
			notes={notes}
			noteCountsByUrl={noteCountsByUrl}
			onRetrySearch={onRetrySearch}
			onUpdateNote={onUpdateNote}
			onLoadMore={onLoadMore}
			onKindChange={setKind}
			onPeriodChange={setPeriod}
			onSitesStateChange={updateSitePreview}
		/>
	);
};
