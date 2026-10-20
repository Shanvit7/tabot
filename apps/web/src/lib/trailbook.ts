export const TRAILBOOK_KEY = "tabot.trailbook.v1";

export type Trailbook = {
	savedIds: string[];
	viewed: boolean;
	followed: boolean;
};

export const EMPTY_TRAILBOOK: Trailbook = {
	savedIds: [],
	viewed: false,
	followed: false,
};

// null signals unreadable data: never silently overwrite an existing collection.
export const parseTrailbook = (raw: string | null): Trailbook | null => {
	if (raw === null) return EMPTY_TRAILBOOK;
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object") return null;
		const book = value as Record<string, unknown>;
		if (
			!Array.isArray(book.savedIds) ||
			!book.savedIds.every((id) => typeof id === "string" && id.length > 0) ||
			typeof book.viewed !== "boolean" ||
			typeof book.followed !== "boolean"
		)
			return null;
		return {
			savedIds: [...new Set(book.savedIds as string[])],
			viewed: book.viewed,
			followed: book.followed,
		};
	} catch {
		return null;
	}
};

export const toggleSavedTrail = (book: Trailbook, id: string): Trailbook => ({
	...book,
	savedIds: book.savedIds.includes(id)
		? book.savedIds.filter((saved) => saved !== id)
		: [id, ...book.savedIds],
});
