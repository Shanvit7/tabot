import type {
	DashboardNoteResult,
	HistorySearchResult,
	SearchAvailability,
} from "@tabot/shared/dashboard";

export type SearchState = {
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	searchStatus: SearchAvailability | null;
	hasSearched: boolean;
	selectedUrl: string | null;
	searching: boolean;
	searchError: string;
	hasMorePages: boolean;
	hasMoreNotes: boolean;
	resultsTotal: number | null;
	notesTotal: number | null;
	pagesOffset: number;
	notesOffset: number;
	loadingMorePages: boolean;
	loadingMoreNotes: boolean;
	loadMorePagesError: string;
	loadMoreNotesError: string;
	retryCount: number;
};

export type SearchAction =
	| { type: "clear" }
	| { type: "start" }
	| {
			type: "success";
			results: HistorySearchResult[];
			notes: DashboardNoteResult[];
			searchStatus: SearchAvailability;
			resultsTotal: number | null;
			notesTotal: number | null;
	  }
	| { type: "error"; message: string }
	| { type: "retry" }
	| { type: "select"; url: string }
	| { type: "load-more-start"; list: "pages" | "notes" }
	| {
			type: "load-more-success";
			list: "pages" | "notes";
			results: HistorySearchResult[];
			notes: DashboardNoteResult[];
	  }
	| { type: "load-more-error"; list: "pages" | "notes" }
	| {
			type: "update-note";
			note: Pick<DashboardNoteResult, "id" | "text" | "updatedAt">;
	  };

export const initialSearchState: SearchState = {
	results: [],
	notes: [],
	searchStatus: null,
	hasSearched: false,
	selectedUrl: null,
	searching: false,
	searchError: "",
	hasMorePages: false,
	hasMoreNotes: false,
	resultsTotal: null,
	notesTotal: null,
	pagesOffset: 0,
	notesOffset: 0,
	loadingMorePages: false,
	loadingMoreNotes: false,
	loadMorePagesError: "",
	loadMoreNotesError: "",
	retryCount: 0,
};

export const searchReducer = (
	state: SearchState,
	action: SearchAction,
): SearchState => {
	switch (action.type) {
		case "clear":
			return {
				...initialSearchState,
				hasSearched: state.hasSearched,
				retryCount: state.retryCount,
			};
		case "start":
			return {
				...initialSearchState,
				hasSearched: state.hasSearched,
				retryCount: state.retryCount,
				searching: true,
			};
		case "success":
			return {
				...state,
				results: [
					...new Map(action.results.map((row) => [row.url, row])).values(),
				],
				notes: [...new Map(action.notes.map((row) => [row.id, row])).values()],
				searchStatus: action.searchStatus,
				hasSearched: true,
				selectedUrl: null,
				searching: false,
				hasMorePages:
					action.resultsTotal === null
						? action.results.length === 20
						: action.results.length > 0 &&
							action.resultsTotal > action.results.length,
				hasMoreNotes:
					action.notesTotal === null
						? action.notes.length === 20
						: action.notes.length > 0 &&
							action.notesTotal > action.notes.length,
				resultsTotal: action.resultsTotal,
				notesTotal: action.notesTotal,
				pagesOffset: action.results.length,
				notesOffset: action.notes.length,
				loadingMorePages: false,
				loadingMoreNotes: false,
				loadMorePagesError: "",
				loadMoreNotesError: "",
			};
		case "load-more-start":
			return {
				...state,
				loadingMorePages: action.list === "pages" || state.loadingMorePages,
				loadingMoreNotes: action.list === "notes" || state.loadingMoreNotes,
				loadMorePagesError:
					action.list === "pages" ? "" : state.loadMorePagesError,
				loadMoreNotesError:
					action.list === "notes" ? "" : state.loadMoreNotesError,
			};
		case "load-more-success": {
			const pages = action.list === "pages";
			const results = pages
				? [
						...new Map(
							[...state.results, ...action.results].map((row) => [
								row.url,
								row,
							]),
						).values(),
					]
				: state.results;
			const notes = pages
				? state.notes
				: [
						...new Map(
							[...state.notes, ...action.notes].map((row) => [row.id, row]),
						).values(),
					];
			const pagesOffset =
				state.pagesOffset + (pages ? action.results.length : 0);
			const notesOffset = state.notesOffset + (pages ? 0 : action.notes.length);
			return {
				...state,
				results,
				notes,
				pagesOffset,
				notesOffset,
				hasMorePages: pages
					? results.length > state.results.length &&
						(state.resultsTotal === null
							? action.results.length === 20
							: pagesOffset < state.resultsTotal)
					: state.hasMorePages,
				hasMoreNotes: pages
					? state.hasMoreNotes
					: notes.length > state.notes.length &&
						(state.notesTotal === null
							? action.notes.length === 20
							: notesOffset < state.notesTotal),
				loadingMorePages: pages ? false : state.loadingMorePages,
				loadingMoreNotes: pages ? state.loadingMoreNotes : false,
			};
		}
		case "load-more-error":
			return {
				...state,
				loadingMorePages:
					action.list === "pages" ? false : state.loadingMorePages,
				loadingMoreNotes:
					action.list === "notes" ? false : state.loadingMoreNotes,
				loadMorePagesError:
					action.list === "pages"
						? "Couldn’t load more pages."
						: state.loadMorePagesError,
				loadMoreNotesError:
					action.list === "notes"
						? "Couldn’t load more notes."
						: state.loadMoreNotesError,
			};
		case "error":
			return {
				...state,
				hasSearched: true,
				searchError: action.message,
				searching: false,
			};
		case "retry":
			return { ...state, retryCount: state.retryCount + 1 };
		case "select":
			return { ...state, selectedUrl: action.url };
		case "update-note":
			return {
				...state,
				notes: state.notes.map((note) =>
					note.id === action.note.id ? { ...note, ...action.note } : note,
				),
			};
	}
};
