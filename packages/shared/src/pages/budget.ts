import type { StoredPageObservation } from "./observations";

export const PAGE_RESOURCE_DAILY_BYTES = 32 * 1024;
export const PAGE_SITE_HOURLY_BYTES = 128 * 1024;
export const PAGE_MIN_INTERVAL_MS = 5000;

export const pageObservationSizeBytes = (row: StoredPageObservation): number =>
	JSON.stringify(row).length * 2;

export const pageObservationBudgetFailure = (
	row: StoredPageObservation,
	usage: {
		resourceBytes: number;
		siteBytes: number;
		recentTimestamps: number[];
	},
): string | null => {
	if (
		usage.recentTimestamps.some(
			(timestamp) =>
				timestamp > row.timestamp - PAGE_MIN_INTERVAL_MS &&
				timestamp <= row.timestamp,
		)
	)
		return "content-rate-limit";
	const bytes = pageObservationSizeBytes(row);
	if (usage.resourceBytes + bytes > PAGE_RESOURCE_DAILY_BYTES)
		return "resource-budget-limit";
	if (usage.siteBytes + bytes > PAGE_SITE_HOURLY_BYTES)
		return "site-budget-limit";
	return null;
};
