import type { HistorySearchResult } from "@tabot/shared/dashboard";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});
export const withinRange = (value: number, days: number, now: number) => {
	const age = now - value;
	return (
		age >= 0 &&
		(!Number.isFinite(days) ||
			(age < days * 86_400_000 && (days !== 2 || age >= 86_400_000)))
	);
};

export const dateLabel = (timestamp: number) => dateFormatter.format(timestamp);
export const approxTimeSpentLabel = (durationMs?: number) => {
	if (!durationMs || durationMs <= 0) return null;
	const minutes = Math.round(durationMs / 60_000);
	const time =
		minutes < 1
			? "<1 min"
			: minutes < 60
				? `${minutes} min`
				: `${Math.floor(minutes / 60)} hr${Math.floor(minutes / 60) === 1 ? "" : "s"}${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
	return `Approx. ${time} spent`;
};
export const urlLabel = (page: HistorySearchResult) => {
	const path = new URL(page.url).pathname.split("/").filter(Boolean).at(-1);
	if (!path) return page.host;
	try {
		return decodeURIComponent(path).replaceAll("-", " ").replaceAll("_", " ");
	} catch {
		return path;
	}
};
export const messageOf = (error: unknown) =>
	error instanceof Error
		? error.message
		: "Local history could not be read. Try again.";
export const actionClass =
	"inline-flex min-h-11 cursor-pointer items-center gap-2 rounded text-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
