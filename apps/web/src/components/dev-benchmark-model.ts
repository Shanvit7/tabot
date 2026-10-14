export type Result = {
	elapsedMs: number;
	producerMs: number;
	jsActiveMs: number;
	mainThreadBlockingMs: number | null;
	computeMs: number;
	checksum: number;
};
export type Mode = "sab" | "message";
export const metricRows = [
	{
		label: "Throughput",
		description:
			"Events handled per second. Higher is faster; calculated from end-to-end time.",
		metric: "throughput",
	},
	{
		label: "End-to-end time",
		description:
			"From preparing input until the worker replies. Lower is faster; best overall comparison.",
		metric: "elapsedMs",
	},
	{
		label: "Page-thread time",
		description:
			"Elapsed time to prepare and publish replay batches, including yields; lower means shorter measured duration.",
		metric: "producerMs",
	},
	{
		label: "CPU demand (JS-time proxy)",
		description:
			"Instrumented synchronous JavaScript execution in page producer and worker; rough CPU-demand proxy, not actual process CPU usage.",
		metric: "jsActiveMs",
	},
	{
		label: "Main-thread blocking time",
		description:
			"Total time spent in main-thread tasks beyond 50 ms during replay; lower suggests fewer responsiveness stalls. Not measured if browser lacks Long Tasks API.",
		metric: "mainThreadBlockingMs",
	},
	{
		label: "Consumer pipeline time",
		description:
			"Time to decode events, persist them to isolated IndexedDB, read them back, and run Tabot derivation.",
		metric: "computeMs",
	},
] as const;
type Metric = (typeof metricRows)[number]["metric"];

export const metricValue = (
	result: Result,
	metric: Metric,
	eventCount: number | null,
): number | null =>
	metric === "throughput"
		? eventCount === null || result.elapsedMs <= 0
			? null
			: eventCount / (result.elapsedMs / 1000)
		: result[metric];

export const getWinner = (
	results: Partial<Record<Mode, Result>>,
	metric: Metric,
	eventCount: number | null,
): Mode | "tie" | null => {
	const sab = results.sab && metricValue(results.sab, metric, eventCount);
	const message =
		results.message && metricValue(results.message, metric, eventCount);
	if (sab == null || message == null) return null;
	if (sab === message) return "tie";
	const higherIsBetter = metric === "throughput";
	return (higherIsBetter ? sab > message : sab < message) ? "sab" : "message";
};

export const formatMetric = (
	result: Result | undefined,
	metric: Metric,
	eventCount: number | null,
) => {
	if (!result) return "Not measured";
	const value = metricValue(result, metric, eventCount);
	if (value === null) return "Not measured";
	return metric === "throughput"
		? `${Math.round(value).toLocaleString()} events/s`
		: `${value.toFixed(1)} ms`;
};
