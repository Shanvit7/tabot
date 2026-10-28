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
const records = {
	createIndex: async () => {
		if (failure === "index") throw new Error("index-check-failure");
	},
	count: async () => 7,
	find: async (query: { _id?: { $in?: string[] }; recordKind?: string } = {}) =>
		[...storedRecords.values()].filter(
			(row) =>
				(!query.recordKind || row.recordKind === query.recordKind) &&
				(!query._id?.$in || query._id.$in.includes(row._id as string)),
		),
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
	deleteMany: async ({ _id }: { _id: { $in: string[] } }) => {
		for (const id of _id.$in) storedRecords.delete(id);
	},
};
const meta = {
	findOne: async ({ _id }: { _id: string }) => {
		assert.equal(_id, expectedMarkerId);
		return marker;
	},
	insert: async (row: Record<string, unknown>) => {
		assert.equal(row._id, expectedMarkerId);
		assert.ok(isDocId(row._id), "migration marker must use valid TalaDB ULID");
		if (failure === "migration") throw new Error("migration-check-failure");
		marker = row;
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
				collection: (name: string) => (name === "meta" ? meta : records),
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
const originalIndexedDB = globalThis.indexedDB;
const originalIDBKeyRange = globalThis.IDBKeyRange;
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
		storedRecords.size,
		133,
		"replayed commit must not duplicate record",
	);
	const searchEvent = {
		...event,
		id: `${event.source.instanceId}:103`,
		timestamp: Date.now(),
		url: "https://docs.example.com/guide",
		source: { ...event.source, sequence: 103 },
	};
	const searchPage = {
		id: "61b8dc2a-7709-4b78-b3a3-9b6900c6b1a5",
		kind: "page-observation",
		timestamp: Date.now(),
		tabId: 1,
		windowId: 1,
		pageKey: "c".repeat(64),
		captureIdentity: "d".repeat(64),
		url: "https://docs.example.com/guide",
		trigger: "interaction",
		segments: ["OAuth callback nonce exchange"],
		privacy: { policyVersion: 1, redacted: true, findings: [] },
		coverage: { truncated: false, partial: false },
	};
	await request("commitIngest", [[searchEvent, searchPage]]);
	const searchResult = await request("searchHistory", ["callback nonce"]);
	assert.equal(searchResult.value[0]?.pageCount, 1);
	assert.equal(
		searchResult.value[0]?.sources.some(
			(source) => source.id === searchPage.id,
		),
		true,
	);
	await request("deletePageObservations", [
		{ origin: "https://docs.example.com" },
	]);
	assert.deepEqual(
		(await request("searchHistory", ["callback nonce"])).value,
		[],
		"query-time search must not retain deleted evidence",
	);
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
	globalThis.indexedDB = originalIndexedDB;
	globalThis.IDBKeyRange = originalIDBKeyRange;
	console.error = originalError;
	mock.restoreAll();
}
