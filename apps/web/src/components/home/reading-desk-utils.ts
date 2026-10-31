import type { HistorySearchResult } from "@tabot/shared/dashboard";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});
const sessionTimeFormatter = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "UTC",
});

export const dateLabel = (timestamp: number) => dateFormatter.format(timestamp);
export const timeLabel = (timestamp: number) =>
	sessionTimeFormatter.format(timestamp);
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
	"inline-flex min-h-11 items-center gap-2 rounded text-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
