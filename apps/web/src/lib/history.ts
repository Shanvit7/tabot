import {
	type AssistantConnections,
	parseAssistantConnections,
	type WorkflowScriptDraft,
} from "@tabot/shared";
import {
	type DashboardNoteResult,
	type DashboardPagePreview,
	type DashboardWorkflowCandidates,
	type HistorySearchResult,
	isDashboardNotes,
	isDashboardPagePreview,
	isDashboardSearchAvailability,
	isDashboardSearchResults,
	isDashboardWorkflowCandidates,
	isDashboardWorkflowHandoffPrepared,
	isDashboardWorkflowScriptDrafts,
	isRecord,
	type SearchAvailability,
} from "@tabot/shared/dashboard";
import { createTrackingClient } from "@tabot/shared/tracking";
import { createClientOnlyFn } from "@tanstack/react-start";

// Browser-only transport: never send history or search terms through Start server functions.
export class ExtensionUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExtensionUnavailableError";
	}
}

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
	if (code === "tracking-disabled") return "Resume browser tracking first.";
	if (code === "workflow-candidate-not-found")
		return "This pattern changed or is no longer available. Refresh and try again.";
	if (code === "workflow-model-not-ready")
		return "Wait for Handwired to finish learning, then try again.";
	if (code === "workflow-evidence-unavailable")
		return "Some selected history was deleted. Refresh before sharing this pattern.";
	if (code === "workflow-unavailable")
		return "Could not prepare this handoff. Refresh the pattern and try again.";
	return "Tabot could not read local storage. Reload the extension, then try again. This does not mean your history is empty.";
};

const request = createClientOnlyFn(
	(message: unknown): Promise<Record<string, unknown>> => {
		const extensionId = import.meta.env.VITE_TABOT_EXTENSION_ID;
		if (!extensionId || !/^[a-p]{32}$/.test(extensionId))
			return Promise.reject(
				new ExtensionUnavailableError(
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
				new ExtensionUnavailableError(
					"Open this dashboard in Chrome with the Tabot extension installed and enabled.",
				),
			);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() =>
					reject(
						new ExtensionUnavailableError(
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
							new ExtensionUnavailableError(
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
					new ExtensionUnavailableError(
						"Tabot is not reachable. Reload the extension and retry.",
					),
				);
			}
		});
	},
);

export const updateDashboardNote = async (
	id: string,
	text: string,
): Promise<{ id: string; text: string; updatedAt: number }> => {
	const response = await request({ type: "UPDATE_NOTE", id, text });
	if (
		!isRecord(response.note) ||
		response.note.id !== id ||
		response.note.text !== text ||
		typeof response.note.updatedAt !== "number" ||
		!Number.isSafeInteger(response.note.updatedAt) ||
		response.note.updatedAt < 0
	)
		throw new Error(
			"Note could not be updated. Reload the dashboard and retry.",
		);
	return response.note as { id: string; text: string; updatedAt: number };
};

export const searchRetainedPages = async (
	query: string,
	offset = 0,
	noteOffset = 0,
): Promise<{
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	searchStatus: SearchAvailability;
}> => {
	const response = await request({
		type: "SEARCH_HISTORY",
		query,
		limit: 20,
		offset,
		noteOffset,
	});
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

export const readActiveTrackingDuration = async (): Promise<{
	durationMs: number;
	active: boolean;
}> => {
	const response = await request({ type: "GET_ACTIVE_TRACKING_DURATION" });
	if (
		typeof response.durationMs !== "number" ||
		!Number.isFinite(response.durationMs) ||
		typeof response.active !== "boolean"
	)
		throw new Error("Active tracking duration could not be read.");
	return { durationMs: response.durationMs, active: response.active };
};

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

export const readAssistantConnections =
	async (): Promise<AssistantConnections> => {
		const response = await request({ type: "GET_ASSISTANT_CONNECTIONS" });
		const connections = parseAssistantConnections(response);
		if (!connections)
			throw new Error(
				"ChatGPT connection status is unavailable. Reload the extension.",
			);
		return connections;
	};

export const readWorkflowCandidates =
	async (): Promise<DashboardWorkflowCandidates> => {
		const response = await request({ type: "GET_WORKFLOW_CANDIDATES" });
		if (!isDashboardWorkflowCandidates(response))
			throw new Error(
				"Workflow response is incompatible. Reload Tabot extension.",
			);
		return response;
	};

export const createWorkflowHandoff = async (
	candidateId: string,
): Promise<void> => {
	const response = await request({
		type: "CREATE_WORKFLOW_HANDOFF",
		candidateId,
	});
	if (!isDashboardWorkflowHandoffPrepared(response))
		throw new Error(failureMessage(response.code));
};

export const readWorkflowScriptDrafts = async (): Promise<
	WorkflowScriptDraft[]
> => {
	const response = await request({ type: "GET_WORKFLOW_SCRIPT_DRAFTS" });
	if (!isDashboardWorkflowScriptDrafts(response))
		throw new Error(
			"Saved automation drafts are incompatible. Reload the extension.",
		);
	return response.drafts;
};

export const deleteWorkflowScriptDraft = async (
	id: string,
): Promise<boolean> => {
	const response = await request({ type: "DELETE_WORKFLOW_SCRIPT_DRAFT", id });
	if (typeof response.deleted !== "boolean")
		throw new Error(failureMessage(response.code));
	return response.deleted;
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
