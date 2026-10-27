// Node-only regression: real owner RPC, mocked engine/legacy I/O. Not a durability test.
import assert from "node:assert/strict";
import { mock } from "node:test";
import {
	deriveDocId,
	isDocId,
} from "./node_modules/taladb/dist/index.browser.mjs";

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
	| "write-before"
	| "write-after"
	| undefined;
let activeHandles = 0;
let opens = 0;
let closes = 0;
let requestSequence = 0;
let legacyExists = true;
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
		if (failure === "write-before") {
			failure = undefined;
			throw new Error("write-before-check");
		}
		for (const row of rows) storedRecords.set(row._id as string, row);
		if (failure === "write-after") {
			failure = undefined;
			throw new Error("write-after-check");
		}
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
mock.module("./node_modules/taladb/dist/index.browser.mjs", {
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
globalThis.indexedDB = {
	databases: async () => (legacyExists ? [{ name: "tabot_events" }] : []),
	open: () => {
		const request = {
			result: { objectStoreNames: { contains: () => false }, close: () => {} },
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
		legacyExists = false;
		const request = { onsuccess: () => {} };
		queueMicrotask(() => request.onsuccess());
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
	await import("./tabs/storage-owner");
	for (const [stage, code] of [
		["open", "open-check-failure"],
		["storage", "authoritative-opfs-unavailable"],
		["not-durable", "authoritative-opfs-unavailable"],
		["not-owner", "authoritative-opfs-unavailable"],
		["index", "index-check-failure"],
		["migration", "migration-check-failure"],
	] as const) {
		failure = stage;
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
	}
	failure = undefined;
	assert.deepEqual(await requestCount(), { requestId: 7, ok: true, value: 7 });
	assert.equal(marker?._id, expectedMarkerId);
	assert.equal(legacyExists, false);
	assert.equal(opens, 6);
	await requestCount();
	assert.equal(opens, 6, "successful startup must reuse handle");
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
		"write-before-check",
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
		"write-after-check",
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
		2,
		"replayed commit must not duplicate record",
	);
	console.log(
		"storage-owner: startup gates, cleanup, and before/after-write replay passed",
	);
} finally {
	globalThis.chrome = originalChrome;
	globalThis.indexedDB = originalIndexedDB;
	console.error = originalError;
	mock.restoreAll();
}
