import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { actionClass } from "~/components/home/reading-desk-utils";

export const SearchFeedback = ({
	query,
	state,
	onRetrySearch,
}: {
	query: string;
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
		{!state.searching &&
			!state.searchError &&
			!state.results.length &&
			!state.notes.length && (
				<p className="py-8 text-center text-sm leading-6 text-muted-foreground">
					{`No saved activity matches “${query}”.`}
				</p>
			)}
	</>
);
