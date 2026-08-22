export {
	advanceReadIndex,
	attachBuffer,
	availableCount,
	BUFFER_BYTE_SIZE,
	bufferOccupancy,
	CAPACITY,
	CONTROL_SLOTS,
	claimSlots,
	createBuffer,
	DEFAULT_CAPACITY,
	decodeEvent,
	EVENT_SLOT_SIZE,
	type EventBuffer,
	encodeEvent,
	PUBLISHED_INDEX,
	pushEvent,
	READ_INDEX,
	reserveSlot,
	WRITE_INDEX,
} from "./buffer";
export {
	bulkInsertEvents,
	countEvents,
	createEventsDb,
	getAllEvents,
	type StoredTabEvent,
	storedTabEventSchema,
} from "./db";
export {
	EVENT_TYPES,
	EventTypeToValue,
	type TabEvent,
	type TabEventType,
	ValueToEventType,
} from "./events";
export { logger } from "./logger";

export {
	getMeta,
	removeMeta,
	type TabMeta,
	tabMeta,
	updateMeta,
} from "./metadata";

export {
	type BufferReadyMessage,
	createEmptyStats,
	MSG,
	type PipelineStats,
	type StatsSnapshot,
	type StatsUpdateMessage,
} from "./protocol";
