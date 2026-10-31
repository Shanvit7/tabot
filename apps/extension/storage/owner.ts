import {
	EventConflictError,
	eventIdentity,
	type HistorySearchOptions,
	type HistorySearchResult,
	type InsertEventsResult,
	logger,
	normalizeEvent,
	type PageCaptureSiteSummary,
	type PageObservationSummary,
	pageObservationBudgetFailure,
	pageObservationSizeBytes,
	parseRecentSearchQuestion,
	type SearchAvailability,
	type StoredIngestRecord,
	type StoredPageObservation,
	type StoredTabEvent,
	safeRecallUrl,
	sanitizeEventForIngestion,
	sanitizePageObservationForIngestion,
	searchHistory as searchHistoryCore,
	searchQueryFromUrl,
	storageErrorCode,
} from "@tabot/shared";
import type {
	Collection,
	Document,
	openDB as openTalaDB,
	Filter as TalaFilter,
} from "taladb";
import { embedSearchText } from "./search-embedding";
import { fuseCandidateUrls } from "./search-ranking";

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
const SEARCH_BACKFILL_ID = "semantic-search-backfill:v3";
const SEARCH_MODEL_VERSION = "multi-qa-MiniLM-L6-cos-v1:3c96c1df:chunks-v1";
const SEARCH_DIMENSIONS = 384;
// search-quality.check.mts: 0.20 improves recall without no-answer hits on labeled cases.
const SEARCH_MIN_COSINE_SIMILARITY = 0.2;
let deriveDocumentId: (kind: Kind, id: string) => string;
let deriveSearchJobId: (kind: Kind, id: string) => string;
let deriveSearchPassageId: (id: string) => string;
let deriveSearchCacheId: (id: string) => string;
let deriveSearchBackfillId: () => string;
type Kind = "event" | "page";
type Envelope = Document & {
	_id: string;
	recordKind: Kind | "search-job";
	originalId: string;
	timestamp: number;
	pageKey?: string;
	origin?: string;
	searchText?: string;
	searchTextVersion?: number;
	searchIndexVersion?: number;
	searchSourceKind?: Kind;
	searchSourceId?: string;
	identity: string;
	payload: Document;
};
type SearchPassage = Document & {
	_id: string;
	modelVersion: string;
	embeddingCacheId: string;
	sourceKind: Kind;
	sourceId: string;
	segmentIndex: number;
	url: string;
	origin: string;
	timestamp: number;
	text: string;
	embedding: number[];
	eventCount?: number;
	lastEventId?: string;
};
type SearchEmbeddingCache = Document & {
	_id: string;
	modelVersion: string;
	embedding: number[];
};
type Filter = { origin?: string; from?: number; to?: number };
type TalaDatabase = Awaited<ReturnType<typeof openTalaDB>>;
let database:
	| Promise<{
			db: TalaDatabase;
			records: Collection<Envelope>;
			passages: Collection<SearchPassage>;
			embeddings: Collection<SearchEmbeddingCache>;
			meta: Collection<Document>;
	  }>
	| undefined;
let searchBackfillReady = false;
let searchModelStatus: SearchAvailability["model"] = "not-loaded";
let semanticSearchAvailable = true;
let searchIndexer: Promise<void> | undefined;
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
			return sanitizePageObservationForIngestion({
				...(raw as unknown as StoredPageObservation),
				url: typeof raw.url === "string" ? raw.url : "",
			});
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
		deriveSearchJobId = (kind, id) =>
			deriveDocId("tabot:search-job:v1", `${kind}:${id}`);
		deriveSearchPassageId = (id) => deriveDocId("tabot:search-passage:v2", id);
		deriveSearchCacheId = (id) => deriveDocId("tabot:search-embedding:v1", id);
		deriveSearchBackfillId = () =>
			deriveDocId("tabot:meta:v1", SEARCH_BACKFILL_ID);
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
			await records.createFtsIndex("searchText");
			const passages = db.collection<SearchPassage>("search_passages");
			await passages.createFtsIndex("text");
			await passages.createVectorIndex("embedding", {
				dimensions: SEARCH_DIMENSIONS,
				metric: "cosine",
				indexType: "flat",
			});
			const embeddings =
				db.collection<SearchEmbeddingCache>("search_embeddings");
			const meta = db.collection<Document>("meta");
			await runLegacyMigration(
				records,
				meta,
				deriveDocId("tabot:meta:v1", MIGRATION_ID),
			);
			return { db, records, passages, embeddings, meta };
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
const searchTextFor = (row: StoredIngestRecord) => {
	const url = safeRecallUrl(row.url);
	if (!url) return "";
	const body = isPage(row)
		? `${row.title ?? ""} ${row.segments.join(" ")}`
		: `${row.type.replaceAll("_", " ")} ${searchQueryFromUrl(row.url) ?? ""}`;
	return `${url.hostname} ${url.pathname} ${body}`.slice(0, 8_000);
};
const toSearchJobEnvelope = (row: StoredIngestRecord): Envelope => {
	const kind: Kind = isPage(row) ? "page" : "event";
	return {
		_id: deriveSearchJobId(kind, row.id),
		recordKind: "search-job",
		originalId: row.id,
		timestamp: row.timestamp,
		searchSourceKind: kind,
		searchSourceId: row.id,
		identity: `${kind}:${row.id}`,
		payload: {},
	};
};
const toEnvelope = (row: StoredIngestRecord): Envelope => {
	const recordKind: Kind = isPage(row) ? "page" : "event";
	const originalId = row.id;
	const url = safeRecallUrl(row.url);
	const origin = url?.origin;
	return {
		_id: deriveDocumentId(recordKind, originalId),
		recordKind,
		originalId,
		timestamp: row.timestamp,
		...(isPage(row) ? { pageKey: row.pageKey } : {}),
		...(origin ? { origin } : {}),
		searchText: searchTextFor(row),
		searchTextVersion: 2,
		identity: isPage(row) ? row.captureIdentity : eventIdentity(row),
		payload: JSON.parse(JSON.stringify(row)) as Document,
	};
};

const splitSearchText = (text: string) => {
	const chunks: string[] = [];
	const size = 400;
	const overlap = 64;
	for (let start = 0; start < text.length; start += size - overlap) {
		const chunk = text.slice(start, start + size).trim();
		if (chunk) chunks.push(chunk);
	}
	return chunks;
};
const encodeSearchText = async (text: string) => {
	searchModelStatus = "loading";
	try {
		const vector = await embedSearchText(text);
		searchModelStatus = "ready";
		return vector;
	} catch (error) {
		searchModelStatus = "unavailable";
		throw error;
	}
};

const embeddingFor = async (
	text: string,
	embeddings: Collection<SearchEmbeddingCache>,
) => {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`${SEARCH_MODEL_VERSION}\0${text}`),
	);
	const hash = Array.from(new Uint8Array(bytes), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
	const _id = deriveSearchCacheId(hash);
	const existing = await embeddings.findOne({ _id });
	if (existing) return { id: _id, vector: existing.embedding };
	const vector = await encodeSearchText(text);
	await serializeMutation(async () => {
		if (!(await embeddings.findOne({ _id })))
			await embeddings.insert({
				_id,
				modelVersion: SEARCH_MODEL_VERSION,
				embedding: vector,
			});
	});
	return { id: _id, vector };
};

const ensureSearchBackfill = async (
	records: Collection<Envelope>,
	meta: Collection<Document>,
) => {
	if (searchBackfillReady) return;
	const marker = await meta.findOne({ _id: deriveSearchBackfillId() });
	if (marker) {
		searchBackfillReady = marker.state === "complete";
		return;
	}
	const rows = await records.find();
	for (const row of rows) {
		if (
			(row.recordKind !== "event" && row.recordKind !== "page") ||
			row.searchTextVersion === 2
		)
			continue;
		const payload = row.payload as unknown as StoredIngestRecord;
		await serializeMutation(() =>
			records.updateOne(
				{ _id: row._id },
				{
					$set: {
						searchText: searchTextFor(payload),
						searchTextVersion: 2,
						...(safeRecallUrl(payload.url)
							? { origin: safeRecallUrl(payload.url)?.origin }
							: {}),
					},
				},
			),
		);
	}
	const jobs = await records.find({ recordKind: "search-job" });
	const queuedIds = new Set(
		jobs.map((job) => `${job.searchSourceKind}:${job.searchSourceId}`),
	);
	const missing = rows
		.filter(
			(row) =>
				(row.recordKind === "event" || row.recordKind === "page") &&
				row.searchIndexVersion !== 2 &&
				!queuedIds.has(`${row.recordKind}:${row.originalId}`),
		)
		.map((row) =>
			toSearchJobEnvelope(row.payload as unknown as StoredIngestRecord),
		);
	for (let start = 0; start < missing.length; start += 128) {
		const batch = missing.slice(start, start + 128);
		await serializeMutation(() =>
			records.insertMany(batch).then(() => undefined),
		);
	}
	await meta.insert({
		_id: deriveSearchBackfillId(),
		state: "running",
		version: 2,
	});
};

const deleteSearchPassages = async (
	passages: Collection<SearchPassage>,
	embeddings: Collection<SearchEmbeddingCache>,
	sourceIds: string[],
) => {
	const removed = await passages.find({ sourceId: { $in: sourceIds } });
	await passages.deleteMany({ sourceId: { $in: sourceIds } });
	for (const cacheId of new Set(removed.map((row) => row.embeddingCacheId)))
		if (!(await passages.findOne({ embeddingCacheId: cacheId })))
			await embeddings.deleteOne({ _id: cacheId });
};

const nextSearchJob = async (records: Collection<Envelope>) => {
	const rows = await records.aggregate([
		{ $match: { recordKind: "search-job" } },
		{ $sort: { timestamp: 1 } },
		{ $limit: 1 },
	]);
	return rows[0] as Envelope | undefined;
};

const runSearchIndexer = async () => {
	const { records, passages, embeddings, meta } = await getDb();
	await ensureSearchBackfill(records, meta);
	while (true) {
		const job = await nextSearchJob(records);
		if (!job) {
			const backfillId = deriveSearchBackfillId();
			await meta.updateOne(
				{ _id: backfillId },
				{ $set: { state: "complete", completedAt: Date.now() } },
			);
			searchBackfillReady = true;
			return;
		}
		const sourceKind = job.searchSourceKind ?? "page";
		const source = await records.findOne({
			recordKind: sourceKind,
			originalId: job.searchSourceId,
		});
		if (!source || !job.searchSourceId) {
			await serializeMutation(() =>
				records.deleteOne({ _id: job._id }).then(() => undefined),
			);
			continue;
		}
		const payload = source.payload as unknown as StoredIngestRecord;
		const url = safeRecallUrl(payload.url);
		if (!url) {
			await serializeMutation(() =>
				records.deleteOne({ _id: job._id }).then(() => undefined),
			);
			continue;
		}
		if (sourceKind === "event") {
			const event = payload as StoredTabEvent;
			const searchQuery = searchQueryFromUrl(event.url);
			const passageId = deriveSearchPassageId(
				searchQuery
					? `${SEARCH_MODEL_VERSION}:url:${url.href}:query:${searchQuery}`
					: `${SEARCH_MODEL_VERSION}:url:${url.href}`,
			);
			const existing = await passages.findOne({ _id: passageId });
			const text = `${url.hostname} ${url.pathname} ${searchQuery ?? ""}`;
			const cached = existing
				? undefined
				: await embeddingFor(text, embeddings);
			await serializeMutation(async () => {
				const currentSource = await records.findOne({ _id: source._id });
				const currentJob = await records.findOne({ _id: job._id });
				if (currentSource && currentJob) {
					if (existing) {
						await passages.updateOne(
							{ _id: passageId, lastEventId: { $ne: event.id } },
							{
								$set: {
									sourceId: event.id,
									timestamp: event.timestamp,
									text,
									lastEventId: event.id,
								},
								$inc: { eventCount: 1 },
							},
						);
					} else if (cached) {
						await passages.insert({
							_id: passageId,
							modelVersion: SEARCH_MODEL_VERSION,
							embeddingCacheId: cached.id,
							sourceKind: "event",
							sourceId: event.id,
							segmentIndex: -1,
							url: url.href,
							origin: url.origin,
							timestamp: event.timestamp,
							text,
							embedding: cached.vector,
							eventCount: 1,
							lastEventId: event.id,
						});
					}
					await records.updateOne(
						{ _id: source._id },
						{ $set: { searchIndexVersion: 2 } },
					);
				}
				if (currentJob) await records.deleteOne({ _id: job._id });
			});
			continue;
		}
		const page = payload as StoredPageObservation;
		const chunks = [
			...(page.title ? [{ text: page.title, segmentIndex: -1 }] : []),
			...page.segments.flatMap((segment, segmentIndex) =>
				splitSearchText(segment).map((text) => ({ text, segmentIndex })),
			),
		].map(({ text, segmentIndex }) => ({
			text: `${url.hostname} ${url.pathname} ${text}`,
			segmentIndex,
		}));
		const indexed: SearchPassage[] = [];
		for (let index = 0; index < chunks.length; index++) {
			const chunk = chunks[index];
			if (!chunk) continue;
			const cached = await embeddingFor(chunk.text, embeddings);
			indexed.push({
				_id: deriveSearchPassageId(
					`${SEARCH_MODEL_VERSION}:${page.id}:${index}`,
				),
				modelVersion: SEARCH_MODEL_VERSION,
				embeddingCacheId: cached.id,
				sourceKind: "page",
				sourceId: page.id,
				segmentIndex: chunk.segmentIndex,
				url: url.href,
				origin: url.origin,
				timestamp: page.timestamp,
				text: chunk.text,
				embedding: cached.vector,
			});
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
		await serializeMutation(async () => {
			const currentSource = await records.findOne({ _id: source._id });
			const currentJob = await records.findOne({ _id: job._id });
			if (currentSource && currentJob) {
				await passages.deleteMany({ sourceKind: "page", sourceId: page.id });
				for (const passage of indexed) {
					if (!(await passages.findOne({ _id: passage._id })))
						await passages.insert(passage);
				}
				await records.updateOne(
					{ _id: source._id },
					{ $set: { searchIndexVersion: 2 } },
				);
			}
			if (currentJob) await records.deleteOne({ _id: job._id });
		});
	}
};

const scheduleSearchIndexer = (force = false) => {
	if (searchIndexer || (!force && searchBackfillReady)) return;
	searchIndexer = runSearchIndexer()
		.catch((error: unknown) => {
			logger.warn("TalaDB search indexing paused", {
				code: error instanceof Error ? error.message : "indexing-failed",
			});
		})
		.finally(() => {
			searchIndexer = undefined;
		});
};

const commitIngest = async (
	input: StoredIngestRecord[],
): Promise<InsertEventsResult> =>
	serializeMutation(async () => {
		const events = new Map<string, StoredTabEvent>();
		const pages = new Map<string, StoredPageObservation>();
		for (const item of input) {
			if (isPage(item)) {
				const row = await sanitizePageObservationForIngestion({
					...item,
					url: item.url ?? "",
				});
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
		const sources = [...missingEvents, ...accepted];
		const inserts = [
			...sources.map(toEnvelope),
			...sources.map(toSearchJobEnvelope),
		];
		if (inserts.length) await records.insertMany(inserts);
		if (sources.length) scheduleSearchIndexer(true);
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
	getFirstEventTimestamp: async () => {
		const rows = await (await getDb()).records.aggregate([
			{ $match: { recordKind: "event" } },
			{ $sort: { timestamp: 1 } },
			{ $limit: 1 },
		]);
		return rows[0]?.timestamp ?? null;
	},
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
	readRelatedActivity: async (
		anchors: number[],
		pageKeys: string[],
		origins: string[],
		seedIds: string[],
		maxGapMs: number,
		limit: number,
		offset: number,
		to: number,
	) => {
		if (
			!Array.isArray(anchors) ||
			anchors.length < 1 ||
			anchors.length > 8 ||
			anchors.some(
				(timestamp) => !Number.isSafeInteger(timestamp) || timestamp < 0,
			) ||
			!Array.isArray(pageKeys) ||
			pageKeys.length > 8 ||
			pageKeys.some((key) => typeof key !== "string" || key.length > 2_048) ||
			!Array.isArray(origins) ||
			origins.length > 8 ||
			origins.some(
				(origin) => typeof origin !== "string" || !isHttpOrigin(origin),
			) ||
			!Array.isArray(seedIds) ||
			seedIds.length < 1 ||
			seedIds.length > 8 ||
			seedIds.some((id) => typeof id !== "string" || id.length > 64) ||
			!Number.isSafeInteger(maxGapMs) ||
			maxGapMs < 1 ||
			maxGapMs > 30 * 24 * 60 * 60 * 1000 ||
			!Number.isSafeInteger(limit) ||
			limit < 1 ||
			limit > 8 ||
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			offset > 999_999 ||
			!Number.isSafeInteger(to) ||
			to < 1
		)
			throw new Error("invalid-related-evidence-query");
		const identityFilters: TalaFilter<Envelope>[] = [
			...pageKeys.map((pageKey) => ({ pageKey })),
			...origins.map((origin) => ({ origin })),
		];
		const timeFilters = anchors.map(
			(timestamp): TalaFilter<Envelope> => ({
				timestamp: {
					$gte: Math.max(0, timestamp - maxGapMs),
					$lte: Math.min(to, timestamp + maxGapMs),
				},
			}),
		);
		const rows = await (await getDb()).records.aggregate<Envelope>([
			{
				$match: {
					$and: [
						{ recordKind: { $in: ["event", "page"] } },
						{ timestamp: { $lte: to } },
						{ originalId: { $nin: seedIds } },
						{ $or: [...identityFilters, ...timeFilters] },
					],
				},
			},
			{ $sort: { timestamp: -1, _id: 1 } },
			{ $skip: offset },
			{ $limit: limit + 1 },
		]);
		return rows.map((row) => row.payload as unknown as StoredIngestRecord);
	},
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
					options.limit > 20)) ||
			(options.offset !== undefined &&
				(!Number.isSafeInteger(options.offset) || options.offset < 0))
		)
			throw new Error("invalid-search-request");
		const temporal = parseRecentSearchQuestion(query);
		if (temporal) {
			const { records } = await getDb();
			const from = Math.max(temporal.from, options.from ?? 0);
			const to = Math.min(temporal.to, options.to ?? Number.MAX_SAFE_INTEGER);
			if (from > to) return [];
			const rows = await records.find({
				recordKind: "event",
				timestamp: { $gte: from, $lte: to },
				...(options.origin ? { origin: options.origin } : {}),
			});
			const events = withPayload<StoredTabEvent>(rows, "event").filter(
				(event) => Boolean(searchQueryFromUrl(event.url)),
			);
			return searchHistoryCore(events, [], "", {
				...options,
				...temporal,
				from,
				to,
				candidateOrder: undefined,
			});
		}
		const { records, passages, meta } = await getDb();
		if (!searchBackfillReady) {
			const marker = await meta.findOne({ _id: deriveSearchBackfillId() });
			searchBackfillReady = marker?.state === "complete";
		}
		if (!searchBackfillReady) {
			scheduleSearchIndexer();
			const timeFilter =
				options.from === undefined && options.to === undefined
					? {}
					: {
							timestamp: {
								...(options.from !== undefined ? { $gte: options.from } : {}),
								...(options.to !== undefined ? { $lte: options.to } : {}),
							},
						};
			const [eventRows, pageRows] = await Promise.all([
				records.find({ recordKind: "event", ...timeFilter }),
				records.find({
					recordKind: "page",
					...(options.origin ? { origin: options.origin } : {}),
					...timeFilter,
				}),
			]);
			return searchHistoryCore(
				withPayload<StoredTabEvent>(eventRows, "event"),
				withPayload<StoredPageObservation>(pageRows, "page"),
				query,
				options,
			);
		}
		scheduleSearchIndexer();
		const limit = options.limit ?? 20;
		const candidateLimit = Math.min(
			500,
			Math.max(100, ((options.offset ?? 0) + limit) * 10),
		);
		const filter = {
			...(options.origin ? { origin: options.origin } : {}),
			...(options.from !== undefined || options.to !== undefined
				? {
						timestamp: {
							...(options.from !== undefined ? { $gte: options.from } : {}),
							...(options.to !== undefined ? { $lte: options.to } : {}),
						},
					}
				: {}),
		};
		const [textHits, passageCount] = await Promise.all([
			records.searchText("searchText", query, candidateLimit, filter),
			passages.count({ modelVersion: SEARCH_MODEL_VERSION, ...filter }),
		]);
		let semanticHits: Awaited<ReturnType<typeof passages.hybridSearch>> = [];
		if (passageCount) {
			try {
				const vector = await encodeSearchText(query);
				const vectorFilter = { modelVersion: SEARCH_MODEL_VERSION, ...filter };
				const [hybridHits, vectorHits] = await Promise.all([
					passages.hybridSearch(
						{ textField: "text", text: query },
						{ vectorField: "embedding", vector },
						candidateLimit,
						vectorFilter,
						{ candidates: candidateLimit },
					),
					passages.findNearest(
						"embedding",
						vector,
						candidateLimit,
						vectorFilter,
					),
				]);
				const similarity = new Map(
					vectorHits.map(({ document, score }) => [document._id, score]),
				);
				semanticHits = hybridHits.filter(
					(hit) =>
						hit.textRank !== null ||
						(similarity.get(hit.document._id) ?? -1) >=
							SEARCH_MIN_COSINE_SIMILARITY,
				);
				semanticSearchAvailable = true;
			} catch (error) {
				semanticSearchAvailable = false;
				logger.warn("Semantic search unavailable; using TalaDB text search", {
					code:
						error instanceof Error ? error.message : "embedding-unavailable",
				});
			}
		}
		const sourceIds = new Set<string>();
		for (const { document } of textHits)
			if (document.recordKind === "event" || document.recordKind === "page")
				sourceIds.add(document._id);
		for (const { document } of semanticHits)
			sourceIds.add(deriveDocumentId(document.sourceKind, document.sourceId));
		const sourceRows = sourceIds.size
			? await records.find({ _id: { $in: [...sourceIds] } })
			: [];
		const sourceById = new Map(sourceRows.map((row) => [row._id, row]));
		const rankedUrls = [
			semanticHits.map(({ document }) =>
				sourceById.get(
					deriveDocumentId(document.sourceKind, document.sourceId),
				),
			),
			textHits.map(({ document }) => sourceById.get(document._id)),
		].map((rows) =>
			rows.flatMap((row) => {
				if (!row || (row.recordKind !== "event" && row.recordKind !== "page"))
					return [];
				const url = safeRecallUrl((row.payload as { url?: string }).url)?.href;
				return url ? [url] : [];
			}),
		);
		const candidateOrder = fuseCandidateUrls(rankedUrls);
		const eventRows = sourceRows.filter((row) => row.recordKind === "event");
		const pageRows = sourceRows.filter((row) => row.recordKind === "page");
		return searchHistoryCore(
			withPayload<StoredTabEvent>(eventRows, "event"),
			withPayload<StoredPageObservation>(pageRows, "page"),
			query,
			{ ...options, candidateOrder },
		);
	},
	getSearchStatus: async (): Promise<SearchAvailability> => {
		const { records, passages, meta } = await getDb();
		const [marker, pendingJobs, indexedPassages] = await Promise.all([
			meta.findOne({ _id: deriveSearchBackfillId() }),
			records.count({ recordKind: "search-job" }),
			passages.count({ modelVersion: SEARCH_MODEL_VERSION }),
		]);
		const indexing =
			!searchBackfillReady || marker?.state === "running" || pendingJobs > 0;
		return {
			mode:
				!indexing &&
				indexedPassages > 0 &&
				searchModelStatus === "ready" &&
				semanticSearchAvailable
					? "hybrid"
					: "keyword",
			indexing,
			model: searchModelStatus,
		};
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
			const { records, passages, embeddings } = await getDb();
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
			if (rows.length) {
				const ids = rows.map((row) => row.originalId);
				await records.deleteMany({ _id: { $in: rows.map((row) => row._id) } });
				await records.deleteMany({
					recordKind: "search-job",
					searchSourceId: { $in: ids },
				});
				await deleteSearchPassages(passages, embeddings, ids);
			}
			return { deleted: rows.length, more: rows.length === limit };
		}),
	prunePageObservations: (
		maxBytes: number = 25 * 1024 * 1024,
		maxDeletes: number = 500,
	) =>
		serializeMutation(async () => {
			const { records, passages, embeddings } = await getDb();
			const pages = (await records.find({ recordKind: "page" })).sort(
				(a, b) => a.timestamp - b.timestamp,
			);
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
			if (remove.length) {
				const ids = pages
					.filter((row) => remove.includes(row._id))
					.map((row) => row.originalId);
				await records.deleteMany({ _id: { $in: remove } });
				await records.deleteMany({
					recordKind: "search-job",
					searchSourceId: { $in: ids },
				});
				await deleteSearchPassages(passages, embeddings, ids);
			}
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
