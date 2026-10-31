import {
	type DashboardNoteResult,
	type DashboardPagePreview,
	type HistorySearchResult,
	isDashboardNotes,
	isDashboardPagePreview,
	isDashboardSearchAvailability,
	isDashboardSearchResults,
	isRecord,
	type SearchAvailability,
} from "@tabot/shared/dashboard";
import { createTrackingClient } from "@tabot/shared/tracking";
import { createClientOnlyFn } from "@tanstack/react-start";

// Browser-only transport: never send history or search terms through Start server functions.
type ExtensionRuntime = {
	sendMessage: (
		id: string,
		message: unknown,
		callback: (response: unknown) => void,
	) => void;
	lastError?: { message?: string };
};
const failureMessage = (code: unknown): string => {
	if (code === "unauthorized-sender")
		return "This dashboard address is not allowed. Open Tabot on its published dashboard or localhost:3000.";
	if (code === "invalid-request")
		return "This search request could not be read. Reload the dashboard and try again.";
	if (code === "tracking-update-failed")
		return "Could not update tracking. Try again.";
	return "Tabot could not read local storage. Reload the extension, then try again. This does not mean your history is empty.";
};

const request = createClientOnlyFn(
	(message: unknown): Promise<Record<string, unknown>> => {
		const extensionId = import.meta.env.VITE_TABOT_EXTENSION_ID;
		if (!extensionId || !/^[a-p]{32}$/.test(extensionId))
			return Promise.reject(
				new Error(
					"Connect Tabot first: set VITE_TABOT_EXTENSION_ID to the ID shown in chrome://extensions, then restart the dashboard.",
				),
			);
		const runtime = (
			globalThis as typeof globalThis & {
				chrome?: { runtime?: ExtensionRuntime };
			}
		).chrome?.runtime;
		if (!runtime?.sendMessage)
			return Promise.reject(
				new Error(
					"Open this dashboard in Chrome with the Tabot extension installed and enabled.",
				),
			);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() =>
					reject(
						new Error(
							"Tabot took too long to respond. Reload the extension and try again.",
						),
					),
				15_000,
			);
			try {
				runtime.sendMessage(extensionId, message, (response) => {
					clearTimeout(timer);
					if (runtime.lastError) {
						reject(
							new Error(
								"Tabot is not reachable. Enable or reload the extension in chrome://extensions, then retry.",
							),
						);
					} else if (!isRecord(response)) {
						reject(
							new Error(
								"Reload the latest Tabot extension to use the reading desk.",
							),
						);
					} else if (response.ok === false) {
						reject(new Error(failureMessage(response.code)));
					} else resolve(response);
				});
			} catch {
				clearTimeout(timer);
				reject(
					new Error("Tabot is not reachable. Reload the extension and retry."),
				);
			}
		});
	},
);

export const searchRetainedPages = async (
	query: string,
): Promise<{
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	searchStatus: SearchAvailability;
}> => {
	const response = await request({ type: "SEARCH_HISTORY", query, limit: 20 });
	if (
		!isDashboardSearchResults(response.results) ||
		!isDashboardSearchAvailability(response.searchStatus) ||
		(response.notes !== undefined && !isDashboardNotes(response.notes))
	)
		throw new Error(
			"Search response is incompatible. Reload the latest Tabot extension.",
		);
	return {
		results: response.results,
		notes: (response.notes as DashboardNoteResult[] | undefined) ?? [],
		searchStatus: response.searchStatus,
	};
};

const trackingClient = createTrackingClient(request);
export const readTrackingState = trackingClient.read;
export const setTrackingEnabled = trackingClient.set;

export const readHistoryCounts = async (): Promise<{
	eventCount: number;
	pageCount: number;
	firstEventTimestamp: number | null;
}> => {
	const response = await request({ type: "GET_COUNTS" });
	const firstEventTimestamp = response.firstEventTimestamp;
	if (
		typeof response.eventCount !== "number" ||
		!Number.isSafeInteger(response.eventCount) ||
		response.eventCount < 0 ||
		typeof response.pageCount !== "number" ||
		!Number.isSafeInteger(response.pageCount) ||
		response.pageCount < 0 ||
		(firstEventTimestamp !== undefined &&
			firstEventTimestamp !== null &&
			(typeof firstEventTimestamp !== "number" ||
				!Number.isFinite(firstEventTimestamp) ||
				firstEventTimestamp < 0))
	)
		throw new Error(
			"History counts could not be read. Reload the latest Tabot extension.",
		);
	return {
		eventCount: response.eventCount,
		pageCount: response.pageCount,
		firstEventTimestamp:
			typeof firstEventTimestamp === "number" ? firstEventTimestamp : null,
	};
};

export const readPagePreview = async (
	id: string,
	url: string,
): Promise<DashboardPagePreview | null> => {
	const response = await request({ type: "GET_PAGE_PREVIEW", id, url });
	if (response.preview === null) return null;
	if (
		!isDashboardPagePreview(response.preview) ||
		response.preview.id !== id ||
		response.preview.url !== url
	)
		throw new Error(
			"Capture response is incompatible. Reload the latest Tabot extension.",
		);
	return response.preview;
};
