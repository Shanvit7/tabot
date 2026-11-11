import type {
	DashboardNoteResult,
	HistorySearchResult,
	SearchAvailability,
} from "@tabot/shared/dashboard";

export type ReadingDeskSearchState = {
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	searchStatus: SearchAvailability | null;
	selectedUrl: string | null;
	searching: boolean;
	searchError: string;
	hasMorePages: boolean;
	hasMoreNotes: boolean;
	loadingMorePages: boolean;
	loadingMoreNotes: boolean;
	loadMoreError: string;
	retryCount: number;
};

export type ReadingDeskSearchAction =
	| { type: "clear" }
	| { type: "start" }
	| {
			type: "success";
			results: HistorySearchResult[];
			notes: DashboardNoteResult[];
			searchStatus: SearchAvailability;
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

export const initialReadingDeskSearchState: ReadingDeskSearchState = {
	results: [],
	notes: [],
	searchStatus: null,
	selectedUrl: null,
	searching: false,
	searchError: "",
	hasMorePages: false,
	hasMoreNotes: false,
	loadingMorePages: false,
	loadingMoreNotes: false,
	loadMoreError: "",
	retryCount: 0,
};

export const readingDeskSearchReducer = (
	state: ReadingDeskSearchState,
	action: ReadingDeskSearchAction,
): ReadingDeskSearchState => {
	switch (action.type) {
		case "clear":
			return { ...initialReadingDeskSearchState, retryCount: state.retryCount };
		case "start":
			return { ...state, searching: true, searchStatus: null, searchError: "" };
		case "success":
			return {
				...state,
				results: action.results,
				notes: action.notes,
				searchStatus: action.searchStatus,
				selectedUrl: null,
				searching: false,
				hasMorePages: action.results.length === 20,
				hasMoreNotes: action.notes.length === 20,
				loadingMorePages: false,
				loadingMoreNotes: false,
				loadMoreError: "",
			};
		case "load-more-start":
			return {
				...state,
				loadingMorePages: action.list === "pages" || state.loadingMorePages,
				loadingMoreNotes: action.list === "notes" || state.loadingMoreNotes,
				loadMoreError: "",
			};
		case "load-more-success":
			return {
				...state,
				results:
					action.list === "pages"
						? [...state.results, ...action.results]
						: state.results,
				notes:
					action.list === "notes"
						? [...state.notes, ...action.notes]
						: state.notes,
				hasMorePages:
					action.list === "pages"
						? action.results.length === 20
						: state.hasMorePages,
				hasMoreNotes:
					action.list === "notes"
						? action.notes.length === 20
						: state.hasMoreNotes,
				loadingMorePages:
					action.list === "pages" ? false : state.loadingMorePages,
				loadingMoreNotes:
					action.list === "notes" ? false : state.loadingMoreNotes,
			};
		case "load-more-error":
			return {
				...state,
				loadingMorePages:
					action.list === "pages" ? false : state.loadingMorePages,
				loadingMoreNotes:
					action.list === "notes" ? false : state.loadingMoreNotes,
				loadMoreError: "Couldn’t load more results. Scroll to retry.",
			};
		case "error":
			return { ...state, searchError: action.message, searching: false };
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
