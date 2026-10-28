import {
	EventConflictError,
	eventIdentity,
	type HistorySearchOptions,
	type HistorySearchResult,
	type InsertEventsResult,
	logger,
	normalizeEvent,
	normalizePageObservation,
	type PageCaptureSiteSummary,
	type PageObservationSummary,
	pageObservationBudgetFailure,
	pageObservationSizeBytes,
	type StoredIngestRecord,
	type StoredPageObservation,
	type StoredTabEvent,
	sanitizeEventForIngestion,
	sanitizePageObservationForIngestion,
	searchHistory as searchHistoryCore,
	storageErrorCode,
} from "@tabot/shared";
import type { Collection, Document, openDB as openTalaDB } from "taladb";

const DB_NAME = "tabot_events";
const loadTalaDB = async () =>
	(await import("../node_modules/taladb/dist/index.browser.mjs")) as Pick<
		typeof import("taladb"),
		"openDB" | "deriveDocId"
	>;
const COLLECTION = "records";
const STORAGE_MESSAGE = "TABOT_STORAGE_REQUEST";
const isHttpOrigin = (value: string) => {
	try {
		const url = new URL(value);
		return (
			url.origin === value &&
			(url.protocol === "http:" || url.protocol === "https:")
		);
	} catch {
		return false;
	}
};
const LEGACY_DATABASE = "tabot_events";
const MIGRATION_ID = "legacy-indexeddb-to-taladb:v1";
let deriveDocumentId: (kind: Kind, id: string) => string;
type Kind = "event" | "page";
type Envelope = Document & {
	_id: string;
	recordKind: Kind;
	originalId: string;
	timestamp: number;
	pageKey?: string;
	origin?: string;
	identity: string;
	payload: Document;
};
type Filter = { origin?: string; from?: number; to?: number };
type TalaDatabase = Awaited<ReturnType<typeof openTalaDB>>;
let database:
	| Promise<{ db: TalaDatabase; records: Collection<Envelope> }>
	| undefined;
let mutations = Promise.resolve();
let queuedMutations = 0;
let legacyMigration: Promise<void> | undefined;

const openLegacyDb = (name: string): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("legacy-database-open-failed"));
		request.onblocked = () => reject(new Error("legacy-database-open-blocked"));
	});

const readLegacyBatch = (
	source: IDBDatabase,
	storeName: string,
	after?: IDBValidKey,
): Promise<Record<string, unknown>[]> =>
	new Promise((resolve, reject) => {
		const transaction = source.transaction(storeName, "readonly");
		const range =
			after === undefined ? undefined : IDBKeyRange.lowerBound(after, true);
		const request = transaction.objectStore(storeName).getAll(range, 128);
		request.onsuccess = () =>
			resolve(request.result as Record<string, unknown>[]);
		request.onerror = () =>
			reject(request.error ?? new Error("legacy-read-failed"));
	});

const deleteLegacyDb = (name: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(request.error ?? new Error("legacy-delete-failed"));
		request.onblocked = () => reject(new Error("legacy-delete-blocked"));
	});

const prepareLegacyRows = async (
	rows: Record<string, unknown>[],
	kind: Kind,
): Promise<StoredIngestRecord[]> =>
	Promise.all(
		rows.map(async (raw) => {
			if (typeof raw.id !== "string" || !Number.isFinite(raw.timestamp))
				throw new Error("legacy-record-invalid");
			if (kind === "event")
				return normalizeEvent(
					await sanitizeEventForIngestion(raw as unknown as StoredTabEvent),
				);
			return normalizePageObservation(
				await sanitizePageObservationForIngestion({
					...(raw as unknown as StoredPageObservation),
					url: typeof raw.url === "string" ? raw.url : "",
				}),
			);
		}),
	);

const runLegacyMigration = async (
	records: Collection<Envelope>,
	meta: Collection<Document>,
	migrationId: string,
) => {
	legacyMigration ??= (async () => {
		const complete = await meta.findOne({ _id: migrationId });
		const available = await indexedDB.databases();
		if (complete?.state === "verified") {
			if (complete.source === "new-install") {
				if (!available.some((item) => item.name === LEGACY_DATABASE)) return;
				await meta.deleteOne({ _id: migrationId });
			} else {
				if (available.some((item) => item.name === LEGACY_DATABASE))
					await deleteLegacyDb(LEGACY_DATABASE);
				return;
			}
		}
		if (!available.some((item) => item.name === LEGACY_DATABASE)) return;
		const source = await openLegacyDb(LEGACY_DATABASE);
		try {
			const totals = { events: 0, pages: 0 };
			for (const [storeName, kind] of [
				["events", "event"],
				["pages", "page"],
			] as const) {
				if (!source.objectStoreNames.contains(storeName)) continue;
				let lastKey: IDBValidKey | undefined;
				while (true) {
					const rows = await readLegacyBatch(source, storeName, lastKey);
					if (!rows.length) break;
					lastKey = rows[rows.length - 1].id as IDBValidKey;
					const prepared = await prepareLegacyRows(rows, kind);
					const incoming = prepared.map(toEnvelope);
					const existingRows = await records.find({
						_id: { $in: incoming.map((row) => row._id) },
					});
					const existing = new Map(existingRows.map((row) => [row._id, row]));
					const missing = incoming.filter((row) => {
						const found = existing.get(row._id);
						if (!found) return true;
						if (
							found.recordKind !== row.recordKind ||
							found.originalId !== row.originalId ||
							found.identity !== row.identity ||
							JSON.stringify(found.payload) !== JSON.stringify(row.payload)
						)
							throw new EventConflictError("id-conflict");
						return false;
					});
					if (missing.length) await records.insertMany(missing);
					totals[kind === "event" ? "events" : "pages"] += prepared.length;
				}
			}
			const verifiedTotals = { events: 0, pages: 0 };
			for (const [storeName, kind] of [
				["events", "event"],
				["pages", "page"],
			] as const) {
				if (!source.objectStoreNames.contains(storeName)) continue;
				let lastKey: IDBValidKey | undefined;
				while (true) {
					const rows = await readLegacyBatch(source, storeName, lastKey);
					if (!rows.length) break;
					lastKey = rows[rows.length - 1].id as IDBValidKey;
					const expected = (await prepareLegacyRows(rows, kind)).map(
						toEnvelope,
					);
					const found = await records.find({
						_id: { $in: expected.map((row) => row._id) },
					});
					const byId = new Map(found.map((row) => [row._id, row]));
					if (
						expected.some((row) => {
							const actual = byId.get(row._id);
							return (
								!actual ||
								actual.recordKind !== row.recordKind ||
								actual.originalId !== row.originalId ||
								actual.identity !== row.identity ||
								JSON.stringify(actual.payload) !== JSON.stringify(row.payload)
							);
						})
					)
						throw new Error("legacy-verification-failed");
					verifiedTotals[kind === "event" ? "events" : "pages"] += rows.length;
				}
			}
			if (
				verifiedTotals.events !== totals.events ||
				verifiedTotals.pages !== totals.pages
			)
				throw new Error("legacy-verification-failed");
			await meta.insert({
				_id: migrationId,
				source: "legacy",
				state: "verified",
				events: totals.events,
				pages: totals.pages,
				verifiedAt: Date.now(),
			});
		} finally {
			source.close();
		}
		await deleteLegacyDb(LEGACY_DATABASE);
	})().catch((error: unknown) => {
		legacyMigration = undefined;
		throw error;
	});
	return legacyMigration;
};

const getDb = () => {
	database ??= (async () => {
		const { openDB, deriveDocId } = await loadTalaDB();
		deriveDocumentId = (kind, id) =>
			deriveDocId("tabot:records:v1", `${kind}:${id}`);
		const db = await openDB(DB_NAME);
		try {
			const info = await db.storageInfo?.();
			if (
				info?.storage !== "opfs" ||
				!info.durableWrites ||
				info.storageError
			) {
				logger.error("TalaDB storage capabilities rejected", {
					storage: info?.storage ?? null,
					durableWrites: info?.durableWrites ?? null,
					owner: info?.owner ?? null,
					storageError: info?.storageError ?? null,
				});
				throw new Error("authoritative-opfs-unavailable");
			}
			const records = db.collection<Envelope>(COLLECTION);
			await records.createIndex("recordKind");
			await records.createIndex("timestamp");
			await records.createIndex("originalId");
			await records.createIndex("pageKey");
			await records.createIndex("origin");
			const meta = db.collection<Document>("meta");
			await runLegacyMigration(
				records,
				meta,
				deriveDocId("tabot:meta:v1", MIGRATION_ID),
			);
			return { db, records };
		} catch (error) {
			// Initialization can fail after openDB has acquired its worker/OPFS lock.
			await db.close().catch(() => undefined);
			throw error;
		}
	})().catch((error: unknown) => {
		database = undefined;
		throw error;
	});
	return database;
};

const serializeMutation = <T>(work: () => Promise<T>): Promise<T> => {
	if (queuedMutations >= 16) return Promise.reject(new Error("storage-busy"));
	queuedMutations++;
	const result = mutations.then(work, work);
	mutations = result
		.then(
			() => undefined,
			() => undefined,
		)
		.finally(() => {
			queuedMutations--;
		});
	return result;
};

const isPage = (row: StoredIngestRecord): row is StoredPageObservation =>
	"kind" in row && row.kind === "page-observation";
const toEnvelope = (row: StoredIngestRecord): Envelope => {
	const recordKind: Kind = isPage(row) ? "page" : "event";
	const originalId = row.id;
	let origin: string | undefined;
	if (isPage(row)) {
		try {
			origin = new URL(row.url ?? "").origin;
		} catch {}
	}
	return {
		_id: deriveDocumentId(recordKind, originalId),
		recordKind,
		originalId,
		timestamp: row.timestamp,
		...(isPage(row) ? { pageKey: row.pageKey } : {}),
		...(origin ? { origin } : {}),
		identity: isPage(row) ? row.captureIdentity : eventIdentity(row),
		payload: JSON.parse(JSON.stringify(row)) as Document,
	};
};

const commitIngest = async (
	input: StoredIngestRecord[],
): Promise<InsertEventsResult> =>
	serializeMutation(async () => {
		const events = new Map<string, StoredTabEvent>();
		const pages = new Map<string, StoredPageObservation>();
		for (const item of input) {
			if (isPage(item)) {
				const row = normalizePageObservation(
					await sanitizePageObservationForIngestion({
						...item,
						url: item.url ?? "",
					}),
				);
				const previous = pages.get(row.id);
				if (previous && previous.captureIdentity !== row.captureIdentity)
					throw new EventConflictError("id-conflict");
				if (!previous) pages.set(row.id, row);
			} else {
				const row = normalizeEvent(await sanitizeEventForIngestion(item));
				const previous = events.get(row.id);
				if (previous && eventIdentity(previous) !== eventIdentity(row))
					throw new EventConflictError("id-conflict");
				if (!previous) events.set(row.id, row);
			}
		}
		const { records } = await getDb();
		const candidateIds = [
			...[...events.keys()].map((id) => deriveDocumentId("event", id)),
			...[...pages.keys()].map((id) => deriveDocumentId("page", id)),
		];
		const existingRows = candidateIds.length
			? await records.find({ _id: { $in: candidateIds } })
			: [];
		const existing = new Map(existingRows.map((row) => [row._id, row]));
		const missingEvents: StoredTabEvent[] = [];
		for (const row of events.values()) {
			const found = existing.get(deriveDocumentId("event", row.id));
			if (!found) missingEvents.push(row);
			else if (
				found.recordKind !== "event" ||
				found.originalId !== row.id ||
				found.identity !== eventIdentity(row)
			)
				throw new EventConflictError("id-conflict");
		}
		const missingPages: StoredPageObservation[] = [];
		for (const row of pages.values()) {
			const found = existing.get(deriveDocumentId("page", row.id));
			if (!found) missingPages.push(row);
			else if (
				found.recordKind !== "page" ||
				found.originalId !== row.id ||
				found.identity !== row.captureIdentity
			)
				throw new EventConflictError("id-conflict");
		}
		const storedPages = withPayload<StoredPageObservation>(
			await records.find({ recordKind: "page" }),
			"page",
		);
		const ignoredPages: Record<string, string> = {};
		const accepted: StoredPageObservation[] = [];
		const resourceBytes = new Map<string, number>();
		const siteBytes = new Map<string, number>();
		const resourceTimes = new Map<string, number[]>();
		for (const row of [...missingPages].sort(
			(a, b) => a.timestamp - b.timestamp,
		)) {
			let origin: string;
			try {
				origin = new URL(row.url ?? "").origin;
			} catch {
				ignoredPages[row.id] = "invalid-page-url";
				continue;
			}
			const day = Math.floor(row.timestamp / 86_400_000) * 86_400_000;
			const hour = Math.floor(row.timestamp / 3_600_000) * 3_600_000;
			const resourceKey = `${row.pageKey}:${day}`;
			const siteKey = `${origin}:${hour}`;
			const resourceRows = storedPages.filter(
				(page) =>
					page.pageKey === row.pageKey &&
					page.timestamp >= day &&
					page.timestamp < day + 86_400_000,
			);
			const siteRows = storedPages.filter((page) => {
				if (page.timestamp < hour || page.timestamp >= hour + 3_600_000)
					return false;
				try {
					return new URL(page.url ?? "").origin === origin;
				} catch {
					return false;
				}
			});
			if (resourceRows.length >= 1000) {
				ignoredPages[row.id] = "resource-budget-accounting-limit";
				continue;
			}
			if (siteRows.length >= 1000) {
				ignoredPages[row.id] = "site-budget-accounting-limit";
				continue;
			}
			resourceBytes.set(
				resourceKey,
				resourceBytes.get(resourceKey) ??
					resourceRows.reduce(
						(n, item) => n + pageObservationSizeBytes(item),
						0,
					),
			);
			siteBytes.set(
				siteKey,
				siteBytes.get(siteKey) ??
					siteRows.reduce((n, item) => n + pageObservationSizeBytes(item), 0),
			);
			const timestamps =
				resourceTimes.get(resourceKey) ??
				resourceRows.map((item) => item.timestamp);
			const failure = pageObservationBudgetFailure(row, {
				resourceBytes: resourceBytes.get(resourceKey) ?? 0,
				siteBytes: siteBytes.get(siteKey) ?? 0,
				recentTimestamps: timestamps,
			});
			if (failure) {
				ignoredPages[row.id] = failure;
				continue;
			}
			const bytes = pageObservationSizeBytes(row);
			resourceBytes.set(
				resourceKey,
				(resourceBytes.get(resourceKey) ?? 0) + bytes,
			);
			siteBytes.set(siteKey, (siteBytes.get(siteKey) ?? 0) + bytes);
			timestamps.push(row.timestamp);
			resourceTimes.set(resourceKey, timestamps);
			accepted.push(row);
			storedPages.push(row);
		}
		const inserts = [...missingEvents, ...accepted].map(toEnvelope);
		if (inserts.length) await records.insertMany(inserts);
		return {
			inserted: missingEvents.length,
			duplicates:
				input.filter((row) => !isPage(row)).length - missingEvents.length,
			insertedPages: accepted.length,
			duplicatePages:
				input.filter(isPage).length -
				accepted.length -
				Object.keys(ignoredPages).length,
			ignoredPages,
		};
	});

const withPayload = <T extends StoredIngestRecord>(
	rows: Envelope[],
	kind: Kind,
): T[] =>
	rows
		.filter((row) => row.recordKind === kind)
		.map((row) => row.payload as unknown as T);
const eventRange = (
	rows: Envelope[],
	range?: {
		from?: number;
		to?: number;
		fromInclusive?: boolean;
		toInclusive?: boolean;
	},
) =>
	rows
		.filter(
			(row) =>
				row.recordKind === "event" &&
				(range?.from === undefined ||
					(range.fromInclusive === false
						? row.timestamp > range.from
						: row.timestamp >= range.from)) &&
				(range?.to === undefined ||
					(range.toInclusive
						? row.timestamp <= range.to
						: row.timestamp < range.to)),
		)
		.sort(
			(a, b) =>
				a.timestamp - b.timestamp || a.originalId.localeCompare(b.originalId),
		);
const pageSummary = (row: StoredPageObservation): PageObservationSummary => {
	const {
		segments,
		pageKey: _pageKey,
		captureIdentity: _identity,
		...summary
	} = row;
	return { ...summary, segmentCount: segments.length };
};

const methods: Record<string, (...args: never[]) => Promise<unknown>> = {
	commitIngest: (rows) => commitIngest(rows),
	countEvents: async () =>
		(await getDb()).records.count({ recordKind: "event" }),
	countPages: async () => (await getDb()).records.count({ recordKind: "page" }),
	readEvents: async (range) =>
		withPayload<StoredTabEvent>(
			eventRange(await (await getDb()).records.find(), range),
			"event",
		),
	findEvent: async (id) =>
		(await getDb()).records
			.findOne({ recordKind: "event", originalId: id })
			.then((row) => row?.payload as unknown as StoredTabEvent | undefined),
	getPageObservation: async (id) =>
		(await getDb()).records
			.findOne({ recordKind: "page", originalId: id })
			.then(
				(row) => row?.payload as unknown as StoredPageObservation | undefined,
			),
	getPageSummaries: async (from: number, to: number, limit: number = 4) =>
		(await getDb()).records.find({ recordKind: "page" }).then((rows) =>
			rows
				.filter((row) => row.timestamp >= from && row.timestamp < to)
				.sort((a, b) => a.timestamp - b.timestamp)
				.slice(0, limit)
				.map((row) =>
					pageSummary(row.payload as unknown as StoredPageObservation),
				),
		),
	searchHistory: async (
		query: string,
		options: HistorySearchOptions = {},
	): Promise<HistorySearchResult[]> => {
		if (
			!options ||
			typeof options !== "object" ||
			Array.isArray(options) ||
			typeof query !== "string" ||
			query.length > 240 ||
			!query.trim() ||
			(options.from !== undefined && !Number.isFinite(options.from)) ||
			(options.to !== undefined && !Number.isFinite(options.to)) ||
			(options.from !== undefined &&
				options.to !== undefined &&
				options.from > options.to) ||
			(options.origin !== undefined &&
				(typeof options.origin !== "string" ||
					!isHttpOrigin(options.origin))) ||
			(options.limit !== undefined &&
				(!Number.isSafeInteger(options.limit) ||
					options.limit < 1 ||
					options.limit > 20))
		)
			throw new Error("invalid-search-request");
		const rows = await (await getDb()).records.find();
		return searchHistoryCore(
			withPayload<StoredTabEvent>(rows, "event"),
			withPayload<StoredPageObservation>(rows, "page"),
			query,
			options,
		);
	},
	getPageCaptureSiteSummaries: async () => {
		const summaries = new Map<string, PageCaptureSiteSummary>();
		const pages = withPayload<StoredPageObservation>(
			await (await getDb()).records.find(),
			"page",
		);
		for (const page of pages) {
			try {
				const origin = new URL(page.url ?? "").origin;
				const item = summaries.get(origin) ?? {
					origin,
					count: 0,
					latestTimestamp: 0,
				};
				item.count++;
				item.latestTimestamp = Math.max(item.latestTimestamp, page.timestamp);
				summaries.set(origin, item);
			} catch {}
		}
		return [...summaries.values()].sort(
			(a, b) => b.latestTimestamp - a.latestTimestamp,
		);
	},
	deletePageObservations: (filter: Filter = {}, limit: number = 500) =>
		serializeMutation(async () => {
			const { records } = await getDb();
			const rows = (await records.find({ recordKind: "page" }))
				.filter((row) => {
					const page = row.payload as unknown as StoredPageObservation;
					if (filter.from !== undefined && row.timestamp < filter.from)
						return false;
					if (filter.to !== undefined && row.timestamp > filter.to)
						return false;
					if (!filter.origin) return true;
					try {
						return new URL(page.url ?? "").origin === filter.origin;
					} catch {
						return false;
					}
				})
				.sort((a, b) => a.timestamp - b.timestamp)
				.slice(0, limit);
			if (rows.length)
				await records.deleteMany({ _id: { $in: rows.map((row) => row._id) } });
			return { deleted: rows.length, more: rows.length === limit };
		}),
	prunePageObservations: (
		now: number = Date.now(),
		maxBytes: number = 25 * 1024 * 1024,
		maxDeletes: number = 500,
	) =>
		serializeMutation(async () => {
			const { records } = await getDb();
			const pages = (await records.find({ recordKind: "page" })).sort(
				(a, b) => a.timestamp - b.timestamp,
			);
			const expired = pages
				.filter((row) => row.timestamp < now - 7 * 86_400_000)
				.slice(0, maxDeletes);
			if (expired.length) {
				await records.deleteMany({
					_id: { $in: expired.map((row) => row._id) },
				});
				return { deleted: expired.length, more: expired.length === maxDeletes };
			}
			let bytes = pages.reduce(
				(sum, row) => sum + JSON.stringify(row.payload).length * 2,
				0,
			);
			const remove = [];
			for (const row of pages) {
				if (bytes <= maxBytes || remove.length >= maxDeletes) break;
				remove.push(row._id);
				bytes -= JSON.stringify(row.payload).length * 2;
			}
			if (remove.length) await records.deleteMany({ _id: { $in: remove } });
			return { deleted: remove.length, more: bytes > maxBytes };
		}),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (
		message?.kind === "TABOT_STORAGE_PING" &&
		sender.id === chrome.runtime.id &&
		sender.url?.startsWith(chrome.runtime.getURL(""))
	) {
		sendResponse({ ready: true });
		return;
	}
	if (
		message?.kind !== STORAGE_MESSAGE ||
		sender.id !== chrome.runtime.id ||
		!sender.url?.startsWith(chrome.runtime.getURL(""))
	)
		return;
	const { requestId, method, args } = message;
	if (
		!Number.isSafeInteger(requestId) ||
		typeof method !== "string" ||
		!Array.isArray(args) ||
		!methods[method]
	)
		return;
	void methods[method](...(args as never[])).then(
		(value) => sendResponse({ requestId, ok: true, value }),
		(error: unknown) => {
			logger.error("TalaDB request failed", { error });
			sendResponse({
				requestId,
				ok: false,
				code: storageErrorCode(error),
			});
		},
	);
	return true;
});
