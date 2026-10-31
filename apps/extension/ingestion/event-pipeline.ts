import {
	createEmptyStats,
	eventBytes,
	eventIdentity,
	type IngestAck,
	type InsertEventsResult,
	isTransientStorageError,
	normalizeEvent,
	normalizePageObservation,
	type StatsSnapshot,
	type StoredIngestRecord,
	type StoredPageObservation,
	type StoredTabEvent,
	storageErrorCode,
} from "@tabot/shared";
import { AsyncQueuer, Batcher } from "@tanstack/pacer";

export const INGEST_LIMITS = {
	rows: 2048,
	bytes: 4 * 1024 * 1024,
	reserveRows: 128,
	reserveBytes: 256 * 1024,
	batchSize: 128,
	windowMs: 25,
	waiters: 4,
};
const BOUNDARIES = new Set([
	"PAGE_VISIBLE",
	"PAGE_HIDDEN",
	"NAVIGATION",
	"TAB_CREATED",
	"TAB_ACTIVATED",
	"TAB_UPDATED",
	"TAB_REMOVED",
	"SW_WINDOW_FOCUS",
]);
type IngestRecord = StoredIngestRecord;
const isPageObservation = (row: IngestRecord): row is StoredPageObservation =>
	"kind" in row && row.kind === "page-observation";
const normalizeRecord = (row: IngestRecord): IngestRecord =>
	isPageObservation(row) ? normalizePageObservation(row) : normalizeEvent(row);
const recordIdentity = (row: IngestRecord): string =>
	isPageObservation(row) ? row.captureIdentity : eventIdentity(row);

type Entry<T extends IngestRecord> = {
	row: T;
	bytes: number;
	admittedAt: number;
	collectedAt: number;
	enqueuedAt: number;
	waiters: number;
	promise: Promise<IngestAck>;
	respond: (ack: IngestAck) => void;
};
type CommitResult =
	| { committed: true; counts: InsertEventsResult }
	| { committed: false; code: string };
type Options<T extends IngestRecord> = {
	commit: (rows: T[]) => Promise<InsertEventsResult>;
	onBlocked?: (recoverable: boolean) => void;
	onHealthy?: () => void;
	// Test knobs; production uses defaults above.
	limits?: Partial<typeof INGEST_LIMITS>;
	now?: () => number;
	retryWait?: number;
};

/** In-memory admission is NOT durability. Only commit() may resolve persisted ACKs. */
export const createEventPipeline = <T extends IngestRecord = StoredTabEvent>(
	options: Options<T>,
) => {
	const limits = { ...INGEST_LIMITS, ...options.limits };
	const now = options.now ?? (() => performance.now());
	const outstanding = new Map<string, Entry<T>>();
	const counters = createEmptyStats(limits.rows);
	let bytes = 0;
	let deadline: number | null = null;
	let held: Entry<T>[] | null = null;
	let recoverable = false;
	let retryAfter = 0;
	let health: StatsSnapshot["health"] = "healthy";
	const samples: StatsSnapshot["samples"] = [];
	const release = (entry: Entry<T>, ack: IngestAck) => {
		entry.respond(ack);
		outstanding.delete(entry.row.id);
		bytes -= entry.bytes;
	};
	const block = (batch: Entry<T>[], code: string, canRecover: boolean) => {
		writer.stop(); // Never abort active database work or clear pending batches.
		held = batch;
		health = "blocked";
		recoverable = canRecover;
		retryAfter = now() + 30_000;
		counters.lastErrorCode = code;
		for (const entry of outstanding.values())
			entry.respond({ status: "retryable", code });
		options.onBlocked?.(canRecover);
	};
	const writer = new AsyncQueuer<Entry<T>[]>(
		async (batch: Entry<T>[]): Promise<CommitResult> => {
			const started = now();
			try {
				const counts = await options.commit(batch.map(({ row }) => row));
				samples.push({
					rows: batch.length,
					queueMs: started - batch[0].enqueuedAt,
					collectionMs: batch[0].enqueuedAt - batch[0].collectedAt,
					commitMs: now() - started,
					ackMs: Math.max(0, Date.now() - batch[0].row.timestamp),
				});
				if (samples.length > 128) samples.shift();
				return { committed: true, counts };
			} catch (error) {
				counters.writeFailures++;
				counters.lastErrorCode = storageErrorCode(error);
				if (isTransientStorageError(error)) {
					// Pacer treats AbortError as cancellation; ingestion aborts are retryable DB failures.
					throw new Error(counters.lastErrorCode);
				}
				return { committed: false, code: counters.lastErrorCode };
			}
		},
		{
			concurrency: 1,
			wait: 0,
			maxSize: limits.rows,
			asyncRetryerOptions: {
				maxAttempts: 3,
				baseWait: options.retryWait ?? 100,
				maxWait: 1000,
				jitter: 0.2,
				throwOnError: "last",
				onRetry: () => {
					health = "retrying";
					counters.retryCount++;
				},
			},
			onError: (_error, batch) =>
				block(batch, counters.lastErrorCode ?? "storage-unavailable", true),
			onSuccess: (result: CommitResult | undefined, batch) => {
				if (!result?.committed) {
					block(
						batch,
						result && "code" in result ? result.code : "storage-unavailable",
						false,
					);
					return;
				}
				counters.persisted += result.counts.inserted;
				counters.duplicates += result.counts.duplicates;
				counters.totalEvents = counters.persisted;
				counters.eventsProcessed = counters.persisted;
				counters.lastProcessedAt = counters.lastCommitAt = Date.now();
				counters.lastErrorCode = null;
				health = "healthy";
				for (const entry of batch) {
					const code = isPageObservation(entry.row)
						? result.counts.ignoredPages?.[entry.row.id]
						: undefined;
					if (code) {
						counters.ignored++;
						release(entry, { status: "ignored", code });
					} else {
						release(entry, { status: "persisted", id: entry.row.id });
					}
				}
				options.onHealthy?.();
			},
		},
	);
	const collector = new Batcher<Entry<T>>(
		(batch) => {
			// 0.22.0 clears items, not its old size/boundary timer. Cancel it explicitly.
			collector.cancel();
			deadline = null;
			for (const entry of batch) entry.enqueuedAt = now();
			if (!writer.addItem(batch)) block(batch, "writer-capacity", false);
		},
		{
			maxSize: limits.batchSize,
			wait: () => Math.max(0, (deadline ?? now()) - now()),
			getShouldExecute: () => deadline !== null && now() >= deadline,
		},
	);

	const retry = (explicit = false): boolean => {
		if (
			!held ||
			writer.store.state.activeItems.length ||
			(!explicit && (!recoverable || now() < retryAfter))
		)
			return false;
		const batch = held;
		held = null;
		health = "retrying";
		if (!writer.addItem(batch, "front")) {
			block(batch, "writer-capacity", false);
			return false;
		}
		writer.start();
		return true;
	};
	const ingest = (
		input: T,
		prepare?: () => Promise<IngestAck | null>,
	): Promise<IngestAck> => {
		counters.observed++;
		let row: T;
		try {
			row = normalizeRecord(input) as T;
		} catch {
			counters.rejected++;
			return Promise.resolve({ status: "rejected", code: "invalid-event" });
		}
		const previous = outstanding.get(row.id);
		if (previous) {
			if (recordIdentity(previous.row) !== recordIdentity(row)) {
				counters.rejected++;
				return Promise.resolve({ status: "rejected", code: "id-conflict" });
			}
			if (previous.waiters >= limits.waiters) {
				counters.rejected++;
				return Promise.resolve({
					status: "retryable",
					code: "waiter-capacity",
				});
			}
			previous.waiters++;
			counters.coalesced++;
			retry();
			return previous.promise;
		}
		if (health === "blocked") {
			retry();
			counters.rejected++;
			return Promise.resolve({ status: "retryable", code: "writer-blocked" });
		}
		const size = eventBytes(row);
		const reserved = !isPageObservation(row) && BOUNDARIES.has(row.type);
		if (
			outstanding.size >= limits.rows - (reserved ? 0 : limits.reserveRows) ||
			bytes + size > limits.bytes - (reserved ? 0 : limits.reserveBytes)
		) {
			counters.rejected++;
			return Promise.resolve({ status: "retryable", code: "busy" });
		}
		let respond!: Entry<T>["respond"];
		const promise = new Promise<IngestAck>((resolve) => {
			respond = resolve;
		});
		const entry: Entry<T> = {
			row,
			bytes: size,
			admittedAt: now(),
			collectedAt: 0,
			enqueuedAt: 0,
			waiters: 1,
			promise,
			respond,
		};
		outstanding.set(row.id, entry);
		bytes += size;
		counters.peakBufferOccupancy = Math.max(
			counters.peakBufferOccupancy,
			outstanding.size,
		);
		void (async () => {
			try {
				const disposition = await prepare?.();
				if (disposition) {
					if (disposition.status === "persisted") counters.duplicates++;
					else if (disposition.status === "ignored") counters.ignored++;
					else counters.rejected++;
					release(entry, disposition);
					return;
				}
				counters.selected++;
				counters.queued++;
				entry.collectedAt = now();
				if (deadline === null) deadline = now() + limits.windowMs;
				collector.addItem(entry);
				if (!isPageObservation(row) && BOUNDARIES.has(row.type))
					collector.flush();
			} catch (error) {
				counters.lastErrorCode = storageErrorCode(error);
				if (health === "healthy") health = "unavailable";
				counters.rejected++;
				release(entry, {
					status: isTransientStorageError(error) ? "retryable" : "rejected",
					code: counters.lastErrorCode,
				});
			}
		})();
		return promise;
	};
	return {
		ingest,
		retry,
		flush: () => collector.flush(), // Never flush the writer: Pacer flush bypasses concurrency.
		stats: (): StatsSnapshot => ({
			...counters,
			health,
			pendingBytes: bytes,
			outstandingRows: outstanding.size,
			collectorRows: collector.store.state.size,
			pendingRows: writer.store.state.items.reduce(
				(sum, batch) => sum + batch.length,
				0,
			),
			activeRows: writer.store.state.activeItems.reduce(
				(sum, batch) => sum + batch.length,
				0,
			),
			heldRows: held?.length ?? 0,
			oldestPendingAgeMs: outstanding.size
				? Math.max(
						0,
						now() -
							Math.min(
								...[...outstanding.values()].map((entry) => entry.admittedAt),
							),
					)
				: 0,
			bufferOccupancy: outstanding.size,
			droppedEvents: counters.rejected,
			samples: [...samples],
		}),
	};
};
