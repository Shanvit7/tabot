import { logger } from "../lib/logger";
import type { PageNote } from "../notes/notes";
import type { StoredPageObservation } from "../pages/observations";
import { sanitizeEventForIngestion } from "../privacy/ingest";
import type {
	HistorySearchOptions,
	HistorySearchResult,
	SearchAvailability,
} from "../recall/history-search";
import type {
	WorkflowAutomationScript,
	WorkflowScriptDraft,
} from "../workflows/automation-script";
import type { BehaviorCheckpoint } from "../workflows/behavior-model";
import type {
	WorkflowHandoff,
	WorkflowHandoffRequest,
} from "../workflows/workflow-handoff";
import type { TabEventMetadata, TabEventType } from "./events";
import { normalizeEvent } from "./ingest";

export interface StoredTabEvent {
	id: string;
	type: TabEventType;
	tabId: number;
	windowId: number;
	timestamp: number;
	url?: string;
	favicon?: string;
	metadata?: TabEventMetadata;
	source?: {
		instanceId: string;
		sequence: number;
		documentId?: string;
		documentUrl?: string;
		captureIdentity?: string;
	};
}

export const storedTabEventSchema = {
	version: 0,
	primaryKey: "id",
	type: "object",
	properties: {
		id: { type: "string", maxLength: 64 },
		type: { type: "string" },
		tabId: { type: "number" },
		windowId: { type: "number" },
		timestamp: { type: "number", minimum: 0 },
		url: { type: "string", maxLength: 2048 },
		favicon: { type: "string", maxLength: 2048 },
	},
	required: ["id", "type", "tabId", "windowId", "timestamp"],
	indexes: ["timestamp", "type", "tabId"],
} as const;

export interface InsertEventsResult {
	inserted: number;
	duplicates: number;
	insertedPages?: number;
	duplicatePages?: number;
	ignoredPages?: Record<string, string>;
}
export type StoredIngestRecord = StoredTabEvent | StoredPageObservation;
export type WorkflowTrainingResult = {
	status: "trained" | "unchanged" | "insufficient-data" | "stale" | "cancelled";
	examples: number;
	truncated: boolean;
};
export type EventRange = {
	from?: number;
	to?: number;
	fromInclusive?: boolean;
	toInclusive?: boolean;
	limit?: number;
	type?: TabEventType;
	types?: TabEventType[];
};
export type PageObservationSummary = Omit<
	StoredPageObservation,
	"segments" | "pageKey" | "captureIdentity"
> & { segmentCount: number };
export interface PageCaptureSiteSummary {
	origin: string;
	count: number;
	latestTimestamp: number;
}

const STORAGE_MESSAGE = "TABOT_STORAGE_REQUEST";
const STORAGE_RESPONSE_TIMEOUT_MS = 10_000;
export type StorageTransport = (message: {
	kind: string;
	requestId: number;
	method: string;
	args: unknown[];
}) => Promise<unknown>;

/** RPC facade; only the offscreen TalaDB owner opens the authoritative database. */
export class TabotDatabase {
	private requestSequence = 0;
	private readonly transport: StorageTransport;
	private request = async <T>(
		method: string,
		args: unknown[] = [],
	): Promise<T> => {
		// A timeout is an unknown outcome; mutation retries must reconcile stable IDs.
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			const response = (await Promise.race([
				this.transport({
					kind: STORAGE_MESSAGE,
					requestId: ++this.requestSequence,
					method,
					args,
				}),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error("storage-response-timeout")),
						STORAGE_RESPONSE_TIMEOUT_MS,
					);
				}),
			])) as { ok?: boolean; code?: string; value?: T } | undefined;
			if (!response?.ok) {
				const code = response?.code ?? "storage-unavailable";
				const error = new Error(code);
				error.name = code;
				throw error;
			}
			return response.value as T;
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	};

	constructor(transport: StorageTransport) {
		this.transport = transport;
	}
	commitIngest = (records: StoredIngestRecord[]) =>
		this.request<InsertEventsResult>("commitIngest", [records]);
	countEvents = () => this.request<number>("countEvents");
	countPages = () => this.request<number>("countPages");
	getFirstEventTimestamp = () =>
		this.request<number | null>("getFirstEventTimestamp");
	readEvents = (range?: EventRange) =>
		this.request<StoredTabEvent[]>("readEvents", [range]);
	findEvent = (id: string) =>
		this.request<StoredTabEvent | undefined>("findEvent", [id]);
	getPageObservation = (id: string) =>
		this.request<StoredPageObservation | undefined>("getPageObservation", [id]);
	readRelatedActivity = (
		anchors: number[],
		pageKeys: string[],
		origins: string[],
		seedIds: string[],
		maxGapMs: number,
		limit: number,
		offset: number,
		to: number,
	) =>
		this.request<StoredIngestRecord[]>("readRelatedActivity", [
			anchors,
			pageKeys,
			origins,
			seedIds,
			maxGapMs,
			limit,
			offset,
			to,
		]);
	getPageSummaries = (from: number, to: number, limit?: number) =>
		this.request<PageObservationSummary[]>("getPageSummaries", [
			from,
			to,
			limit,
		]);
	getPageCaptureSiteSummaries = () =>
		this.request<PageCaptureSiteSummary[]>("getPageCaptureSiteSummaries");
	searchHistory = (query: string, options?: HistorySearchOptions) =>
		this.request<HistorySearchResult[]>("searchHistory", [query, options]);
	listPageNotes = (
		pageKey: string,
		fallback?: Pick<PageNote, "url" | "host" | "title">,
	) => this.request<PageNote[]>("listPageNotes", [pageKey, fallback]);
	saveNote = (note: PageNote) => this.request<PageNote>("saveNote", [note]);
	updateNoteText = (id: string, text: string) =>
		this.request<{ id: string; text: string; updatedAt: number } | null>(
			"updateNoteText",
			[id, text],
		);
	linkNoteEvent = (id: string, eventId: string) =>
		this.request<boolean>("linkNoteEvent", [id, eventId]);
	deleteNote = (id: string) =>
		this.request<{ deleted: boolean }>("deleteNote", [id]);
	searchNotes = (
		query: string,
		options?: {
			from?: number;
			to?: number;
			domain?: string;
			limit?: number;
			offset?: number;
		},
	) => this.request<PageNote[]>("searchNotes", [query, options]);
	listNotesForSite = (site: string) =>
		this.request<PageNote[]>("listNotesForSite", [site]);
	listNotesBetween = (from: number, to: number) =>
		this.request<PageNote[]>("listNotesBetween", [from, to]);
	getSearchStatus = () =>
		this.request<SearchAvailability>("getSearchStatus", []);
	getWorkflowCheckpoint = () =>
		this.request<BehaviorCheckpoint | null>("getWorkflowCheckpoint", []);
	createWorkflowHandoff = (request: WorkflowHandoffRequest) =>
		this.request<void>("createWorkflowHandoff", [request]);
	getPendingWorkflowHandoff = () =>
		this.request<WorkflowHandoff | null>("getPendingWorkflowHandoff", []);
	saveWorkflowScriptDraft = (
		grantToken: string,
		candidateId: string,
		handoffDigest: string,
		script: WorkflowAutomationScript,
	) =>
		this.request<WorkflowScriptDraft>("saveWorkflowScriptDraft", [
			grantToken,
			candidateId,
			handoffDigest,
			script,
		]);
	listWorkflowScriptDrafts = () =>
		this.request<WorkflowScriptDraft[]>("listWorkflowScriptDrafts", []);
	deleteWorkflowScriptDraft = (id: string) =>
		this.request<{ deleted: boolean }>("deleteWorkflowScriptDraft", [id]);
	getWorkflowTrainingGeneration = () =>
		this.request<number>("getWorkflowTrainingGeneration", []);
	advanceWorkflowTrainingGeneration = () =>
		this.request<number>("advanceWorkflowTrainingGeneration", []);
	resetWorkflowModel = () => this.request<void>("resetWorkflowModel", []);
	trainWorkflowModel = (expectedGeneration: number) =>
		this.request<WorkflowTrainingResult>("trainWorkflowModel", [
			expectedGeneration,
		]);
	getLegacyMigrationStatus = () =>
		this.request<{
			pendingRetirement: boolean;
			events: number;
			pages: number;
		}>("getLegacyMigrationStatus");
	confirmLegacyRetirement = () =>
		this.request<{ retired: boolean }>("confirmLegacyRetirement");
	deletePageObservations = (
		filter?: { origin?: string; from?: number; to?: number },
		limit?: number,
	) =>
		this.request<{ deleted: number; more: boolean }>("deletePageObservations", [
			filter,
			limit,
		]);
	prunePageObservations = (maxBytes?: number, maxDeletes?: number) =>
		this.request<{ deleted: number; more: boolean }>("prunePageObservations", [
			maxBytes,
			maxDeletes,
		]);
}

export const createEventsDb = async (
	transport: StorageTransport,
): Promise<TabotDatabase> => new TabotDatabase(transport);

const isPageObservation = (
	row: StoredIngestRecord,
): row is StoredPageObservation =>
	"kind" in row && row.kind === "page-observation";
export const bulkInsertIngestRecords = async (
	database: TabotDatabase,
	docs: StoredIngestRecord[],
): Promise<InsertEventsResult> => {
	const normalized = await Promise.all(
		docs.map(async (row) => {
			if (isPageObservation(row)) return row;
			return normalizeEvent(await sanitizeEventForIngestion(row));
		}),
	);
	return database.commitIngest(normalized);
};
export const bulkInsertEvents = (
	database: TabotDatabase,
	docs: StoredTabEvent[],
) => bulkInsertIngestRecords(database, docs);
export const countEvents = async (database: TabotDatabase) => {
	try {
		return await database.countEvents();
	} catch (error) {
		logger.warn("countEvents failed", { error });
		throw error;
	}
};
export const sanitizeEventsForRead = (rows: StoredTabEvent[]) =>
	Promise.all(rows.map(sanitizeEventForIngestion));
export const getEventsBetween = async (
	database: TabotDatabase,
	from: number,
	to: number,
) =>
	sanitizeEventsForRead(
		await database.readEvents({
			from,
			to,
			fromInclusive: true,
			toInclusive: false,
		}),
	);
export const getAllEvents = async (database: TabotDatabase) =>
	sanitizeEventsForRead(await database.readEvents());
export const getPageObservations = (
	database: TabotDatabase,
	from: number,
	to: number,
	limit = 4,
) => {
	if (
		!Number.isFinite(from) ||
		!Number.isFinite(to) ||
		from > to ||
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > 4
	)
		throw new Error("invalid-page-range");
	return database.getPageSummaries(from, to, limit);
};
export const getPageObservationById = (database: TabotDatabase, id: string) =>
	database.getPageObservation(id);
export const getPageCaptureSiteSummaries = (database: TabotDatabase) =>
	database.getPageCaptureSiteSummaries();
export const deletePageObservations = (
	database: TabotDatabase,
	filter: { origin?: string; from?: number; to?: number } = {},
	limit = 500,
) => {
	let invalidOrigin = false;
	if (filter.origin !== undefined) {
		try {
			invalidOrigin = new URL(filter.origin).origin !== filter.origin;
		} catch {
			invalidOrigin = true;
		}
	}
	if (
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > 500 ||
		invalidOrigin ||
		(filter.from !== undefined && !Number.isFinite(filter.from)) ||
		(filter.to !== undefined && !Number.isFinite(filter.to)) ||
		(filter.from !== undefined &&
			filter.to !== undefined &&
			filter.from > filter.to)
	)
		throw new Error("invalid-page-delete-filter");
	return database.deletePageObservations(filter, limit);
};
export const prunePageObservations = (
	database: TabotDatabase,
	maxBytes = 25 * 1024 * 1024,
	maxDeletes = 500,
) => {
	if (
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 1 ||
		!Number.isSafeInteger(maxDeletes) ||
		maxDeletes < 1 ||
		maxDeletes > 500
	)
		throw new Error("invalid-page-storage-budget");
	return database.prunePageObservations(maxBytes, maxDeletes);
};
