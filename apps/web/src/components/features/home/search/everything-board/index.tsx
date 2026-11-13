import type {
	DashboardNoteResult,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import type { LibrarySite } from "@tabot/shared/library";
import { useState } from "react";
import {
	type ActiveSearchResult,
	SearchResultSheet,
} from "./search-result-sheet";
import { SearchResultsGrid } from "./search-results-grid";

const EMPTY_SITES: LibrarySite[] = [];

export const SearchEverythingBoard = ({
	pagesOnly = false,
	notesOnly = false,
	sites = EMPTY_SITES,
	sitesLoading = false,
	sitesError = "",
	chatGptConnected,
	showEmptyStates = true,
	results,
	notes,
	noteCountsByUrl,
	onUpdateNote,
	onLoadMore,
	hasMorePages,
	hasMoreNotes,
	loadingMorePages,
	loadingMoreNotes,
	loadMoreError,
}: {
	pagesOnly?: boolean;
	notesOnly?: boolean;
	sites?: LibrarySite[];
	sitesLoading?: boolean;
	sitesError?: string;
	chatGptConnected: boolean;
	showEmptyStates?: boolean;
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	noteCountsByUrl: Map<string, number>;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
	hasMorePages: boolean;
	hasMoreNotes: boolean;
	loadingMorePages: boolean;
	loadingMoreNotes: boolean;
	loadMoreError: string;
}) => {
	const [active, setActive] = useState<ActiveSearchResult>(null);
	const [editingNote, setEditingNote] = useState(false);
	const [draft, setDraft] = useState("");
	const [savingNote, setSavingNote] = useState(false);
	const [saveError, setSaveError] = useState("");
	return (
		<>
			<SearchResultsGrid
				pagesOnly={pagesOnly}
				notesOnly={notesOnly}
				sites={sites}
				sitesLoading={sitesLoading}
				sitesError={sitesError}
				chatGptConnected={chatGptConnected}
				showEmptyStates={showEmptyStates}
				results={results}
				notes={notes}
				noteCountsByUrl={noteCountsByUrl}
				onLoadMore={onLoadMore}
				hasMorePages={hasMorePages}
				hasMoreNotes={hasMoreNotes}
				loadingMorePages={loadingMorePages}
				loadingMoreNotes={loadingMoreNotes}
				loadMoreError={loadMoreError}
				onSelectPage={(page) => setActive({ type: "page", item: page })}
				onSelectNote={(note) => {
					setActive({ type: "note", item: note });
					setDraft(note.text);
					setEditingNote(false);
					setSaveError("");
				}}
			/>
			<SearchResultSheet
				active={active}
				setActive={setActive}
				editingNote={editingNote}
				setEditingNote={setEditingNote}
				draft={draft}
				setDraft={setDraft}
				savingNote={savingNote}
				setSavingNote={setSavingNote}
				saveError={saveError}
				setSaveError={setSaveError}
				onUpdateNote={onUpdateNote}
			/>
		</>
	);
};
