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
	| { type: "select"; url: string };

export const initialReadingDeskSearchState: ReadingDeskSearchState = {
	results: [],
	notes: [],
	searchStatus: null,
	selectedUrl: null,
	searching: false,
	searchError: "",
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
			};
		case "error":
			return { ...state, searchError: action.message, searching: false };
		case "retry":
			return { ...state, retryCount: state.retryCount + 1 };
		case "select":
			return { ...state, selectedUrl: action.url };
	}
};
