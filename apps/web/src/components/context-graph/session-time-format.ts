const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const utcDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
	timeZone: "UTC",
});
const utcTimeFormatter = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	minute: "2-digit",
	timeZone: "UTC",
});

export const formatSessionDateUTC = (timestamp: number) =>
	utcDateFormatter.format(timestamp);

export const formatSessionDateLocal = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});

export const formatSessionTimeUTC = (timestamp: number, day: number) =>
	new Date(timestamp).toISOString().slice(0, 10) !==
	new Date(day).toISOString().slice(0, 10)
		? utcDateTimeFormatter.format(timestamp)
		: utcTimeFormatter.format(timestamp);

export const formatSessionTimeLocal = (timestamp: number, day: number) => {
	const date = new Date(timestamp);
	return date.toDateString() !== new Date(day).toDateString()
		? date.toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
				hour: "numeric",
				minute: "2-digit",
			})
		: date.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
};
