import {
	eventBytes,
	eventIdentity,
	type IngestAck,
	MAX_EVENT_BYTES,
	PAGE_EVENT_TYPES,
	PAGE_PROTOCOL_VERSION,
	type StoredTabEvent,
	UUID_PATTERN,
} from "@tabot/shared";
import type { createEventPipeline } from "./event-pipeline";

type Sender = {
	id?: string;
	frameId?: number;
	documentId?: string;
	url?: string;
	tab?: {
		id?: number;
		windowId?: number;
		incognito?: boolean;
		favIconUrl?: string;
		url?: string;
	};
};
type PageMessage = {
	kind: string;
	version: number;
	id: string;
	instanceId: string;
	sequence: number;
	type: StoredTabEvent["type"];
	timestamp: number;
	documentUrl: string;
	metadata?: StoredTabEvent["metadata"];
};

export const ingestPageMessage = (
	input: unknown,
	sender: Sender,
	deps: {
		extensionId: string;
		pipeline: ReturnType<typeof createEventPipeline>;
		find: (id: string) => Promise<StoredTabEvent | undefined>;
		eligible: (tabId: number) => Promise<boolean>;
		now?: number;
	},
): Promise<IngestAck> => {
	const reject = (code: string): Promise<IngestAck> =>
		Promise.resolve({ status: "rejected", code });
	if (!input || typeof input !== "object") return reject("invalid-message");
	const message = input as PageMessage;
	if (message.version !== PAGE_PROTOCOL_VERSION)
		return reject("reload-required");
	try {
		if (eventBytes(message) > MAX_EVENT_BYTES)
			return reject("message-too-large");
	} catch {
		return reject("invalid-message");
	}
	const tabId = sender.tab?.id;
	const windowId = sender.tab?.windowId;
	// Chrome sender.url can remain the load URL after pushState. Top-frame tab URL is current evidence.
	const documentUrl = sender.tab?.url ?? sender.url;
	if (
		sender.id !== deps.extensionId ||
		sender.frameId !== 0 ||
		sender.tab?.incognito ||
		tabId === undefined ||
		windowId === undefined ||
		!sender.url ||
		!/^https?:\/\//.test(sender.url) ||
		!documentUrl ||
		!/^https?:\/\//.test(documentUrl)
	)
		return reject("invalid-sender");
	if (
		!PAGE_EVENT_TYPES.includes(message.type as never) ||
		typeof message.instanceId !== "string" ||
		!UUID_PATTERN.test(message.instanceId) ||
		!Number.isSafeInteger(message.sequence) ||
		message.sequence < 1 ||
		message.id !== `${message.instanceId}:${message.sequence}` ||
		!Number.isFinite(message.timestamp) ||
		message.timestamp < 0 ||
		typeof message.documentUrl !== "string" ||
		message.documentUrl.length > 8192 ||
		!/^https?:\/\//.test(message.documentUrl)
	)
		return reject("invalid-event");
	const now = deps.now ?? Date.now();
	// Replay age bound: five minutes, future clock skew bound: five seconds.
	if (message.timestamp < now - 300_000 || message.timestamp > now + 5000)
		return reject("capture-time-out-of-range");
	const keys = Object.keys(message.metadata ?? {});
	const expected =
		message.type === "SCROLL"
			? ["scrollY"]
			: message.type === "CLICK"
				? ["x", "y"]
				: [];
	if (
		keys.length !== expected.length ||
		keys.some((key) => !expected.includes(key))
	)
		return reject("invalid-metadata");
	const row: StoredTabEvent = {
		id: message.id,
		type: message.type,
		timestamp: message.timestamp,
		tabId,
		windowId,
		url: documentUrl,
		favicon: sender.tab?.favIconUrl,
		metadata: message.metadata,
		source: {
			instanceId: message.instanceId,
			sequence: message.sequence,
			documentId: sender.documentId,
			documentUrl: message.documentUrl,
		},
	};
	return deps.pipeline.ingest(row, async () => {
		// Committed or pending replay wins over CURRENT tracking/focus policy.
		const previous = await deps.find(row.id);
		if (previous)
			return eventIdentity(previous) === eventIdentity(row)
				? { status: "persisted", id: row.id }
				: { status: "rejected", code: "id-conflict" };
		// No historical foreground proof for a previously unseen, delayed message.
		if (
			message.documentUrl !== documentUrl ||
			now - row.timestamp > 10_000 ||
			!(await deps.eligible(tabId))
		)
			return { status: "ignored", code: "capture-policy" };
		return null;
	});
};
