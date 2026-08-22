import Dexie, { type Table } from "dexie";
import type { TabEventType } from "./events";
import { logger } from "./logger";

export interface StoredTabEvent {
	id: string;
	type: TabEventType;
	tabId: number;
	windowId: number;
	timestamp: number;
	url?: string;
	metadata?: {
		x?: number;
		y?: number;
		scrollY?: number;
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
		metadata: {
			type: "object",
			properties: {
				x: { type: "number" },
				y: { type: "number" },
				scrollY: { type: "number" },
			},
		},
	},
	required: ["id", "type", "tabId", "windowId", "timestamp"],
	indexes: ["timestamp", "type", "tabId"],
} as const;

export class TabotDatabase extends Dexie {
	events!: Table<StoredTabEvent, string>;
	constructor(name = "tabot_events") {
		super(name);
		// only indexed props — id is PK (inbound), rest are queryable via where()
		this.version(1).stores({
			events: "id, timestamp, type, tabId",
		});
	}
}

export type TabotCollections = {
	events: Table<StoredTabEvent, string>;
};

export type EventsCollection = Table<StoredTabEvent, string>;

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
	dbPromise = db
		.open()
		.then(() => db)
		.catch((err) => {
			logger.warn("createEventsDb failed", { error: err });
			dbPromise = null;
			throw err;
		});
	return dbPromise;
};

export const bulkInsertEvents = async (
	db: TabotDatabase,
	docs: StoredTabEvent[],
): Promise<void> => {
	if (docs.length === 0) return;
	try {
		await db.events.bulkPut(docs);
	} catch (err: unknown) {
		// BulkError: some keys conflicted, successful puts still committed
		const e = err as { name?: string; failures?: unknown[] };
		if (e?.name === "BulkError") {
			logger.warn("bulkPut partial", { failures: e.failures?.length ?? 0 });
			return;
		}
		logger.warn("bulkPut failed", { error: err });
		throw err;
	}
};

export const countEvents = async (db: TabotDatabase): Promise<number> => {
	try {
		return await db.events.count();
	} catch (err) {
		logger.warn("countEvents failed", { error: err });
		throw err;
	}
};

export const getAllEvents = async (
	db: TabotDatabase,
): Promise<StoredTabEvent[]> => {
	return db.events.toArray();
};
