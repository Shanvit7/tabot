import {
	advanceReadIndex,
	bulkInsertEvents,
	CAPACITY,
	CONTROL_SLOTS,
	countEvents,
	decodeEvent,
	derive,
	EVENT_SLOT_SIZE,
	PUBLISHED_INDEX,
	READ_INDEX,
	type StoredTabEvent,
	type TabEvent,
	TabotDatabase,
} from "@tabot/shared";

type Mode = "sab" | "message";
type Sidecar = Pick<StoredTabEvent, "id" | "url" | "favicon">;
type Setup = {
	type: "ready";
	mode: Mode;
	count: number;
	dbName: string;
	sidecars: Sidecar[];
};
type Start = { type: "start"; sab: SharedArrayBuffer };
type Batch = { type: "batch"; offset: number; events: TabEvent[] };
type Finish = {
	type: "finish";
	producerMs: number;
	producerJsMs: number;
	count: number;
};
type Incoming = Setup | Start | Batch | Finish;
type Result = {
	producerMs: number;
	jsActiveMs: number;
	computeMs: number;
	checksum: number;
};

let mode: Mode;
let count = 0;
let producerMs = 0;
let producerJsMs = 0;
let consumerJsMs = 0;
let db: TabotDatabase;
let sidecars: Sidecar[] = [];
let writeChain = Promise.resolve();
let receivedCount = 0;
let messageStarted: number | null = null;
let sabBuffer: SharedArrayBuffer | null = null;
let sabStarted: number | null = null;
let finished = false;
let finalized = false;

const checksumDerived = (events: StoredTabEvent[]) => {
	const derived = derive(events);
	const summary = JSON.stringify({
		events: events.map((event) => [
			event.id,
			event.type,
			event.tabId,
			event.windowId,
			event.timestamp,
			event.url,
			event.favicon,
			Object.entries(event.metadata ?? {}).sort(([a], [b]) =>
				a.localeCompare(b),
			),
		]),
		sessions: derived.sessions.map(({ id }) => id),
		contexts: derived.contexts.map(({ id }) => id),
		memories: derived.memories.map(({ id }) => id),
		live: derived.live?.currentContext?.id ?? null,
	});
	let checksum = 2166136261;
	for (let i = 0; i < summary.length; i++) {
		checksum = Math.imul(checksum ^ summary.charCodeAt(i), 16777619);
	}
	return checksum >>> 0;
};

const persistBatch = (events: TabEvent[], offset: number) => {
	const started = performance.now();
	const rows = events.map((event, index) => ({
		...sidecars[offset + index],
		...event,
	})) as StoredTabEvent[];
	writeChain = writeChain.then(() => {
		const activeStarted = performance.now();
		try {
			return bulkInsertEvents(db, rows);
		} finally {
			consumerJsMs += performance.now() - activeStarted;
		}
	});
	receivedCount += events.length;
	consumerJsMs += performance.now() - started;
};

const cleanup = async () => {
	db?.close();
	await db?.delete().catch(() => {});
};

const fail = async (error: unknown) => {
	if (finalized) return;
	finalized = true;
	await cleanup();
	self.postMessage({
		error: error instanceof Error ? error.message : String(error),
	});
	self.postMessage({ type: "done" });
};

const complete = async (started: number) => {
	if (finalized) return;
	finalized = true;
	try {
		await writeChain;
		if (receivedCount !== count)
			throw new Error(
				`Expected ${count} consumed events, received ${receivedCount}`,
			);
		const persistedCount = await countEvents(db);
		if (persistedCount !== count)
			throw new Error(
				`Expected ${count} persisted events, found ${persistedCount}`,
			);
		const persisted = await db.events.orderBy("timestamp").toArray();
		const checksumStarted = performance.now();
		const checksum = checksumDerived(persisted);
		consumerJsMs += performance.now() - checksumStarted;
		const result: Result = {
			producerMs,
			jsActiveMs: producerJsMs + consumerJsMs,
			computeMs: performance.now() - started,
			checksum,
		};
		self.postMessage({ result });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : String(error),
		});
	} finally {
		await cleanup();
		self.postMessage({ type: "done" });
	}
};

const pollSharedBuffer = () => {
	if (!sabBuffer || finalized) return;
	const control = new Int32Array(sabBuffer, 0, CONTROL_SLOTS);
	const read = Atomics.load(control, READ_INDEX);
	const published = Atomics.load(control, PUBLISHED_INDEX);
	const available = published - read;
	if (available > 0) {
		sabStarted ??= performance.now();
		const amount = Math.min(available, 512);
		const capacity = Atomics.load(control, CAPACITY);
		const values = new Int32Array(
			sabBuffer,
			CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT,
			capacity * EVENT_SLOT_SIZE,
		);
		const decodeStarted = performance.now();
		const events = Array.from({ length: amount }, (_, index) =>
			decodeEvent(values, (read + index) % capacity),
		);
		consumerJsMs += performance.now() - decodeStarted;
		persistBatch(events, read);
		advanceReadIndex(control, amount);
	}
	if (finished && receivedCount === count) {
		void complete(sabStarted ?? performance.now()).catch(fail);
		return;
	}
	setTimeout(pollSharedBuffer, 0);
};

self.onmessage = ({ data }: MessageEvent<Incoming>) => {
	if (data.type === "ready") {
		void (async () => {
			mode = data.mode;
			count = data.count;
			sidecars = data.sidecars;
			db = new TabotDatabase(data.dbName);
			await db.open();
			self.postMessage({ type: "ready" });
		})().catch(fail);
		return;
	}

	if (data.type === "start" && mode === "sab") {
		sabBuffer = data.sab;
		self.postMessage({ type: "consuming" });
		pollSharedBuffer();
		return;
	}

	if (data.type === "batch" && mode === "message") {
		messageStarted ??= performance.now();
		persistBatch(data.events, data.offset);
		return;
	}

	if (data.type === "finish") {
		producerMs = data.producerMs;
		producerJsMs = data.producerJsMs;
		finished = true;
		if (data.count !== count) {
			void fail(
				new Error(`Expected ${count} replay events, got ${data.count}`),
			);
			return;
		}
		if (mode === "message")
			void complete(messageStarted ?? performance.now()).catch(fail);
	}
};
