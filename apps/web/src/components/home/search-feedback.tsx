import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { actionClass } from "~/components/home/reading-desk-utils";

const searchStatusMessage = (
	status: NonNullable<ReadingDeskSearchState["searchStatus"]>,
) => {
	if (status.mode === "hybrid") {
		return "Meaning-based and matching-word search are ready on this device.";
	}
	if (status.model === "unavailable" || status.model === "ready") {
		return "Meaning-based search is unavailable. Results use matching words.";
	}
	if (status.indexing) {
		return "Tabot is building its local search index. Matching-word search remains available.";
	}
	return "Meaning-based search is not ready yet. Results use matching words.";
};

export const SearchFeedback = ({
	query,
	recentSearchQuestion,
	state,
	onRetrySearch,
}: {
	query: string;
	recentSearchQuestion: boolean;
	state: ReadingDeskSearchState;
	onRetrySearch: () => void;
}) => (
	<>
		{state.searching && (
			<div role="status" className="mb-7 py-8">
				<span className="sr-only">Searching local history…</span>
				<div
					aria-hidden="true"
					className="h-1.5 w-full overflow-hidden bg-work-surface"
				>
					<div className="h-full w-1/3 bg-linear-to-r from-transparent via-primary to-transparent motion-safe:animate-[search-progress_1.4s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-primary/60" />
				</div>
			</div>
		)}
		{state.searchError && (
			<div
				role="alert"
				className="mb-6 rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
			>
				<p>
					{state.searchError}{" "}
					{state.results.length > 0 && "Previous results remain below."}
				</p>
				<button type="button" className={actionClass} onClick={onRetrySearch}>
					Retry search
				</button>
			</div>
		)}
		{!state.searching && !state.searchError && state.searchStatus && (
			<p role="status" className="mb-4 text-sm text-muted-foreground">
				{searchStatusMessage(state.searchStatus)}
			</p>
		)}
		{!state.searching &&
			!state.searchError &&
			!state.results.length &&
			!state.notes.length && (
				<p className="py-8 text-center text-sm leading-6 text-muted-foreground">
					{recentSearchQuestion
						? "No Google search query was recorded near that time. Older visits predate local search-term capture."
						: `No saved title or page text matches “${query}”. URL-only visits cannot match their topic. Open a page with Tabot tracking on and leave it visible briefly to capture local context.`}
				</p>
			)}
	</>
);
