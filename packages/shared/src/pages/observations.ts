import { eventBytes, UUID_PATTERN } from "../events/ingest";
import { sanitizeUrlForIngestion } from "../privacy/ingest";
import { piiRedactor } from "../privacy/pii-redactor";

export const PAGE_OBSERVATION_PROTOCOL_VERSION = 1;
export const MAX_PAGE_OBSERVATION_BYTES = 32 * 1024;
export const MAX_PAGE_SEGMENTS = 4;
export const MAX_PAGE_SEGMENT_CHARS = 1000;
export const PAGE_PRIVACY_POLICY_VERSION = 1;
const SECRET_PATTERNS = [
	/\b(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{6,}={0,2}/gi,
	/\bBearer\s+[A-Za-z0-9._~+/-]{10,}={0,2}/gi,
	/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
	/-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]{0,4000}?-----END [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/g,
];

export type PageObservationTrigger = "viewport-dwell" | "interaction";
export interface StoredPageObservation {
	id: string;
	kind: "page-observation";
	timestamp: number;
	tabId: number;
	windowId: number;
	documentId?: string;
	pageKey: string;
	captureIdentity: string;
	url?: string;
	trigger: PageObservationTrigger;
	segments: string[];
	privacy: {
		policyVersion: number;
		redacted: boolean;
		findings: string[];
	};
	coverage: { truncated: boolean; partial: boolean };
}

export const normalizePageObservation = (
	observation: StoredPageObservation | null | undefined,
): StoredPageObservation => {
	if (
		observation === null ||
		observation === undefined ||
		observation.kind !== "page-observation" ||
		typeof observation.id !== "string" ||
		!UUID_PATTERN.test(observation.id) ||
		!Number.isSafeInteger(observation.timestamp) ||
		observation.timestamp < 0 ||
		!Number.isSafeInteger(observation.tabId) ||
		!Number.isSafeInteger(observation.windowId) ||
		(observation.documentId !== undefined &&
			(typeof observation.documentId !== "string" ||
				observation.documentId.length > 128)) ||
		!/^[0-9a-f]{64}$/.test(observation.pageKey) ||
		!/^[0-9a-f]{64}$/.test(observation.captureIdentity) ||
		!["viewport-dwell", "interaction"].includes(observation.trigger) ||
		!Array.isArray(observation.segments) ||
		observation.segments.length < 1 ||
		observation.segments.length > MAX_PAGE_SEGMENTS ||
		observation.segments.some(
			(segment) =>
				typeof segment !== "string" ||
				segment.length < 1 ||
				segment.length > MAX_PAGE_SEGMENT_CHARS,
		) ||
		!observation.privacy ||
		observation.privacy.policyVersion !== PAGE_PRIVACY_POLICY_VERSION ||
		typeof observation.privacy.redacted !== "boolean" ||
		!Array.isArray(observation.privacy.findings) ||
		observation.privacy.findings.length > 32 ||
		observation.privacy.findings.some(
			(type) => typeof type !== "string" || type.length > 64,
		) ||
		!observation.coverage ||
		typeof observation.coverage.truncated !== "boolean" ||
		typeof observation.coverage.partial !== "boolean"
	)
		throw new Error("invalid-page-observation");
	if (observation.url !== undefined && typeof observation.url !== "string")
		throw new Error("invalid-page-observation");
	const normalized: StoredPageObservation = {
		id: observation.id,
		kind: "page-observation",
		timestamp: observation.timestamp,
		tabId: observation.tabId,
		windowId: observation.windowId,
		...(observation.documentId ? { documentId: observation.documentId } : {}),
		pageKey: observation.pageKey,
		captureIdentity: observation.captureIdentity,
		...(observation.url ? { url: observation.url } : {}),
		trigger: observation.trigger,
		segments: [...observation.segments],
		privacy: {
			policyVersion: observation.privacy.policyVersion,
			redacted: observation.privacy.redacted,
			findings: [...new Set(observation.privacy.findings)],
		},
		coverage: { ...observation.coverage },
	};
	if (eventBytes(normalized) > MAX_PAGE_OBSERVATION_BYTES)
		throw new Error("page-observation-too-large");
	return normalized;
};

/** Drop raw segments on any URL/redactor error; only sanitized records reach storage. */
export const sanitizePageObservationForIngestion = async (
	input: Omit<StoredPageObservation, "url" | "segments" | "privacy"> & {
		url: string;
		segments: string[];
		privacy?: StoredPageObservation["privacy"];
	},
): Promise<StoredPageObservation> => {
	const url = await sanitizeUrlForIngestion(input.url);
	if (!url) throw new Error("page-url-rejected");
	const segments = await Promise.all(
		input.segments.map(async (segment) => {
			if (segment.length > MAX_PAGE_SEGMENT_CHARS)
				throw new Error("page-segment-too-large");
			let text = segment;
			const findings: string[] = [];
			for (const pattern of SECRET_PATTERNS) {
				pattern.lastIndex = 0;
				if (pattern.test(text)) {
					findings.push("SECRET");
					pattern.lastIndex = 0;
					text = text.replace(pattern, "[SECRET]");
				}
			}
			const result = await piiRedactor.redact(text);
			return {
				text: result.redacted.trim(),
				findings: [
					...findings,
					...result.findings.map((finding) => finding.type),
				],
			};
		}),
	);
	const sanitized = normalizePageObservation({
		...input,
		url,
		segments: segments.map(({ text }) => text).filter(Boolean),
		privacy: {
			policyVersion: PAGE_PRIVACY_POLICY_VERSION,
			redacted:
				input.privacy?.redacted === true ||
				segments.some(({ findings }) => findings.length > 0),
			findings: [
				...new Set([
					...(input.privacy?.findings ?? []),
					...segments.flatMap(({ findings }) => findings),
				]),
			],
		},
	});
	return sanitized;
};
