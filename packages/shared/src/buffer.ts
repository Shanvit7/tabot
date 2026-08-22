// packages/shared/src/buffer.ts

import { EventTypeToValue, type TabEvent, ValueToEventType } from "./events";

export const EVENT_SLOT_SIZE = 8;
export const CONTROL_SLOTS = 4;
export const DEFAULT_CAPACITY = 10_000;

export const WRITE_INDEX = 0;
export const READ_INDEX = 1;
export const CAPACITY = 2;
export const PUBLISHED_INDEX = 3;

export const BUFFER_BYTE_SIZE =
	(CONTROL_SLOTS + DEFAULT_CAPACITY * EVENT_SLOT_SIZE) * 4;

// --- Buffer creation ---

export interface EventBuffer {
	sab: SharedArrayBuffer;
	control: Int32Array;
	events: Int32Array;
	capacity: number;
}

export function createBuffer(capacity = DEFAULT_CAPACITY): EventBuffer {
	const sab = new SharedArrayBuffer(
		(CONTROL_SLOTS + capacity * EVENT_SLOT_SIZE) * 4,
	);
	const control = new Int32Array(sab, 0, CONTROL_SLOTS);
	const events = new Int32Array(
		sab,
		CONTROL_SLOTS * 4,
		capacity * EVENT_SLOT_SIZE,
	);
	Atomics.store(control, CAPACITY, capacity);
	return { sab, control, events, capacity };
}

export function attachBuffer(
	sab: SharedArrayBuffer,
	capacity: number,
): EventBuffer {
	const control = new Int32Array(sab, 0, CONTROL_SLOTS);
	const events = new Int32Array(
		sab,
		CONTROL_SLOTS * 4,
		capacity * EVENT_SLOT_SIZE,
	);
	return { sab, control, events, capacity };
}

// --- Producer helpers (spec §9) ---

export function pushEvent(
	control: Int32Array,
	events: Int32Array,
	capacity: number,
	event: TabEvent,
): boolean {
	const read = Atomics.load(control, READ_INDEX);
	const write = Atomics.load(control, WRITE_INDEX);
	if (write - read >= capacity) return false;
	const slot = write % capacity;
	encodeEvent(events, slot, event);
	Atomics.store(control, WRITE_INDEX, write + 1);
	Atomics.store(control, PUBLISHED_INDEX, write + 1);
	Atomics.notify(control, PUBLISHED_INDEX);
	return true;
}

// legacy slot reservation — kept for backwards compat, prefer pushEvent
export function reserveSlot(control: Int32Array, capacity: number): number {
	const read = Atomics.load(control, READ_INDEX);
	const write = Atomics.load(control, WRITE_INDEX);
	if (write - read >= capacity) return -1;
	return write;
}

// --- Encode / decode (spec §12) ---

export function encodeEvent(
	events: Int32Array,
	slot: number,
	event: TabEvent,
): void {
	const base = slot * EVENT_SLOT_SIZE;
	const timestamp = event.timestamp;
	Atomics.store(events, base + 0, EventTypeToValue[event.type]);
	Atomics.store(events, base + 1, event.tabId);
	Atomics.store(events, base + 2, event.windowId);
	Atomics.store(events, base + 3, 0);
	Atomics.store(events, base + 4, Math.floor(timestamp / 2 ** 32));
	Atomics.store(events, base + 5, timestamp | 0);
	Atomics.store(
		events,
		base + 6,
		event.metadata?.scrollY ?? event.metadata?.x ?? 0,
	);
	Atomics.store(events, base + 7, event.metadata?.y ?? 0);
}

export function decodeEvent(events: Int32Array, slot: number): TabEvent {
	const base = slot * EVENT_SLOT_SIZE;
	const typeVal = Atomics.load(events, base + 0);
	const tsHigh = Atomics.load(events, base + 4);
	const tsLow = Atomics.load(events, base + 5);
	const v0 = Atomics.load(events, base + 6);
	const v1 = Atomics.load(events, base + 7);
	const type = ValueToEventType[typeVal];
	const event: TabEvent = {
		type,
		tabId: Atomics.load(events, base + 1),
		windowId: Atomics.load(events, base + 2),
		timestamp: tsHigh * 2 ** 32 + (tsLow >>> 0),
	};
	if (type === "SCROLL" && v0 !== 0) event.metadata = { scrollY: v0 };
	else if (type === "CLICK" && (v0 !== 0 || v1 !== 0))
		event.metadata = { x: v0, y: v1 };
	return event;
}

// --- Consumer helpers (spec §10) ---

export function availableCount(control: Int32Array): number {
	const read = Atomics.load(control, READ_INDEX);
	const published = Atomics.load(control, PUBLISHED_INDEX);
	return published - read;
}

export function claimSlots(
	control: Int32Array,
	maxBatchSize = 512,
): { start: number; count: number } {
	const read = Atomics.load(control, READ_INDEX);
	const published = Atomics.load(control, PUBLISHED_INDEX);
	const available = published - read;
	if (available <= 0) return { start: read, count: 0 };
	return { start: read, count: Math.min(available, maxBatchSize) };
}

export function advanceReadIndex(control: Int32Array, count: number): void {
	if (count <= 0) return;
	const read = Atomics.load(control, READ_INDEX);
	Atomics.store(control, READ_INDEX, read + count);
}

export function bufferOccupancy(control: Int32Array): number {
	return Atomics.load(control, WRITE_INDEX) - Atomics.load(control, READ_INDEX);
}
