import type { StoredTabEvent } from "./db";
import { EVENT_TYPES, LIFECYCLE_KINDS } from "./events";

export const PAGE_PROTOCOL_VERSION = 1;
export const MAX_EVENT_BYTES = 32 * 1024;
export const PAGE_EVENT_TYPES = [
	"PAGE_VISIBLE",
	"PAGE_HIDDEN",
	"SCROLL",
	"CLICK",
	"KEY_ACTIVITY",
] as const;
export type PageEventType = (typeof PAGE_EVENT_TYPES)[number];
export type IngestAck =
	| { status: "persisted"; id: string }
	| { status: "ignored"; code: string }
	| { status: "retryable"; code: string }
	| { status: "rejected"; code: string };

export class EventValidationError extends Error {
	name = "EventValidationError";
}
export class EventConflictError extends Error {
	name = "EventConflictError";
}

// UTF-16 allocation plus object overhead; deliberately more conservative than wire UTF-8.
export const eventBytes = (value: unknown): number =>
	JSON.stringify(value).length * 2 + 256;
const finite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number =>
	finite(value) && Number.isSafeInteger(value);
export const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared write boundary. Historical rows/types remain valid; no metadata truncation. */
export const normalizeEvent = (event: StoredTabEvent): StoredTabEvent => {
	if (
		!event ||
		typeof event.id !== "string" ||
		!event.id.length ||
		event.id.length > 128 ||
		!Object.hasOwn(EVENT_TYPES, event.type) ||
		!integer(event.tabId) ||
		!integer(event.windowId) ||
		!finite(event.timestamp) ||
		event.timestamp < 0
	)
		throw new EventValidationError("invalid-event");
	for (const value of [event.url, event.favicon]) {
		if (
			value !== undefined &&
			(typeof value !== "string" || value.length > 8192)
		)
			throw new EventValidationError("invalid-metadata");
	}
	const metadata = event.metadata;
	if (metadata !== undefined) {
		if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
			throw new EventValidationError("invalid-metadata");
		for (const [key, value] of Object.entries(metadata)) {
			if (
				["x", "y", "scrollY", "previousWindowId", "state"].includes(key)
					? !finite(value)
					: key === "enabled"
						? typeof value !== "boolean"
						: key === "source"
							? !["popup", "dashboard"].includes(value as string)
							: key === "lifecycle"
								? !LIFECYCLE_KINDS.includes(value as never)
								: true
			)
				throw new EventValidationError("invalid-metadata");
		}
	}
	if (event.source) {
		const { instanceId, sequence, documentId, documentUrl } = event.source;
		if (
			!UUID_PATTERN.test(instanceId) ||
			!integer(sequence) ||
			sequence < 1 ||
			(documentId !== undefined &&
				(typeof documentId !== "string" || documentId.length > 128)) ||
			(documentUrl !== undefined &&
				(typeof documentUrl !== "string" || documentUrl.length > 8192))
		)
			throw new EventValidationError("invalid-source");
	}
	const normalized: StoredTabEvent = {
		id: event.id,
		type: event.type,
		tabId: event.tabId,
		windowId: event.windowId,
		timestamp: event.timestamp,
		...(event.url !== undefined ? { url: event.url } : {}),
		...(event.favicon !== undefined ? { favicon: event.favicon } : {}),
		...(metadata ? { metadata: { ...metadata } } : {}),
		...(event.source ? { source: { ...event.source } } : {}),
	};
	if (eventBytes(normalized) > MAX_EVENT_BYTES)
		throw new EventValidationError("event-too-large");
	return normalized;
};

/** Enrichment is not identity: a retry must never rewrite URL/favicon. */
export const eventIdentity = (event: StoredTabEvent): string =>
	JSON.stringify([
		event.id,
		event.type,
		event.tabId,
		event.windowId,
		event.timestamp,
		Object.entries(event.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)),
		event.source?.instanceId,
		event.source?.sequence,
		event.source?.documentId,
		event.source?.documentUrl,
	]);

export const storageErrorCode = (error: unknown): string => {
	const bulk = error as { name?: string; failures?: unknown[] };
	if (bulk?.name === "BulkError" && bulk.failures?.length) {
		const codes = bulk.failures.map(storageErrorCode);
		return (
			codes.find(
				(code) =>
					![
						"AbortError",
						"UnknownError",
						"DatabaseClosedError",
						"OpenFailedError",
						"InvalidStateError",
					].includes(code),
			) ?? codes[0]
		);
	}
	const name = bulk?.name;
	return [
		"AbortError",
		"UnknownError",
		"DatabaseClosedError",
		"OpenFailedError",
		"InvalidStateError",
		"QuotaExceededError",
		"SecurityError",
		"EventConflictError",
		"EventValidationError",
		"DataCloneError",
		"BulkError",
	].includes(name ?? "")
		? (name as string)
		: "storage-unavailable";
};
export const isTransientStorageError = (error: unknown): boolean =>
	[
		"AbortError",
		"UnknownError",
		"DatabaseClosedError",
		"OpenFailedError",
		"InvalidStateError",
	].includes(storageErrorCode(error));

/** Timestamp order; same-time events from one source use sequence, never random UUID order.
 * Independent sources retain their slots; no global causal order is inferred.
 */
export const orderEvents = (events: StoredTabEvent[]): StoredTabEvent[] => {
	const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
	for (let start = 0; start < ordered.length; ) {
		let end = start + 1;
		while (
			end < ordered.length &&
			ordered[end].timestamp === ordered[start].timestamp
		)
			end++;
		const groups = new Map<string, number[]>();
		for (let i = start; i < end; i++) {
			const instance = ordered[i].source?.instanceId;
			if (!instance) continue;
			const slots = groups.get(instance) ?? [];
			slots.push(i);
			groups.set(instance, slots);
		}
		for (const slots of groups.values()) {
			const rows = slots
				.map((i) => ordered[i])
				.sort((a, b) => (a.source?.sequence ?? 0) - (b.source?.sequence ?? 0));
			slots.forEach((slot, i) => {
				ordered[slot] = rows[i];
			});
		}
		start = end;
	}
	return ordered;
};
