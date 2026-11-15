import type { LibrarySite } from "@tabot/shared/library";

export const searchPeriods = [
	{ id: "today", label: "Today", days: 1 },
	{ id: "yesterday", label: "Yesterday", days: 2 },
	{ id: "week", label: "Last 7 days", days: 7 },
	{ id: "month", label: "Last 30 days", days: 30 },
	{ id: "any", label: "Anytime", days: Infinity },
] as const;

export type SitePreview = {
	sites: LibrarySite[];
	total: number;
	hasMore: boolean;
	loading: boolean;
	error: string;
};

export type SearchPeriodOption = (typeof searchPeriods)[number];
export type SearchPeriod = SearchPeriodOption["id"];
