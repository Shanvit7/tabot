import {
	eventBytes,
	eventIdentity,
	type IngestAck,
	MAX_EVENT_BYTES,
	MAX_PAGE_OBSERVATION_BYTES,
	normalizePageObservation,
	PAGE_EVENT_TYPES,
	PAGE_OBSERVATION_PROTOCOL_VERSION,
	PAGE_PROTOCOL_VERSION,
	type StoredIngestRecord,
	type StoredPageObservation,
	type StoredTabEvent,
	sanitizeEventForIngestion,
	sanitizePageObservationForIngestion,
	UUID_PATTERN,
} from "@tabot/shared";
import type { createEventPipeline } from "./event-pipeline";
import {
	isPageCaptureExcludedUrl,
	normalizePageCaptureOrigins,
	pageCaptureSite,
} from "./page-capture-consent";

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

export const ingestPageMessage = async (
	input: unknown,
	sender: Sender,
	deps: {
		extensionId: string;
		pipeline: ReturnType<typeof createEventPipeline<StoredIngestRecord>>;
		find: (id: string) => Promise<StoredTabEvent | undefined>;
		eligible: (tabId: number) => Promise<boolean>;
		captureIdentity: (value: unknown) => Promise<string>;
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
	let captureIdentity: string;
	try {
		captureIdentity = await deps.captureIdentity([
			message.id,
			message.type,
			message.timestamp,
			tabId,
			windowId,
			message.documentUrl,
			message.metadata ?? null,
		]);
	} catch {
		return reject("privacy-processing-failed");
	}
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
			captureIdentity,
		},
	};
	const sanitizedRow = await sanitizeEventForIngestion(row).catch(() => null);
	if (!sanitizedRow) return reject("privacy-processing-failed");
	return deps.pipeline.ingest(sanitizedRow, async () => {
		// Committed or pending replay wins over CURRENT tracking/focus policy.
		const previous = await deps.find(row.id);
		if (previous)
			return eventIdentity(previous) === eventIdentity(sanitizedRow)
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

export type PageObservationMessage = {
	kind: "TABOT_PAGE_OBSERVATION";
	version: number;
	id: string;
	timestamp: number;
	documentUrl: string;
	trigger: "viewport-dwell" | "interaction";
	segments: string[];
	truncated: boolean;
	partial: boolean;
};

export const ingestPageObservationMessage = async (
	input: unknown,
	sender: Sender,
	deps: {
		extensionId: string;
		pipeline: ReturnType<typeof createEventPipeline<StoredIngestRecord>>;
		find: (id: string) => Promise<StoredPageObservation | undefined>;
		eligible: (tabId: number) => Promise<boolean>;
		consentedOrigins: () => Promise<unknown>;
		captureIdentity: (value: unknown) => Promise<string>;
		now?: number;
	},
): Promise<IngestAck> => {
	const reject = (code: string): Promise<IngestAck> =>
		Promise.resolve({ status: "rejected", code });
	if (!input || typeof input !== "object") return reject("invalid-message");
	const message = input as PageObservationMessage;
	if (message.version !== PAGE_OBSERVATION_PROTOCOL_VERSION)
		return reject("reload-required");
	try {
		if (eventBytes(message) > MAX_PAGE_OBSERVATION_BYTES)
			return reject("message-too-large");
	} catch {
		return reject("invalid-message");
	}
	const tabId = sender.tab?.id;
	const windowId = sender.tab?.windowId;
	const currentUrl = sender.tab?.url ?? sender.url;
	if (
		sender.id !== deps.extensionId ||
		sender.frameId !== 0 ||
		sender.tab?.incognito ||
		tabId === undefined ||
		windowId === undefined ||
		!sender.documentId ||
		!sender.url ||
		!/^https?:\/\//.test(sender.url) ||
		!currentUrl ||
		message.documentUrl !== currentUrl
	)
		return reject("invalid-sender");
	const keys = Object.keys(message).sort();
	if (
		message.kind !== "TABOT_PAGE_OBSERVATION" ||
		keys.join(",") !==
			"documentUrl,id,kind,partial,segments,timestamp,trigger,truncated,version" ||
		typeof message.id !== "string" ||
		!UUID_PATTERN.test(message.id) ||
		!Number.isSafeInteger(message.timestamp) ||
		message.timestamp < 0 ||
		typeof message.documentUrl !== "string" ||
		message.documentUrl.length > 8192 ||
		!/^https?:\/\//.test(message.documentUrl) ||
		!["viewport-dwell", "interaction"].includes(message.trigger) ||
		!Array.isArray(message.segments) ||
		message.segments.length < 1 ||
		message.segments.length > 4 ||
		message.segments.some(
			(segment) =>
				typeof segment !== "string" ||
				segment.length < 1 ||
				segment.length > 1000,
		) ||
		typeof message.truncated !== "boolean" ||
		typeof message.partial !== "boolean"
	)
		return reject("invalid-observation");
	const now = deps.now ?? Date.now();
	if (message.timestamp < now - 300_000 || message.timestamp > now + 5000)
		return reject("capture-time-out-of-range");
	const site = pageCaptureSite(message.documentUrl, sender.tab?.incognito);
	if (!site) return reject("invalid-site");
	let captureIdentity: string;
	let pageKey: string;
	try {
		[captureIdentity, pageKey] = await Promise.all([
			deps.captureIdentity([
				"page-observation:v1",
				message.id,
				message.timestamp,
				tabId,
				windowId,
				sender.documentId,
				message.documentUrl,
				message.trigger,
				message.segments,
				message.truncated,
				message.partial,
			]),
			deps.captureIdentity(["page-resource:v1", message.documentUrl]),
		]);
	} catch {
		return reject("privacy-processing-failed");
	}
	const sanitized = await sanitizePageObservationForIngestion({
		id: message.id,
		kind: "page-observation",
		timestamp: message.timestamp,
		tabId,
		windowId,
		documentId: sender.documentId,
		pageKey,
		captureIdentity,
		url: message.documentUrl,
		trigger: message.trigger,
		segments: message.segments,
		coverage: { truncated: message.truncated, partial: message.partial },
	}).catch(() => null);
	if (!sanitized) return reject("privacy-processing-failed");
	const row = normalizePageObservation(sanitized);
	return deps.pipeline.ingest(row, async () => {
		const previous = await deps.find(row.id);
		if (previous)
			return previous.captureIdentity === row.captureIdentity
				? { status: "persisted", id: row.id }
				: { status: "rejected", code: "id-conflict" };
		if (
			message.documentUrl !== currentUrl ||
			isPageCaptureExcludedUrl(message.documentUrl) ||
			now - row.timestamp > 10_000 ||
			!(await deps.eligible(tabId)) ||
			!normalizePageCaptureOrigins(await deps.consentedOrigins()).includes(
				site.origin,
			)
		)
			return { status: "ignored", code: "capture-policy" };
		return null;
	});
};
