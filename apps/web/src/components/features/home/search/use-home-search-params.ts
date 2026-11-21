import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { SearchResultKind } from "~/components/features/home/search/result-kinds";
import type { SearchPeriod } from "~/components/features/home/search/result-section/types";

export const useHomeSearchParams = () => {
	const search = useSearch({ strict: false });
	const navigate = useNavigate();
	const updateSearch = useCallback(
		(patch: Partial<typeof search>) =>
			void navigate({
				to: "/home",
				search: (previous) => ({ ...previous, ...patch }),
				replace: true,
			}),
		[navigate],
	);

	return {
		query: search.q ?? "",
		category: search.category ?? "Everything",
		period: search.period ?? "today",
		setQuery: (q: string) => updateSearch({ q: q.trim() ? q : undefined }),
		setCategory: (category: SearchResultKind) => updateSearch({ category }),
		setPeriod: (period: SearchPeriod) => updateSearch({ period }),
	};
};
