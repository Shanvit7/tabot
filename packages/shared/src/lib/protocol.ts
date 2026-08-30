export const MSG = {
	BUFFER_READY: "BUFFER_READY",
	STATS_UPDATE: "STATS_UPDATE",
	STOP: "STOP",
	GET_EVENTS: "GET_EVENTS",
} as const;

export interface StatsSnapshot {
	totalEvents: number;
	tabCreated: number;
	tabActivated: number;
	tabUpdated: number;
	tabRemoved: number;
	navigation: number;
	pageVisible: number;
	pageHidden: number;
	scroll: number;
	click: number;
	keyActivity: number;
	eventsProcessed: number;
	droppedEvents: number;
	bufferCapacity: number;
	bufferOccupancy: number;
	peakBufferOccupancy: number;
	lastProcessedAt: number;
}

export interface PipelineStats extends StatsSnapshot {}

export interface BufferReadyMessage {
	type: typeof MSG.BUFFER_READY;
	buffer: SharedArrayBuffer;
	capacity: number;
}

export interface StatsUpdateMessage {
	type: typeof MSG.STATS_UPDATE;
	stats: StatsSnapshot;
}

export interface GetEventsMessage {
	type: typeof MSG.GET_EVENTS;
	limit?: number; // max events to return (default: all)
	since?: number; // epoch ms — return events with timestamp >= since
}

export const createEmptyStats = (capacity = 0): StatsSnapshot => ({
	totalEvents: 0,
	tabCreated: 0,
	tabActivated: 0,
	tabUpdated: 0,
	tabRemoved: 0,
	navigation: 0,
	pageVisible: 0,
	pageHidden: 0,
	scroll: 0,
	click: 0,
	keyActivity: 0,
	eventsProcessed: 0,
	droppedEvents: 0,
	bufferCapacity: capacity,
	bufferOccupancy: 0,
	peakBufferOccupancy: 0,
	lastProcessedAt: 0,
});
