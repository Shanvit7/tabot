import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import { useEffect, useState } from "react";
import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { SearchEverythingBoard } from "~/components/home/search-everything-board";
import { SearchFeedback } from "~/components/home/search-feedback";
import { SearchNoteCards } from "~/components/home/search-note-cards";
import { SearchPageResults } from "~/components/home/search-page-results";
import { SearchResultFilters } from "~/components/home/search-result-filters";
import { Tabs, TabsContent } from "~/components/ui/tabs";

const filters = [
	{ id: "any", label: "Any time", days: Infinity },
	{ id: "today", label: "Today", days: 1 },
	{ id: "yesterday", label: "Yesterday", days: 2 },
	{ id: "week", label: "Last 7 days", days: 7 },
	{ id: "month", label: "Last 30 days", days: 30 },
] as const;
const withinRange = (value: number, days: number, now: number) => {
	if (!Number.isFinite(days)) return true;
	const age = now - value;
	return (
		age >= 0 &&
		age < days * 24 * 60 * 60 * 1000 &&
		(days !== 2 || age >= 24 * 60 * 60 * 1000)
	);
};

export const SearchResultSection = ({
	query,
	state,
	onRetrySearch,
	onSelectPage,
	onUpdateNote,
	onLoadMore,
	onEmptyChange,
}: {
	query: string;
	state: ReadingDeskSearchState;
	onRetrySearch: () => void;
	onSelectPage: (url: string) => void;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
	onEmptyChange: (empty: boolean) => void;
}) => {
	const [period, setPeriod] = useState<(typeof filters)[number]["id"]>("any");
	const [kind, setKind] = useState<"Everything" | "Pages" | "Notes">(
		"Everything",
	);
	const selectedFilter =
		filters.find((filter) => filter.id === period) ?? filters[0];
	const now = Date.now();
	const results = state.results
		.filter(
			(page) =>
				(kind !== "Notes" ||
					state.notes.some((note) => note.url === page.url)) &&
				(kind !== "Notes" ||
					withinRange(
						state.notes.find((note) => note.url === page.url)?.createdAt ??
							page.lastSeen,
						selectedFilter.days,
						now,
					)) &&
				(kind === "Notes" ||
					withinRange(page.lastSeen, selectedFilter.days, now)),
		)
		.sort((a, b) => b.lastSeen - a.lastSeen);
	const notes: DashboardNoteResult[] = state.notes
		.filter(
			(note) =>
				kind !== "Pages" &&
				withinRange(note.createdAt, selectedFilter.days, now),
		)
		.sort((a, b) => b.createdAt - a.createdAt);
	const noteCountsByUrl = new Map<string, number>();
	for (const note of notes) {
		noteCountsByUrl.set(note.url, (noteCountsByUrl.get(note.url) ?? 0) + 1);
	}
	const selected =
		results.find((page) => page.url === state.selectedUrl) ?? results[0];
	const empty =
		!state.searching && !state.searchError && !results.length && !notes.length;
	useEffect(
		() => onEmptyChange(Boolean(query && empty)),
		[empty, onEmptyChange, query],
	);
	if (!query) return null;
	return (
		<section
			aria-label="Search results"
			aria-busy={state.searching}
			className="mt-8"
		>
			<SearchFeedback state={state} onRetrySearch={onRetrySearch} />
			{!state.searching && (
				<Tabs
					value={kind}
					onValueChange={(value) => setKind(value as typeof kind)}
				>
					<SearchResultFilters
						period={period}
						periods={filters}
						onPeriodChange={(value) => setPeriod(value as typeof period)}
					/>
					<TabsContent value={kind}>
						{kind === "Everything" ? (
							<SearchEverythingBoard
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
						) : selected ? (
							<SearchPageResults
								results={results}
								selected={selected}
								noteCountsByUrl={noteCountsByUrl}
								notes={notes}
								onSelectPage={onSelectPage}
								onLoadMore={onLoadMore}
								hasMorePages={state.hasMorePages}
								loadingMorePages={state.loadingMorePages}
								loadMoreError={state.loadMoreError}
							/>
						) : null}
						{kind === "Notes" && (
							<SearchNoteCards
								notes={notes.filter((note) => note.url !== selected?.url)}
								hasMore={state.hasMoreNotes}
								loadingMore={state.loadingMoreNotes}
								loadMoreError={state.loadMoreError}
								onLoadMore={() => onLoadMore("notes")}
							/>
						)}
					</TabsContent>
				</Tabs>
			)}
		</section>
	);
};
