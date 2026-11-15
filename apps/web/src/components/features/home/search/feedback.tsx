import type { SearchState } from "~/components/features/home/search/state";
import { actionClass } from "~/components/features/home/search/utils";

export const SearchFeedback = ({
	state,
	onRetrySearch,
}: {
	state: SearchState;
	onRetrySearch: () => void;
}) => (
	<>
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
	</>
);
