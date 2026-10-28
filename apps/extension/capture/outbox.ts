import {
	eventBytes,
	type IngestAck,
	PAGE_OBSERVATION_PROTOCOL_VERSION,
	PAGE_PROTOCOL_VERSION,
	type PageEventType,
} from "@tabot/shared";
import { AsyncRetryer } from "@tanstack/pacer";

import type { PageObservationMessage } from "../ingestion/page-ingress";

export interface PageEventMessage {
	kind: "TABOT_PAGE_EVENT";
	version: number;
	id: string;
	instanceId: string;
	sequence: number;
	type: PageEventType;
	timestamp: number;
	documentUrl: string;
	metadata?: Record<string, number>;
}

/** Document memory only. Closing/reloading the document can lose unacknowledged events. */
export const createPageOutbox = (options: {
	send: (
		message: PageEventMessage | PageObservationMessage,
	) => Promise<unknown>;
	documentUrl: () => string;
	onFailure: (code: string) => void;
	retryWait?: number;
}) => {
	// randomUUID is secure-context-only; content scripts also run on ordinary HTTP pages.
	const random = crypto.getRandomValues(new Uint8Array(16));
	random[6] = (random[6] & 0x0f) | 0x40;
	random[8] = (random[8] & 0x3f) | 0x80;
	const hex = Array.from(random, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	const instanceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	let sequence = 0;
	let bytes = 0;
	let active = 0;
	let disabled = false;
	const pending: {
		message: PageEventMessage | PageObservationMessage;
		bytes: number;
	}[] = [];
	const outstanding = new Map<string, number>();
	const pump = () => {
		while (active < 4 && pending.length) {
			const entry = pending.shift();
			if (!entry) break;
			active++;
			void (async () => {
				try {
					const retryer = new AsyncRetryer(
						async (): Promise<IngestAck> => {
							let timer: ReturnType<typeof setTimeout> | undefined;
							try {
								const response = (await Promise.race([
									options.send(entry.message),
									new Promise<never>((_resolve, reject) => {
										timer = setTimeout(
											() => reject(new Error("ack-timeout")),
											2000,
										);
									}),
								])) as IngestAck | undefined;
								if (!response || response.status === "retryable")
									throw new Error("transport-retry");
								if (
									!["persisted", "ignored", "rejected"].includes(
										response.status,
									) ||
									(response.status === "persisted" &&
										response.id !== entry.message.id)
								)
									throw new Error("invalid-ack");
								return response;
							} finally {
								clearTimeout(timer);
							}
						},
						{
							maxAttempts: 3,
							baseWait: options.retryWait ?? 100,
							maxWait: 1000,
							jitter: 0.2,
							throwOnError: "last",
						},
					);
					const result = await retryer.execute();
					if (result?.status === "rejected") {
						if (result.code === "reload-required") disabled = true;
						options.onFailure(result.code);
					} else if (!result) options.onFailure("delivery-unconfirmed");
				} catch {
					options.onFailure("delivery-unconfirmed");
				} finally {
					active--;
					outstanding.delete(entry.message.id);
					bytes -= entry.bytes;
					pump();
				}
			})();
		}
	};
	return {
		add: (
			type: PageEventType,
			metadata?: Record<string, number>,
			timestamp = Date.now(),
		): boolean => {
			if (disabled) return false;
			const message: PageEventMessage = {
				kind: "TABOT_PAGE_EVENT",
				version: PAGE_PROTOCOL_VERSION,
				id: `${instanceId}:${++sequence}`,
				instanceId,
				sequence,
				type,
				timestamp,
				documentUrl: options.documentUrl(),
				...(metadata ? { metadata: { ...metadata } } : {}),
			};
			return enqueue(message);
		},
		addObservation: (
			observation: Omit<PageObservationMessage, "kind" | "version" | "id">,
		): boolean => {
			if (disabled) return false;
			const random = crypto.getRandomValues(new Uint8Array(16));
			random[6] = (random[6] & 0x0f) | 0x40;
			random[8] = (random[8] & 0x3f) | 0x80;
			const hex = Array.from(random, (byte) =>
				byte.toString(16).padStart(2, "0"),
			).join("");
			const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
			return enqueue({
				...observation,
				kind: "TABOT_PAGE_OBSERVATION",
				version: PAGE_OBSERVATION_PROTOCOL_VERSION,
				id,
			});
		},
		clearObservations: () => {
			for (let i = pending.length - 1; i >= 0; i--) {
				const entry = pending[i];
				if (entry.message.kind !== "TABOT_PAGE_OBSERVATION") continue;
				pending.splice(i, 1);
				outstanding.delete(entry.message.id);
				bytes -= entry.bytes;
			}
		},
		stats: () => ({ rows: outstanding.size, bytes, active }),
	};
	function enqueue(
		message: PageEventMessage | PageObservationMessage,
	): boolean {
		const size = eventBytes(message);
		if (outstanding.size >= 256 || bytes + size > 512 * 1024) {
			options.onFailure("outbox-capacity");
			return false;
		}
		outstanding.set(message.id, size);
		bytes += size;
		pending.push({ message, bytes: size });
		pump();
		return true;
	}
};
