import { formatDuration } from "~/lib/home-data";

export const MEDALS = [
	"bg-[#bfff00] text-[#0b1310]",
	"bg-[#e8f3e8] text-[#0b1310]",
	"bg-[#6f9c81] text-[#0b1310]",
];

export const timeLabel = (ms: number) =>
	ms < 60_000 ? "<1 min" : formatDuration(ms);
export const shareLabel = (ms: number, total: number) => {
	const pct = total > 0 ? (ms / total) * 100 : 0;
	return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
};
const relativeTime = new Intl.RelativeTimeFormat(undefined, {
	numeric: "auto",
});
export const ago = (timestamp: number) => {
	const mins = Math.round((Date.now() - timestamp) / 60_000);
	if (mins < 60) return relativeTime.format(-mins, "minute");
	if (mins < 60 * 24)
		return relativeTime.format(-Math.round(mins / 60), "hour");
	return relativeTime.format(-Math.round(mins / 1440), "day");
};
export const plural = (n: number, word: string) =>
	`${n} ${word}${n === 1 ? "" : "s"}`;
