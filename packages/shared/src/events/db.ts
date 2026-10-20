import Dexie, { type Table } from "dexie";
import { logger } from "../lib/logger";
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
	constructor(name = "tabot_events") {
		super(name);
		// only indexed props — id is PK (inbound), rest are queryable via where()
		this.version(1).stores({
			events: "id, timestamp, type, tabId",
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
}

/** Resolves only after commit. Any row failure rolls back the entire batch. */
export const bulkInsertEvents = async (
	db: TabotDatabase,
	docs: StoredTabEvent[],
): Promise<InsertEventsResult> => {
	const unique = new Map<string, StoredTabEvent>();
	for (const input of docs) {
		const row = normalizeEvent(input);
		const previous = unique.get(row.id);
		if (previous && eventIdentity(previous) !== eventIdentity(row))
			throw new EventConflictError("id-conflict");
		if (!previous) unique.set(row.id, row);
	}
	if (!unique.size) return { inserted: 0, duplicates: 0 };
	return db.transaction("rw", db.events, async () => {
		const rows = [...unique.values()];
		const existing = await db.events.bulkGet(rows.map((row) => row.id));
		const missing: StoredTabEvent[] = [];
		rows.forEach((row, i) => {
			if (!existing[i]) missing.push(row);
			else if (
				eventIdentity(existing[i] as StoredTabEvent) !== eventIdentity(row)
			)
				throw new EventConflictError("id-conflict");
		});
		if (missing.length) await db.events.bulkAdd(missing);
		return {
			inserted: missing.length,
			duplicates: docs.length - missing.length,
		};
	});
};

export const countEvents = async (db: TabotDatabase): Promise<number> => {
	try {
		return await db.events.count();
	} catch (err) {
		logger.warn("countEvents failed", { error: err });
		throw err;
	}
};

/** Indexed local range read; end is exclusive, matching activity metrics. */
export const getEventsBetween = async (
	db: TabotDatabase,
	from: number,
	to: number,
): Promise<StoredTabEvent[]> =>
	db.events.where("timestamp").between(from, to, true, false).toArray();

export const getAllEvents = async (
	db: TabotDatabase,
): Promise<StoredTabEvent[]> => {
	return db.events.toArray();
};
