// Node-only regression: real owner RPC, mocked engine/legacy I/O. Not a durability test.
import assert from "node:assert/strict";
import { mock } from "node:test";
import {
	deriveDocId,
	isDocId,
} from "../node_modules/taladb/dist/index.browser.mjs";

type Reply = { ok: boolean; code?: string; value?: unknown };
type Message = {
	kind: string;
	requestId: number;
	method: string;
	args: unknown[];
};
let listener: (
	message: Message,
	sender: { id: string; url: string },
	respond: (reply: Reply) => void,
) => boolean | undefined;
let failure:
	| "open"
	| "storage"
	| "not-durable"
	| "not-owner"
	| "index"
	| "migration"
	| "import-after-chunk"
	| "delete-blocked"
	| "write-before"
	| "write-after"
	| "write-quota"
	| undefined;
let activeHandles = 0;
let opens = 0;
let closes = 0;
let requestSequence = 0;
let legacyExists = true;
let legacyRows: Record<string, unknown>[] = [];
let legacyPageRows: Record<string, unknown>[] = [];
let legacyHasPages = false;
let legacyImportWrites = 0;
let marker: Record<string, unknown> | undefined;
const expectedMarkerId = deriveDocId(
	"tabot:meta:v1",
	"legacy-indexeddb-to-taladb:v1",
);
const storedRecords = new Map<string, Record<string, unknown>>();
const storedPassages = new Map<string, Record<string, unknown>>();
const storedEmbeddings = new Map<string, Record<string, unknown>>();
type RecordFilter = {
	_id?: { $in?: string[] } | string;
	$and?: RecordFilter[];
	$or?: RecordFilter[];
	recordKind?: string | { $in?: string[] };
	originalId?: { $in?: string[]; $nin?: string[] };
	"payload.type"?: string | { $in?: string[] };
	pageKey?: string;
	url?: string;
	host?: string;
	title?: string | null;
	searchSourceId?: { $in?: string[] };
	timestamp?: { $gte?: number; $lte?: number };
	origin?: string | { $in?: string[] };
	modelVersion?: string;
	embeddingCacheId?: string;
	lastEventId?: { $ne?: string };
	sourceId?: { $in?: string[] } | string;
};
const recordFindQueries: RecordFilter[] = [];
const matches = (row: Record<string, unknown>, query: RecordFilter): boolean =>
	(!query.$and || query.$and.every((item) => matches(row, item))) &&
	(!query.$or || query.$or.some((item) => matches(row, item))) &&
	(!query.recordKind ||
		(typeof query.recordKind === "string"
			? row.recordKind === query.recordKind
			: !query.recordKind.$in ||
				query.recordKind.$in.includes(row.recordKind as string))) &&
	!query.originalId?.$nin?.includes(row.originalId as string) &&
	(!query.originalId?.$in ||
		query.originalId.$in.includes(row.originalId as string)) &&
	(!query["payload.type"] ||
		(typeof query["payload.type"] === "string"
			? (row.payload as Record<string, unknown>)?.type === query["payload.type"]
			: !query["payload.type"].$in ||
				query["payload.type"].$in.includes(
					(row.payload as Record<string, unknown>)?.type as string,
				))) &&
	(!query.pageKey || row.pageKey === query.pageKey) &&
	(query.url === undefined || row.url === query.url) &&
	(query.host === undefined || row.host === query.host) &&
	(query.title === undefined || row.title === query.title) &&
	(!query._id ||
		(typeof query._id === "string"
			? row._id === query._id
			: !query._id.$in || query._id.$in.includes(row._id as string))) &&
	(!query.searchSourceId?.$in ||
		query.searchSourceId.$in.includes(row.searchSourceId as string)) &&
	(!query.sourceId ||
		(typeof query.sourceId === "string"
			? row.sourceId === query.sourceId
			: !query.sourceId.$in ||
				query.sourceId.$in.includes(row.sourceId as string))) &&
	(query.timestamp?.$gte === undefined ||
		(row.timestamp as number) >= query.timestamp.$gte) &&
	(query.timestamp?.$lte === undefined ||
		(row.timestamp as number) <= query.timestamp.$lte) &&
	(!query.origin ||
		(typeof query.origin === "string"
			? row.origin === query.origin
			: !query.origin.$in ||
				query.origin.$in.includes(row.origin as string))) &&
	(!query.modelVersion || row.modelVersion === query.modelVersion) &&
	(!query.embeddingCacheId ||
		row.embeddingCacheId === query.embeddingCacheId) &&
	(!query.lastEventId?.$ne || row.lastEventId !== query.lastEventId.$ne);
const records = {
	createIndex: async () => {
		if (failure === "index") throw new Error("index-check-failure");
	},
	createFtsIndex: async () => {},
	count: async () => 7,
	find: async (query: RecordFilter = {}) => {
		recordFindQueries.push(query);
		return [...storedRecords.values()].filter((row) => matches(row, query));
	},
	findOne: async (query: RecordFilter) =>
		[...storedRecords.values()].find((row) => matches(row, query)) ?? null,
	aggregate: async (pipeline: Record<string, unknown>[] = []) => {
		let rows = [...storedRecords.values()];
		for (const stage of pipeline) {
			if ("$match" in stage)
				rows = rows.filter((row) => matches(row, stage.$match as RecordFilter));
			if ("$sort" in stage) {
				const sort = stage.$sort as Record<string, 1 | -1>;
				rows.sort((left, right) => {
					for (const [key, direction] of Object.entries(sort)) {
						const a = left[key];
						const b = right[key];
						if (a === b) continue;
						if (a === undefined || a === null) return 1;
						if (b === undefined || b === null) return -1;
						const comparison =
							typeof a === "number" && typeof b === "number"
								? a - b
								: String(a).localeCompare(String(b));
						if (comparison) return comparison * direction;
					}
					return 0;
				});
			}
			if ("$skip" in stage) rows = rows.slice(stage.$skip as number);
			if ("$limit" in stage) rows = rows.slice(0, stage.$limit as number);
		}
		return rows;
	},
	searchText: async (
		_field: string,
		query: string,
		topK: number,
		filter: RecordFilter = {},
	) =>
		[...storedRecords.values()]
			.filter(
				(row) =>
					typeof row.searchText === "string" &&
					matches(row, filter) &&
					(row.searchText as string)
						.toLowerCase()
						.includes(query.toLowerCase()),
			)
			.slice(0, topK)
			.map((document) => ({ document, score: 1 })),
	insert: async (row: Record<string, unknown>) => {
		storedRecords.set(row._id as string, row);
		return row._id;
	},
	insertMany: async (rows: Record<string, unknown>[]) => {
		if (failure === "write-quota") {
			failure = undefined;
			throw new Error(
				"storage error: opfs truncate: QuotaExceededError: No space available",
			);
		}
		if (failure === "write-before") {
			failure = undefined;
			throw new Error("write-before-check");
		}
		for (const row of rows) storedRecords.set(row._id as string, row);
		if (failure === "import-after-chunk" && ++legacyImportWrites === 1) {
			failure = undefined;
			throw new Error("legacy-chunk-interrupted");
		}
		if (failure === "write-after") {
			failure = undefined;
			throw new Error("write-after-check");
		}
	},
	updateOne: async (
		query: RecordFilter,
		update: {
			$set?: Record<string, unknown>;
			$inc?: Record<string, number>;
		},
	) => {
		const row = [...storedRecords.values()].find((item) =>
			matches(item, query),
		);
		if (!row) return false;
		Object.assign(row, update.$set);
		for (const [key, amount] of Object.entries(update.$inc ?? {}))
			row[key] = ((row[key] as number | undefined) ?? 0) + amount;
		return true;
	},
	deleteOne: async ({ _id }: { _id: string }) => storedRecords.delete(_id),
	deleteMany: async (query: RecordFilter) => {
		for (const [id, row] of storedRecords)
			if (matches(row, query)) storedRecords.delete(id);
	},
};
const passages = {
	createFtsIndex: async () => {},
	createVectorIndex: async () => {},
	find: async (query: RecordFilter = {}) =>
		[...storedPassages.values()].filter((row) => matches(row, query)),
	findOne: async (query: RecordFilter) =>
		[...storedPassages.values()].find((row) => matches(row, query)) ?? null,
	count: async (query: RecordFilter = {}) =>
		[...storedPassages.values()].filter((row) => matches(row, query)).length,
	insert: async (row: Record<string, unknown>) => {
		storedPassages.set(row._id as string, row);
		return row._id;
	},
	updateOne: async (
		query: RecordFilter,
		update: { $set?: Record<string, unknown>; $inc?: Record<string, number> },
	) => {
		const row = [...storedPassages.values()].find((item) =>
			matches(item, query),
		);
		if (!row) return false;
		Object.assign(row, update.$set);
		for (const [key, amount] of Object.entries(update.$inc ?? {}))
			row[key] = ((row[key] as number | undefined) ?? 0) + amount;
		return true;
	},
	hybridSearch: async (
		{ text }: { text: string },
		_vector: { vector: number[] },
		topK: number,
		filter: RecordFilter = {},
	) =>
		[...storedPassages.values()]
			.filter((row) => matches(row, filter))
			.slice(0, topK)
			.map((document) => ({
				document,
				score: 1,
				textRank:
					typeof document.text === "string" &&
					document.text.toLowerCase().includes(text.toLowerCase())
						? 0
						: null,
				vectorRank: 0,
			})),
	findNearest: async (
		_field: string,
		_vector: number[],
		topK: number,
		filter: RecordFilter = {},
	) =>
		[...storedPassages.values()]
			.filter((row) => matches(row, filter))
			.slice(0, topK)
			.map((document) => ({ document, score: 0.19 })),
	deleteMany: async (query: RecordFilter) => {
		for (const [id, row] of storedPassages)
			if (matches(row, query)) storedPassages.delete(id);
	},
};
const noteRows = new Map<string, Record<string, unknown>>();
const notes = {
	createIndex: async () => {},
	find: async (query: RecordFilter = {}) =>
		[...noteRows.values()].filter((row) => matches(row, query)),
	findOne: async (query: RecordFilter) =>
		[...noteRows.values()].find((row) => matches(row, query)) ?? null,
	insert: async (row: Record<string, unknown>) => {
		assert.ok(isDocId(row._id), "note documents must use valid TalaDB ULIDs");
		noteRows.set(row._id as string, row);
		return row._id;
	},
	updateOne: async (
		query: RecordFilter,
		update: { $set?: Record<string, unknown> },
	) => {
		const row = [...noteRows.values()].find((item) => matches(item, query));
		if (!row) return false;
		Object.assign(row, update.$set);
		return true;
	},
	deleteOne: async ({ _id }: { _id: string }) => noteRows.delete(_id),
	deleteMany: async (query: RecordFilter) => {
		for (const [id, row] of noteRows)
			if (matches(row, query)) noteRows.delete(id);
	},
};
const metaRows = new Map<string, Record<string, unknown>>();
const meta = {
	find: async ({ kind }: { kind?: string }) =>
		[...metaRows.values()].filter(
			(row) => kind === undefined || row.kind === kind,
		),
	findOne: async ({ _id }: { _id: string }) =>
		_id === expectedMarkerId ? marker : (metaRows.get(_id) ?? null),
	updateOne: async (
		{ _id }: { _id: string },
		update: { $set?: Record<string, unknown> },
	) => {
		const row = metaRows.get(_id);
		if (!row) return false;
		Object.assign(row, update.$set);
		return true;
	},
	insert: async (row: Record<string, unknown>) => {
		assert.ok(isDocId(row._id), "metadata marker must use valid TalaDB ULID");
		if (row._id === expectedMarkerId) {
			if (failure === "migration") throw new Error("migration-check-failure");
			marker = row;
		} else metaRows.set(row._id as string, row);
	},
	deleteOne: async ({ _id }: { _id: string }) => metaRows.delete(_id),
};
const embeddings = {
	find: async (query: RecordFilter = {}) =>
		[...storedEmbeddings.values()].filter((row) => matches(row, query)),
	findOne: async ({ _id }: { _id: string }) =>
		storedEmbeddings.get(_id) ?? null,
	insert: async (row: Record<string, unknown>) => {
		storedEmbeddings.set(row._id as string, row);
		return row._id;
	},
	deleteOne: async ({ _id }: { _id: string }) => storedEmbeddings.delete(_id),
	deleteMany: async (query: RecordFilter) => {
		for (const [id, row] of storedEmbeddings)
			if (matches(row, query)) storedEmbeddings.delete(id);
	},
};
mock.module("../node_modules/taladb/dist/index.browser.mjs", {
	namedExports: {
		deriveDocId,
		openDB: async () => {
			if (failure === "open") throw new Error("open-check-failure");
			assert.equal(
				activeHandles,
				0,
				"failed startup must release previous handle",
			);
			opens++;
			activeHandles++;
			return {
				storageInfo: async () => ({
					storage: failure === "storage" ? "indexeddb" : "opfs",
					durableWrites: failure !== "not-durable",
					owner: failure !== "not-owner",
				}),
				collection: (name: string) =>
					name === "meta"
						? meta
						: name === "notes"
							? notes
							: name === "search_passages"
								? passages
								: name === "search_embeddings"
									? embeddings
									: records,
				close: async () => {
					closes++;
					activeHandles--;
					if (failure === "migration") throw new Error("close-check-failure");
				},
			};
		},
	},
});
const originalChrome = globalThis.chrome;
const originalWorker = globalThis.Worker;
class TestWorker {
	onmessage:
		| ((event: MessageEvent<{ id: number; vector: number[] }>) => void)
		| null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	postMessage({ id }: { id: number }) {
		queueMicrotask(() =>
			this.onmessage?.({
				data: { id, vector: Array(384).fill(0.2) },
			} as MessageEvent<{ id: number; vector: number[] }>),
		);
	}
	terminate() {}
}
globalThis.Worker = TestWorker as unknown as typeof Worker;
const originalIndexedDB = globalThis.indexedDB;
const originalIDBKeyRange = globalThis.IDBKeyRange;
const originalDateNow = Date.now;
const originalError = console.error;
globalThis.chrome = {
	runtime: {
		id: "owner-check",
		getURL: (path: string) => `chrome-extension://owner-check/${path}`,
		onMessage: {
			addListener: (handler: typeof listener) => {
				listener = handler;
			},
		},
	},
} as unknown as typeof chrome;
globalThis.IDBKeyRange = {
	lowerBound: (lower: IDBValidKey) => ({ lower }),
} as unknown as typeof IDBKeyRange;
globalThis.indexedDB = {
	databases: async () => (legacyExists ? [{ name: "tabot_events" }] : []),
	open: () => {
		const request = {
			result: {
				objectStoreNames: {
					contains: (name: string) =>
						name === "events" || (name === "pages" && legacyHasPages),
				},
				transaction: (storeName: string) => ({
					objectStore: () => ({
						getAll: (range?: { lower?: string }, limit = 128) => {
							const batch = {
								result: [] as Record<string, unknown>[],
								onsuccess: () => {},
								onerror: () => {},
							};
							queueMicrotask(() => {
								const rows =
									storeName === "pages" ? legacyPageRows : legacyRows;
								batch.result = rows
									.filter((row) => !range?.lower || row.id > range.lower)
									.slice(0, limit);
								batch.onsuccess();
							});
							return batch;
						},
					}),
				}),
				close: () => {},
			},
			onsuccess: () => {},
		};
		queueMicrotask(() => request.onsuccess());
		return request;
	},
	deleteDatabase: () => {
		assert.equal(
			marker?.state,
			"verified",
			"legacy deletion requires durable marker",
		);
		const request = { onsuccess: () => {}, onblocked: () => {} };
		if (failure === "delete-blocked") {
			failure = undefined;
			queueMicrotask(() => request.onblocked());
		} else {
			legacyExists = false;
			queueMicrotask(() => request.onsuccess());
		}
		return request;
	},
} as unknown as IDBFactory;
console.error = () => {};
const request = (method = "countEvents", args: unknown[] = []) =>
	new Promise<Reply>((resolve) => {
		assert.equal(
			listener(
				{
					kind: "TABOT_STORAGE_REQUEST",
					requestId: ++requestSequence,
					method,
					args,
				},
				{
					id: chrome.runtime.id,
					url: chrome.runtime.getURL("static/background/index.js"),
				},
				resolve,
			),
			true,
		);
	});
const requestCount = () => request();
try {
	await import("./owner");
	for (const [stage, code] of [
		["open", "storage-unavailable"],
		["storage", "storage-unavailable"],
		["not-durable", "storage-unavailable"],
		["index", "storage-unavailable"],
		["import-after-chunk", "storage-unavailable"],
		["migration", "storage-unavailable"],
		["delete-blocked", "storage-unavailable"],
	] as const) {
		failure = stage;
		if (stage === "import-after-chunk") {
			legacyHasPages = true;
			legacyPageRows = [
				{
					id: "8db95835-4c10-4eb7-9258-139a9b55f1e8",
					kind: "page-observation",
					timestamp: Date.now(),
					tabId: 1,
					windowId: 1,
					pageKey: "a".repeat(64),
					captureIdentity: "b".repeat(64),
					url: "https://legacy.example/",
					trigger: "interaction",
					segments: ["Legacy excerpt"],
					privacy: { policyVersion: 1, redacted: false, findings: [] },
					coverage: { truncated: false, partial: false },
				},
			];
			const instanceId = "dff14a82-2bf8-4a1a-b287-6ed22636f63e";
			legacyRows = Array.from({ length: 130 }, (_, index) => {
				const sequence = index + 1;
				return {
					id: `${instanceId}:${String(sequence).padStart(4, "0")}`,
					type: "TAB_UPDATED",
					tabId: 1,
					windowId: 1,
					timestamp: Date.now() + sequence,
					url: "https://legacy.example/",
					source: { instanceId, sequence },
				};
			});
		}
		const reply = await requestCount();
		assert.equal(reply.ok, false);
		assert.equal(
			reply.code,
			code,
			"cleanup errors must not replace startup failure",
		);
		assert.equal(activeHandles, 0);
		assert.equal(closes, opens);
		assert.equal(legacyExists, true);
		if (stage === "delete-blocked") {
			assert.equal(marker?.state, "verified");
			assert.equal(storedRecords.size, 131);
		}
		if (stage === "import-after-chunk") {
			assert.equal(storedRecords.size, 128);
			assert.equal(marker, undefined);
		}
	}
	failure = "not-owner";
	assert.deepEqual(
		await requestCount(),
		{ requestId: 8, ok: true, value: 7 },
		"an OPFS/durable client is not rejected only for being non-owner",
	);
	assert.deepEqual(await requestCount(), { requestId: 9, ok: true, value: 7 });
	assert.equal(marker?._id, expectedMarkerId);
	assert.equal(marker?.state, "verified");
	assert.equal(
		legacyExists,
		false,
		"verified import retires legacy copy automatically",
	);
	assert.equal(
		storedRecords.size,
		131,
		"restart must complete event and page import",
	);
	assert.equal(
		[...storedRecords.values()].filter((row) => row.recordKind === "page")
			.length,
		1,
	);
	assert.equal(opens, 7);
	await requestCount();
	assert.equal(opens, 7, "successful startup must reuse handle");
	const embeddingsBeforeWarmup = storedEmbeddings.size;
	assert.equal((await request("warmSearchModel")).ok, true);
	let searchStatus = await request("getSearchStatus");
	for (let attempt = 0; attempt < 100; attempt++) {
		if (
			(searchStatus.value as { model?: string } | undefined)?.model === "ready"
		)
			break;
		await new Promise((resolve) => setTimeout(resolve, 1));
		searchStatus = await request("getSearchStatus");
	}
	assert.equal(
		(searchStatus.value as { model?: string } | undefined)?.model,
		"ready",
		"warmup loads embedding model",
	);
	assert.equal(storedEmbeddings.size, embeddingsBeforeWarmup);
	const note = {
		id: "note-uuid",
		text: "Applied for this job",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		url: "https://www.linkedin.com/jobs/view",
		origin: "https://www.linkedin.com",
		host: "www.linkedin.com",
		site: "linkedin.com",
		title: "Job",
		favicon: null,
		pageKey: "page-key",
		tabId: 1,
		windowId: 1,
		eventId: null,
	};
	const savedNote = await request("saveNote", [note]);
	assert.equal(savedNote.ok, true);
	assert.deepEqual(savedNote.value, note);
	const noteDocumentId = deriveDocId("tabot:notes:v1", note.id);
	assert.ok(isDocId(noteDocumentId));
	assert.equal(noteRows.get(noteDocumentId)?.id, note.id);
	const listedNotes = await request("listPageNotes", [note.pageKey]);
	assert.equal(listedNotes.ok, true);
	assert.deepEqual(listedNotes.value, [{ ...note, _id: noteDocumentId }]);
	const fallback = { url: note.url, host: note.host, title: note.title };
	const fallbackNotes = await request("listPageNotes", [
		"different-page-key",
		fallback,
	]);
	assert.equal((fallbackNotes.value as unknown[]).length, 1);
	const unrelatedNotes = await request("listPageNotes", [
		"different-page-key",
		{ ...fallback, title: "Different page title" },
	]);
	assert.deepEqual(unrelatedNotes.value, []);
	const secondNote = {
		...note,
		id: "note-uuid-2",
		host: "jobs.linkedin.com",
		url: "https://jobs.linkedin.com/view",
		origin: "https://jobs.linkedin.com",
		site: "jobs.linkedin.com",
		pageKey: "different-page-key",
		createdAt: note.createdAt + 1,
		updatedAt: note.updatedAt + 1,
	};
	assert.equal((await request("saveNote", [secondNote])).ok, true);
	const siteNotes = await request("listNotesForSite", ["linkedin.com"]);
	assert.deepEqual(
		(siteNotes.value as { id: string }[]).map(({ id }) => id),
		[secondNote.id, note.id],
	);
	assert.equal(
		(
			noteRows.get(deriveDocId("tabot:notes:v1", secondNote.id)) as {
				site: string;
			}
		).site,
		"linkedin.com",
	);
	const notesAfterSecondSave = await request("listPageNotes", [
		"different-page-key",
		fallback,
	]);
	assert.deepEqual(
		(notesAfterSecondSave.value as { id: string }[]).map(({ id }) => id),
		[secondNote.id, note.id],
	);
	const librarySites = await request("browseLibrary", [
		{ level: "sites", site: "linkedin.com" },
	]);
	assert.equal(librarySites.ok, true);
	assert.equal(
		(
			librarySites.value as {
				sites: { pageCount: number; noteCount: number }[];
			}
		).sites[0]?.pageCount,
		2,
	);
	assert.equal(
		(
			librarySites.value as {
				sites: { pageCount: number; noteCount: number }[];
			}
		).sites[0]?.noteCount,
		2,
	);
	const libraryNotes = await request("browseLibrary", [
		{ level: "notes", url: note.url },
	]);
	assert.equal(libraryNotes.ok, true);
	assert.equal(
		(libraryNotes.value as { notes: { id: string }[] }).notes[0]?.id,
		note.id,
	);
	const invalidLibrary = await request("browseLibrary", [
		{ level: "pages", site: "javascript:alert(1)" },
	]);
	assert.equal(invalidLibrary.ok, false);
	assert.equal(invalidLibrary.code, "storage-unavailable");
	const editedNote = {
		...note,
		pageKey: "different-page-key",
		text: "Updated note",
		updatedAt: note.updatedAt + 2,
	};
	assert.deepEqual((await request("saveNote", [editedNote])).value, {
		...editedNote,
		_id: noteDocumentId,
	});
	const dashboardUpdated = await request("updateNoteText", [
		note.id,
		"Edited from dashboard",
	]);
	assert.equal(dashboardUpdated.ok, true);
	assert.equal(
		(dashboardUpdated.value as { text: string }).text,
		"Edited from dashboard",
	);
	assert.ok(
		(dashboardUpdated.value as { updatedAt: number }).updatedAt >=
			note.updatedAt,
	);
	assert.equal(noteRows.get(noteDocumentId)?.text, "Edited from dashboard");
	assert.equal(
		(await request("updateNoteText", ["missing-note", "Updated"])).value,
		null,
	);
	assert.equal(
		(await request("linkNoteEvent", [note.id, "event-note"])).value,
		true,
	);
	assert.equal(noteRows.get(noteDocumentId)?.eventId, "event-note");
	assert.deepEqual((await request("deleteNote", [note.id])).value, {
		deleted: true,
	});
	assert.deepEqual((await request("deleteNote", [secondNote.id])).value, {
		deleted: true,
	});
	const searchBackfillId = deriveDocId(
		"tabot:meta:v1",
		"semantic-search-backfill:v3",
	);
	metaRows.set(searchBackfillId, {
		_id: searchBackfillId,
		state: "complete",
		version: 2,
	});
	const event = {
		id: "12345678-1234-1234-1234-123456789012:100",
		type: "CLICK",
		tabId: 1,
		windowId: 1,
		timestamp: Date.now(),
		url: "https://example.com/",
		source: {
			instanceId: "12345678-1234-1234-1234-123456789012",
			sequence: 100,
		},
	};
	failure = "write-before";
	assert.equal(
		(await request("commitIngest", [[event]])).code,
		"storage-unavailable",
	);
	assert.deepEqual((await request("commitIngest", [[event]])).value, {
		inserted: 1,
		duplicates: 0,
		insertedPages: 0,
		duplicatePages: 0,
		ignoredPages: {},
	});
	const uncertain = {
		...event,
		id: `${event.source.instanceId}:101`,
		source: { ...event.source, sequence: 101 },
	};
	failure = "write-after";
	assert.equal(
		(await request("commitIngest", [[uncertain]])).code,
		"storage-unavailable",
	);
	assert.deepEqual((await request("commitIngest", [[uncertain]])).value, {
		inserted: 0,
		duplicates: 1,
		insertedPages: 0,
		duplicatePages: 0,
		ignoredPages: {},
	});
	assert.equal(
		[...storedRecords.values()].filter(
			(row) => row.recordKind === "event" || row.recordKind === "page",
		).length,
		133,
		"replayed commit must not duplicate source record",
	);
	const searchTimestamp = Date.now();
	const searchEvent = {
		...event,
		id: `${event.source.instanceId}:103`,
		timestamp: searchTimestamp,
		url: "https://docs.example.com/guide",
		source: { ...event.source, sequence: 103 },
	};
	const searchPage = {
		id: "61b8dc2a-7709-4b78-b3a3-9b6900c6b1a5",
		kind: "page-observation",
		timestamp: searchTimestamp,
		tabId: 1,
		windowId: 1,
		pageKey: "c".repeat(64),
		captureIdentity: "d".repeat(64),
		url: "https://docs.example.com/guide",
		title: "OAuth callback guide",
		trigger: "interaction",
		segments: ["OAuth callback nonce exchange"],
		privacy: { policyVersion: 1, redacted: true, findings: [] },
		coverage: { truncated: false, partial: false },
	};
	await request("commitIngest", [[searchEvent, searchPage]]);
	for (let attempt = 0; attempt < 100; attempt++) {
		if (
			![...storedRecords.values()].some(
				(row) => row.recordKind === "search-job",
			)
		)
			break;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	assert.equal(
		[...storedRecords.values()].filter((row) => row.recordKind === "search-job")
			.length,
		0,
		"search jobs finish after durable capture",
	);
	assert.ok(
		[...storedPassages.values()].some((row) => row.sourceKind === "event") &&
			[...storedPassages.values()].some((row) => row.sourceKind === "page"),
		"both URL-only events and page passages get vectors",
	);
	const searchResult = await request("searchHistory", [
		"callback nonce",
		{
			from: searchTimestamp - 1,
			to: searchTimestamp + 1,
			origin: "https://docs.example.com",
		},
	]);
	assert.equal(searchResult.value[0]?.pageCount, 1);
	assert.equal(
		searchResult.value[0]?.sources.some(
			(source) => source.id === searchPage.id,
		),
		true,
	);
	const activityDate = new Date();
	activityDate.setDate(activityDate.getDate() - 2);
	activityDate.setHours(12, 0, 0, 0);
	const activityEvent = {
		...event,
		id: `${event.source.instanceId}:105`,
		timestamp: activityDate.getTime(),
		url: "https://docs.example.com/retained-page",
		source: { ...event.source, sequence: 105 },
	};
	const activityId = deriveDocId(
		"tabot:records:v1",
		`event:${activityEvent.id}`,
	);
	storedRecords.set(activityId, {
		_id: activityId,
		recordKind: "event",
		originalId: activityEvent.id,
		timestamp: activityEvent.timestamp,
		origin: "https://docs.example.com",
		payload: activityEvent,
	});
	const timestamps = [...storedRecords.values()]
		.filter((record) => record.recordKind === "event")
		.map((record) => record.timestamp as number);
	assert.equal(
		(await request("getLastEventTimestamp")).value,
		Math.max(...timestamps),
	);
	const activityRecall = await request("searchHistory", [
		"What did I do 2 days ago?",
	]);
	assert.equal(activityRecall.value[0]?.url, activityEvent.url);
	const relatedEvidence = await request("readRelatedActivity", [
		[searchTimestamp],
		[],
		[],
		[searchPage.id],
		1_000,
		8,
		0,
		searchTimestamp,
	]);
	assert.equal(relatedEvidence.ok, true);
	assert.ok(
		(relatedEvidence.value as { id: string }[]).some(
			(row) => row.id === searchEvent.id,
		),
	);
	const identityRelated = await request("readRelatedActivity", [
		[0],
		[searchPage.pageKey],
		["https://docs.example.com"],
		["seed-page"],
		1,
		8,
		0,
		Date.now(),
	]);
	assert.equal(identityRelated.ok, true);
	assert.ok(
		(identityRelated.value as { id: string }[]).some(
			(row) => row.id === searchEvent.id,
		),
		"TalaDB page-key query links evidence outside time window",
	);
	assert.equal(
		(
			await request("readRelatedActivity", [
				[searchTimestamp],
				[],
				[],
				[searchPage.id],
				31 * 24 * 60 * 60 * 1_000,
				8,
				0,
				Date.now(),
			])
		).ok,
		false,
		"candidate windows must stay bounded",
	);
	await request("deletePageObservations", [
		{ origin: "https://docs.example.com" },
	]);
	assert.deepEqual(
		(await request("searchHistory", ["callback nonce"])).value,
		[],
		"query-time search must not retain deleted evidence",
	);
	const searchNow = Date.now();
	Date.now = () => searchNow;
	const recentGoogleSearch = {
		...event,
		id: `${event.source.instanceId}:104`,
		timestamp:
			Math.floor((searchNow - 5 * 60_000) / 60_000) * 60_000 + 30_000,
		url: "https://www.google.com/search?q=database&client=chrome",
		source: { ...event.source, sequence: 104 },
	};
	await request("commitIngest", [[recentGoogleSearch]]);
	for (let attempt = 0; attempt < 100; attempt++) {
		if (
			![...storedRecords.values()].some(
				(row) => row.recordKind === "search-job",
			)
		)
			break;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	const exactGoogleSearch = await request("searchHistory", ["database"]);
	assert.deepEqual(exactGoogleSearch.value[0]?.searchQueries, ["database"]);
	const timeGoogleSearch = await request("searchHistory", [
		"what did i search 5 mins ago",
	]);
	assert.ok(
		(timeGoogleSearch.value as { searchQueries?: string[] }[]).some((result) =>
			result.searchQueries?.includes("database"),
		),
		"relative-time search includes the matching query",
	);
	failure = undefined;
	const purgeResult = await request("purgeData");
	assert.equal(purgeResult.ok, true, JSON.stringify(purgeResult));
	assert.equal(
		storedRecords.size,
		0,
		"purge removes events, pages, and search jobs",
	);
	assert.equal(storedPassages.size, 0, "purge removes indexed search passages");
	assert.equal(storedEmbeddings.size, 0, "purge removes embedding cache");
	assert.equal(noteRows.size, 0, "purge removes saved notes");
	failure = "write-quota";
	assert.equal(
		(
			await request("commitIngest", [
				[{ ...event, id: `${event.source.instanceId}:102` }],
			])
		).code,
		"QuotaExceededError",
	);
	console.log(
		"storage-owner: startup gates, migration replay, and write recovery passed",
	);
} finally {
	globalThis.chrome = originalChrome;
	globalThis.Worker = originalWorker;
	globalThis.indexedDB = originalIndexedDB;
	globalThis.IDBKeyRange = originalIDBKeyRange;
	Date.now = originalDateNow;
	console.error = originalError;
	mock.restoreAll();
}
