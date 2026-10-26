import Dexie, { type Table } from "dexie";
import { logger } from "../lib/logger";
import {
	pageObservationBudgetFailure,
	pageObservationSizeBytes,
} from "../pages/budget";
import type { StoredPageObservation } from "../pages/observations";
import {
	normalizePageObservation,
	sanitizePageObservationForIngestion,
} from "../pages/observations";
import { sanitizeEventForIngestion } from "../privacy/ingest";
import type { TabEventMetadata, TabEventType } from "./events";
import { EventConflictError, eventIdentity, normalizeEvent } from "./ingest";

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

// ponytail: kept for backwards compat — Dexie uses stores() string, not JSON schema
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
		metadata: {
			type: "object",
			properties: {
				x: { type: "number" },
				y: { type: "number" },
				scrollY: { type: "number" },
				previousWindowId: { type: "number" },
				enabled: { type: "boolean" },
				state: { type: "number" },
			},
		},
	},
	required: ["id", "type", "tabId", "windowId", "timestamp"],
	indexes: ["timestamp", "type", "tabId"],
} as const;

export class TabotDatabase extends Dexie {
	events!: Table<StoredTabEvent, string>;
	pages!: Table<StoredPageObservation, string>;
	constructor(name = "tabot_events") {
		super(name);
		// only indexed props — id is PK (inbound), rest are queryable via where()
		this.version(1).stores({
			events: "id, timestamp, type, tabId",
		});
		this.version(2).stores({
			events: "id, timestamp, type, tabId",
			pages: "id, timestamp, pageKey",
		});
	}
}

const DB_NAME = "tabot_events";

const deleteLegacyRxDb = () => {
	try {
		indexedDB.deleteDatabase("tabot_rxdb");
	} catch {}
};

let dbPromise: Promise<TabotDatabase> | null = null;

export const createEventsDb = async (): Promise<TabotDatabase> => {
	if (dbPromise) return dbPromise;
	deleteLegacyRxDb();
	const db = new TabotDatabase(DB_NAME);
	const opening = db
		.open()
		.then(() => db)
		.catch((err) => {
			logger.warn("createEventsDb failed", { error: err });
			if (dbPromise === opening) dbPromise = null;
			throw err;
		});
	dbPromise = opening;
	db.on("close", () => {
		if (dbPromise === opening) dbPromise = null;
	});
	return opening;
};

export interface InsertEventsResult {
	inserted: number;
	duplicates: number;
	insertedPages?: number;
	duplicatePages?: number;
	ignoredPages?: Record<string, string>;
}

export type StoredIngestRecord = StoredTabEvent | StoredPageObservation;
const isPageObservation = (
	row: StoredIngestRecord,
): row is StoredPageObservation =>
	"kind" in row && row.kind === "page-observation";

/** Shared atomic commit for events and page evidence; all privacy work happens before transaction. */
export const bulkInsertIngestRecords = async (
	db: TabotDatabase,
	docs: StoredIngestRecord[],
): Promise<InsertEventsResult> => {
	const events = new Map<string, StoredTabEvent>();
	const pages = new Map<string, StoredPageObservation>();
	for (const input of docs) {
		if (isPageObservation(input)) {
			const row = normalizePageObservation(
				await sanitizePageObservationForIngestion({
					...input,
					url: input.url ?? "",
				}),
			);
			const previous = pages.get(row.id);
			if (previous && previous.captureIdentity !== row.captureIdentity)
				throw new EventConflictError("id-conflict");
			if (!previous) pages.set(row.id, row);
		} else {
			const row = normalizeEvent(await sanitizeEventForIngestion(input));
			const previous = events.get(row.id);
			if (previous && eventIdentity(previous) !== eventIdentity(row))
				throw new EventConflictError("id-conflict");
			if (!previous) events.set(row.id, row);
		}
	}
	if (!events.size && !pages.size)
		return { inserted: 0, duplicates: 0, insertedPages: 0, duplicatePages: 0 };
	return db.transaction("rw", db.events, db.pages, async () => {
		const eventRows = [...events.values()];
		const existingEvents = await db.events.bulkGet(
			eventRows.map((row) => row.id),
		);
		const missingEvents: StoredTabEvent[] = [];
		eventRows.forEach((row, i) => {
			if (!existingEvents[i]) missingEvents.push(row);
			else if (
				eventIdentity(existingEvents[i] as StoredTabEvent) !==
				eventIdentity(row)
			)
				throw new EventConflictError("id-conflict");
		});
		const pageRows = [...pages.values()];
		const existingPages = await db.pages.bulkGet(pageRows.map((row) => row.id));
		const missingPages: StoredPageObservation[] = [];
		pageRows.forEach((row, i) => {
			if (!existingPages[i]) missingPages.push(row);
			else if (
				(existingPages[i] as StoredPageObservation).captureIdentity !==
				row.captureIdentity
			)
				throw new EventConflictError("id-conflict");
		});
		const acceptedPages: StoredPageObservation[] = [];
		const ignoredPages: Record<string, string> = {};
		const resourceBytes = new Map<string, number>();
		const siteBytes = new Map<string, number>();
		const resourceRecent = new Map<string, number[]>();
		for (const row of missingPages.toSorted(
			(a, b) => a.timestamp - b.timestamp,
		)) {
			const dayStart = Math.floor(row.timestamp / 86_400_000) * 86_400_000;
			const hourStart = Math.floor(row.timestamp / 3_600_000) * 3_600_000;
			let origin: string;
			try {
				origin = new URL(row.url ?? "").origin;
			} catch {
				ignoredPages[row.id] = "invalid-page-url";
				continue;
			}
			const resourceKey = `${row.pageKey}:${dayStart}`;
			const siteKey = `${origin}:${hourStart}`;
			if (!resourceBytes.has(resourceKey)) {
				const stored = await db.pages
					.where("pageKey")
					.equals(row.pageKey)
					.and(
						(item) =>
							item.timestamp >= dayStart &&
							item.timestamp < dayStart + 86_400_000,
					)
					.limit(1000)
					.toArray();
				if (stored.length >= 1000) {
					ignoredPages[row.id] = "resource-budget-accounting-limit";
					continue;
				}
				resourceBytes.set(
					resourceKey,
					stored.reduce((sum, item) => sum + pageObservationSizeBytes(item), 0),
				);
				resourceRecent.set(
					resourceKey,
					stored.map((item) => item.timestamp),
				);
			}
			if (!siteBytes.has(siteKey)) {
				const stored = await db.pages
					.where("timestamp")
					.between(hourStart, hourStart + 3_600_000, true, false)
					.filter((item) => {
						try {
							return new URL(item.url ?? "").origin === origin;
						} catch {
							return false;
						}
					})
					.limit(1000)
					.toArray();
				if (stored.length >= 1000) {
					ignoredPages[row.id] = "site-budget-accounting-limit";
					continue;
				}
				siteBytes.set(
					siteKey,
					stored.reduce((sum, item) => sum + pageObservationSizeBytes(item), 0),
				);
			}
			const recentTimestamps = resourceRecent.get(resourceKey) ?? [];
			const budgetFailure = pageObservationBudgetFailure(row, {
				resourceBytes: resourceBytes.get(resourceKey) ?? 0,
				siteBytes: siteBytes.get(siteKey) ?? 0,
				recentTimestamps,
			});
			if (budgetFailure) {
				ignoredPages[row.id] = budgetFailure;
				continue;
			}
			const bytes = pageObservationSizeBytes(row);
			acceptedPages.push(row);
			resourceBytes.set(
				resourceKey,
				(resourceBytes.get(resourceKey) ?? 0) + bytes,
			);
			siteBytes.set(siteKey, (siteBytes.get(siteKey) ?? 0) + bytes);
			recentTimestamps.push(row.timestamp);
		}
		if (missingEvents.length) await db.events.bulkAdd(missingEvents);
		if (acceptedPages.length) await db.pages.bulkAdd(acceptedPages);
		return {
			inserted: missingEvents.length,
			duplicates:
				docs.filter((row) => !isPageObservation(row)).length -
				missingEvents.length,
			insertedPages: acceptedPages.length,
			duplicatePages:
				docs.filter(isPageObservation).length -
				acceptedPages.length -
				Object.keys(ignoredPages).length,
			ignoredPages,
		};
	});
};

/** Resolves only after commit. Any row failure rolls back the entire batch. */
export const bulkInsertEvents = async (
	db: TabotDatabase,
	docs: StoredTabEvent[],
): Promise<InsertEventsResult> => bulkInsertIngestRecords(db, docs);

export const countEvents = async (db: TabotDatabase): Promise<number> => {
	try {
		return await db.events.count();
	} catch (err) {
		logger.warn("countEvents failed", { error: err });
		throw err;
	}
};

/** Indexed local range read; end is exclusive, matching activity metrics. */
export const sanitizeEventsForRead = async (
	rows: StoredTabEvent[],
): Promise<StoredTabEvent[]> =>
	Promise.all(rows.map(sanitizeEventForIngestion));

export const getEventsBetween = async (
	db: TabotDatabase,
	from: number,
	to: number,
): Promise<StoredTabEvent[]> =>
	sanitizeEventsForRead(
		await db.events.where("timestamp").between(from, to, true, false).toArray(),
	);

export const getAllEvents = async (
	db: TabotDatabase,
): Promise<StoredTabEvent[]> =>
	sanitizeEventsForRead(await db.events.toArray());

/** At most four 32 KiB observations (128 KiB total); never joins event/session reads. */
export type PageObservationSummary = Omit<
	StoredPageObservation,
	"segments" | "pageKey" | "captureIdentity"
> & { segmentCount: number };

export const getPageObservations = async (
	db: TabotDatabase,
	from: number,
	to: number,
	limit = 4,
): Promise<PageObservationSummary[]> => {
	if (
		!Number.isFinite(from) ||
		!Number.isFinite(to) ||
		from > to ||
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > 4
	)
		throw new Error("invalid-page-range");
	const rows = await db.pages
		.where("timestamp")
		.between(from, to, true, false)
		.limit(limit)
		.toArray();
	return rows.map(
		({ segments, pageKey: _pageKey, captureIdentity: _identity, ...row }) => ({
			...row,
			segmentCount: segments.length,
		}),
	);
};

export const getPageObservationById = (
	db: TabotDatabase,
	id: string,
): Promise<StoredPageObservation | undefined> => db.pages.get(id);

export interface PageCaptureSiteSummary {
	origin: string;
	count: number;
	latestTimestamp: number;
}

/** Small metadata-only aggregation for consent and deletion controls. */
export const getPageCaptureSiteSummaries = async (
	db: TabotDatabase,
): Promise<PageCaptureSiteSummary[]> => {
	const sites = new Map<string, PageCaptureSiteSummary>();
	await db.pages.each(({ url, timestamp }) => {
		if (!url) return;
		try {
			const origin = new URL(url).origin;
			const summary = sites.get(origin) ?? {
				origin,
				count: 0,
				latestTimestamp: 0,
			};
			summary.count++;
			summary.latestTimestamp = Math.max(summary.latestTimestamp, timestamp);
			sites.set(origin, summary);
		} catch {}
	});
	return [...sites.values()].sort(
		(a, b) => b.latestTimestamp - a.latestTimestamp,
	);
};

/** Delete at most 500 rows per call; repeat while `more` is true. */
export const deletePageObservations = async (
	db: TabotDatabase,
	filter: { origin?: string; from?: number; to?: number } = {},
	limit = 500,
): Promise<{ deleted: number; more: boolean }> => {
	if (
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > 500 ||
		(filter.origin !== undefined &&
			(() => {
				try {
					return new URL(filter.origin).origin !== filter.origin;
				} catch {
					return true;
				}
			})()) ||
		(filter.from !== undefined && !Number.isFinite(filter.from)) ||
		(filter.to !== undefined && !Number.isFinite(filter.to)) ||
		(filter.from !== undefined &&
			filter.to !== undefined &&
			filter.from > filter.to)
	)
		throw new Error("invalid-page-delete-filter");
	let collection = db.pages.orderBy("timestamp");
	if (filter.from !== undefined || filter.to !== undefined) {
		collection = db.pages
			.where("timestamp")
			.between(
				filter.from ?? Dexie.minKey,
				filter.to ?? Dexie.maxKey,
				true,
				true,
			);
	}
	const rows = await collection
		.filter((row) => {
			if (!filter.origin) return true;
			try {
				return new URL(row.url ?? "").origin === filter.origin;
			} catch {
				return false;
			}
		})
		.limit(limit)
		.primaryKeys();
	if (rows.length) await db.pages.bulkDelete(rows);
	return { deleted: rows.length, more: rows.length === limit };
};

/** Prunes expired/over-budget rows in bounded batches. Repeat while `more` is true. */
export const prunePageObservations = async (
	db: TabotDatabase,
	now = Date.now(),
	maxBytes = 25 * 1024 * 1024,
	maxDeletes = 500,
): Promise<{ deleted: number; more: boolean }> => {
	if (
		!Number.isFinite(now) ||
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 1 ||
		!Number.isSafeInteger(maxDeletes) ||
		maxDeletes < 1 ||
		maxDeletes > 500
	)
		throw new Error("invalid-page-retention-limit");
	return db.transaction("rw", db.pages, async () => {
		const cutoff = now - 7 * 24 * 60 * 60 * 1000;
		const expired = await db.pages
			.where("timestamp")
			.below(cutoff)
			.limit(maxDeletes)
			.primaryKeys();
		if (expired.length) {
			await db.pages.bulkDelete(expired);
			return { deleted: expired.length, more: expired.length === maxDeletes };
		}
		let bytes = 0;
		await db.pages.each((row) => {
			bytes += JSON.stringify(row).length * 2;
		});
		if (bytes <= maxBytes) return { deleted: 0, more: false };
		const oldest: string[] = [];
		let released = 0;
		await db.pages.orderBy("timestamp").each((row) => {
			if (released >= bytes - maxBytes || oldest.length >= maxDeletes) return;
			oldest.push(row.id);
			released += JSON.stringify(row).length * 2;
		});
		if (oldest.length) await db.pages.bulkDelete(oldest);
		return { deleted: oldest.length, more: released < bytes - maxBytes };
	});
};
