import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import type { LibrarySite } from "@tabot/shared/library";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { SearchEverythingBoard } from "~/components/home/search-everything-board";
import { SearchFeedback } from "~/components/home/search-feedback";
import {
	SearchResultFilters,
	type SearchResultKind,
} from "~/components/home/search-result-filters";
import { SiteBrowser } from "~/components/home/site-browser";
import { readHistoryCounts } from "~/lib/history";

const filters = [
	{ id: "today", label: "Today", days: 1 },
	{ id: "yesterday", label: "Yesterday", days: 2 },
	{ id: "week", label: "Last 7 days", days: 7 },
	{ id: "month", label: "Last 30 days", days: 30 },
	{ id: "any", label: "Time machine", days: Infinity },
] as const;
export const withinRange = (
	value: number,
	days: number,
	now: number,
	fromDate?: string,
	toDate?: string,
	fromTime = "00:00:00",
	toTime = "23:59:59",
) => {
	const dayMs = 24 * 60 * 60 * 1000;
	const from = fromDate
		? new Date(`${fromDate}T${fromTime}`).getTime()
		: -Infinity;
	const to = toDate ? new Date(`${toDate}T${toTime}.999`).getTime() : Infinity;
	if (value < from || value > to || from > to) return false;
	if (!Number.isFinite(days)) return true;
	const age = now - value;
	return age >= 0 && age < days * dayMs && (days !== 2 || age >= dayMs);
};

export const SearchResultSection = ({
	query,
	state,
	onRetrySearch,
	onUpdateNote,
	onLoadMore,
	onEmptyChange,
}: {
	query: string;
	state: ReadingDeskSearchState;
	onRetrySearch: () => void;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
	onEmptyChange: (empty: boolean) => void;
}) => {
	const [period, setPeriod] = useState<(typeof filters)[number]["id"]>("today");
	const [dateRange, setDateRange] = useState<{
		from: number;
		to: number;
	} | null>(null);
	const [dateBounds, setDateBounds] = useState<{
		first: number;
		last: number;
	} | null>(null);
	const [dateBoundsLoading, setDateBoundsLoading] = useState(false);
	const [dateBoundsError, setDateBoundsError] = useState("");
	const [kind, setKind] = useState<SearchResultKind>("Everything");
	const [sitePreview, setSitePreview] = useState<{
		sites: LibrarySite[];
		total: number;
		hasMore: boolean;
		loading: boolean;
		error: string;
	}>({ sites: [], total: 0, hasMore: false, loading: true, error: "" });
	const [now] = useState(Date.now);
	useEffect(() => {
		if (period !== "any" || dateBounds) return;
		let active = true;
		setDateBoundsLoading(true);
		setDateBoundsError("");
		void readHistoryCounts()
			.then(({ firstEventTimestamp, lastEventTimestamp }) => {
				if (!active) return;
				if (
					firstEventTimestamp === null ||
					lastEventTimestamp === null ||
					firstEventTimestamp > lastEventTimestamp
				) {
					setDateBoundsError("No tracked dates available.");
					return;
				}
				setDateBounds({ first: firstEventTimestamp, last: lastEventTimestamp });
				setDateRange(
					(current) =>
						current ?? { from: firstEventTimestamp, to: lastEventTimestamp },
				);
			})
			.catch(() => {
				if (active) setDateBoundsError("Could not load tracked dates.");
			})
			.finally(() => {
				if (active) setDateBoundsLoading(false);
			});
		return () => {
			active = false;
		};
	}, [dateBounds, period]);
	const selectedFilter =
		filters.find((filter) => filter.id === period) ?? filters[0];
	const rangeFrom =
		period === "any" && dateRange
			? format(new Date(dateRange.from), "yyyy-MM-dd")
			: undefined;
	const rangeTo =
		period === "any" && dateRange
			? format(new Date(dateRange.to), "yyyy-MM-dd")
			: undefined;
	const rangeFromTime =
		period === "any" && dateRange
			? format(new Date(dateRange.from), "HH:mm:ss")
			: undefined;
	const rangeToTime =
		period === "any" && dateRange
			? format(new Date(dateRange.to), "HH:mm:ss")
			: undefined;
	const withinSelectedRange = (timestamp: number) =>
		(period !== "any" || Boolean(dateRange)) &&
		withinRange(
			timestamp,
			selectedFilter.days,
			now,
			rangeFrom,
			rangeTo,
			rangeFromTime,
			rangeToTime,
		);
	const libraryFrom =
		period === "any" && dateRange
			? dateRange.from
			: Number.isFinite(selectedFilter.days)
				? now - selectedFilter.days * 86_400_000
				: undefined;
	const libraryTo =
		period === "any" && dateRange
			? dateRange.to
			: selectedFilter.days === 2
				? now - 86_400_000
				: Number.isFinite(selectedFilter.days)
					? now
					: undefined;
	const results = state.results
		.filter(
			(page) =>
				(kind !== "Notes" ||
					state.notes.some((note) => note.url === page.url)) &&
				(kind !== "Notes" ||
					withinSelectedRange(
						state.notes.find((note) => note.url === page.url)?.createdAt ??
							page.lastSeen,
					)) &&
				(kind === "Notes" || withinSelectedRange(page.lastSeen)),
		)
		.sort((a, b) => b.lastSeen - a.lastSeen);
	const pageCount = state.results.filter((page) =>
		withinSelectedRange(page.lastSeen),
	).length;
	const noteCount = state.notes.filter((note) =>
		withinSelectedRange(note.createdAt),
	).length;
	const counts: Record<SearchResultKind, number> = {
		Everything: sitePreview.total + pageCount + noteCount,
		Sites: sitePreview.total,
		Pages: pageCount,
		Notes: noteCount,
	};
	const notes: DashboardNoteResult[] = state.notes
		.filter((note) => kind !== "Pages" && withinSelectedRange(note.createdAt))
		.sort((a, b) => b.createdAt - a.createdAt);
	const noteCountsByUrl = new Map<string, number>();
	for (const note of notes) {
		noteCountsByUrl.set(note.url, (noteCountsByUrl.get(note.url) ?? 0) + 1);
	}
	const empty =
		!state.searching && !state.searchError && !results.length && !notes.length;
	useEffect(() => {
		if (kind !== "Sites") onEmptyChange(Boolean(query && empty));
	}, [empty, onEmptyChange, query, kind]);
	if (!query) return null;
	return (
		<section
			aria-label="Search results"
			aria-busy={state.searching}
			className="mt-8"
		>
			{kind !== "Sites" && (
				<SearchFeedback state={state} onRetrySearch={onRetrySearch} />
			)}
			{(kind === "Sites" || !state.searching) && (
				<>
					<SearchResultFilters
						kind={kind}
						onKindChange={setKind}
						period={period}
						periods={filters}
						counts={counts}
						dateRange={dateRange}
						minTimestamp={dateBounds?.first ?? null}
						maxTimestamp={dateBounds?.last ?? null}
						dateBoundsLoading={dateBoundsLoading}
						dateBoundsError={dateBoundsError}
						onDateRangeChange={setDateRange}
						onPeriodChange={(value) => setPeriod(value as typeof period)}
					/>
					<div
						id="search-panel-sites"
						role="tabpanel"
						aria-labelledby="search-tab-sites"
						className="text-sm"
						hidden={kind !== "Sites"}
					>
						<SiteBrowser
							key={`${query}:${period}:${rangeFrom}:${rangeTo}`}
							onSitesStateChange={setSitePreview}
							isActive={kind === "Sites"}
							query={query}
							from={libraryFrom}
							to={libraryTo}
							onEmptyChange={onEmptyChange}
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
								sites={sitePreview.sites}
								sitesTotal={sitePreview.total}
								sitesHasMore={sitePreview.hasMore}
								sitesLoading={sitePreview.loading}
								sitesError={sitePreview.error}
								onBrowseSites={() => setKind("Sites")}
								pagesOnly={kind === "Pages"}
								notesOnly={kind === "Notes"}
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
						</div>
					)}
				</>
			)}
		</section>
	);
};
