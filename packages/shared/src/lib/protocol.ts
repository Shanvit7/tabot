export interface StatsSnapshot {
	/** Runtime counters reset on service-worker activation, not lifetime loss totals. */
	observed: number;
	selected: number;
	queued: number;
	persisted: number;
	duplicates: number;
	ignored: number;
	coalesced: number;
	rejected: number;
	writeFailures: number;
	retryCount: number;
	health: "healthy" | "retrying" | "blocked" | "unavailable";
	collectorRows: number;
	pendingRows: number;
	activeRows: number;
	heldRows: number;
	outstandingRows: number;
	pendingBytes: number;
	oldestPendingAgeMs: number;
	lastCommitAt: number;
	lastErrorCode: string | null;
	samples: {
		rows: number;
		collectionMs: number;
		queueMs: number;
		commitMs: number;
		ackMs: number;
	}[];
	/** Compatibility aliases: queue admission capacity/occupancy/peak, NOT SAB slots. */
	bufferCapacity: number;
	bufferOccupancy: number;
	peakBufferOccupancy: number;
	/** Compatibility aliases: committed inserts / admission rejections this activation. */
	totalEvents: number;
	eventsProcessed: number;
	droppedEvents: number;
	lastProcessedAt: number;
}

export type PipelineStats = StatsSnapshot;
export const createEmptyStats = (capacity = 0): StatsSnapshot => ({
	observed: 0,
	selected: 0,
	queued: 0,
	persisted: 0,
	duplicates: 0,
	ignored: 0,
	coalesced: 0,
	rejected: 0,
	writeFailures: 0,
	retryCount: 0,
	health: "healthy",
	collectorRows: 0,
	pendingRows: 0,
	activeRows: 0,
	heldRows: 0,
	outstandingRows: 0,
	pendingBytes: 0,
	oldestPendingAgeMs: 0,
	lastCommitAt: 0,
	lastErrorCode: null,
	samples: [],
	totalEvents: 0,
	eventsProcessed: 0,
	droppedEvents: 0,
	bufferCapacity: capacity,
	bufferOccupancy: 0,
	peakBufferOccupancy: 0,
	lastProcessedAt: 0,
});

export type ReadFailure = { ok: false; code: "storage-unavailable" };
export const readFailure = (): ReadFailure => ({
	ok: false,
	code: "storage-unavailable",
});
