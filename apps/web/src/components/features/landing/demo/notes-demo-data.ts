export const NOTE_SEARCH_FRAME = 300;
export const NOTES_DEMO_DURATION = NOTE_SEARCH_FRAME + 20 * 30;
export const NOTE_SEARCH_QUERY = "Acme onboarding";
export const NOTE_PAGE = {
	title: "Acme onboarding guide",
	host: "docs.acme.example",
	url: "https://docs.acme.example/onboarding",
	updatedAt: Date.UTC(2026, 10, 15, 12, 41),
};
export const NOTE_TEXT =
	"Bring the onboarding timeline to the next Acme review.";
export const NOTE_TYPE_START = 72;
export const NOTE_TYPE_DURATION = 90;
export const NOTE_SAVE_FRAME = 190;
export const NOTE_SAVED_FRAME = 208;

export const getNotesDemoStage = (frame: number) => {
	if (frame < 18) return "page";
	if (frame < 34) return "opening";
	if (frame < 64) return "popup";
	if (frame < NOTE_TYPE_START + NOTE_TYPE_DURATION) return "typing";
	if (frame < NOTE_SAVE_FRAME) return "ready";
	if (frame < NOTE_SAVED_FRAME) return "saving";
	if (frame < NOTE_SEARCH_FRAME) return "saved";
	return "search";
};
