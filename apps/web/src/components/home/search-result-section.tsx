import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import { SearchFeedback } from "~/components/home/search-feedback";
import { SearchNoteCards } from "~/components/home/search-note-cards";
import { SearchPageResults } from "~/components/home/search-page-results";

export const SearchResultSection = ({
	query,
	state,
	onRetrySearch,
	onSelectPage,
}: {
	query: string;
	state: ReadingDeskSearchState;
	onRetrySearch: () => void;
	onSelectPage: (url: string) => void;
}) => {
	if (!query) return null;
	const selected =
		state.results.find((page) => page.url === state.selectedUrl) ??
		state.results[0];
	const noteCountsByUrl = new Map<string, number>();
	for (const note of state.notes) {
		noteCountsByUrl.set(note.url, (noteCountsByUrl.get(note.url) ?? 0) + 1);
	}
	return (
		<section
			aria-label="Search results"
			aria-busy={state.searching}
			className="mt-10"
		>
			<SearchFeedback
				query={query}
				state={state}
				onRetrySearch={onRetrySearch}
			/>
			<SearchNoteCards notes={state.notes} />
			{selected && (
				<SearchPageResults
					results={state.results}
					selected={selected}
					noteCountsByUrl={noteCountsByUrl}
					onSelectPage={onSelectPage}
				/>
			)}
		</section>
	);
};
