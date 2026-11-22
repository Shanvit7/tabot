import type { SearchResultKind } from "./result-kinds.ts";
import { searchResultKinds } from "./result-kinds.ts";
import type { SearchPeriod } from "./result-section/types.ts";
import { searchPeriods } from "./result-section/types.ts";

export type HomeSearchParams = {
	q?: string;
	category?: SearchResultKind;
	period?: SearchPeriod;
};

export const validateHomeSearch = (
	search: Record<string, unknown>,
): HomeSearchParams => ({
	q:
		typeof search.q === "string"
			? search.q.slice(0, 240) || undefined
			: undefined,
	category:
		searchResultKinds.find(
			(category) => category === (search.category ?? search.kind),
		) ?? "Everything",
	period:
		searchPeriods.find((option) => option.id === search.period)?.id ?? "today",
});
