export const ERROR_CODES = {
	OFFLINE: "extension_offline",
	BUSY: "extension_busy",
	TIMEOUT: "extension_timeout",
	DISCONNECTED: "extension_disconnected",
	MALFORMED: "malformed_message",
	INTERNAL: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Relay → extension request. */
export interface ServerRequest {
	type: "request";
	requestId: string;
	method: string;
	params: unknown;
}

/** Extension → relay response. Exactly one of result/error. */
export interface ClientResponse {
	type: "response";
	requestId: string;
	result?: unknown;
	error?: { code: string; message: string };
}

/** Thrown inside the relay so routes can map failures to clean errors. */
export class RelayError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string) {
		super(message);
		this.name = "RelayError";
		this.code = code;
	}
}

/** Validate an inbound extension frame. Returns null on anything malformed (fail closed). */
export const parseClientMessage = (raw: string): ClientResponse | null => {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return null;
	const msg = value as Record<string, unknown>;
	if (msg.type !== "response") return null;
	if (
		typeof msg.requestId !== "string" ||
		msg.requestId.length === 0 ||
		msg.requestId.length > 128
	)
		return null;
	if (Object.hasOwn(msg, "result") === Object.hasOwn(msg, "error")) return null;
	if (Object.hasOwn(msg, "error")) {
		const err = msg.error as Record<string, unknown> | null;
		if (
			typeof err !== "object" ||
			err === null ||
			typeof err.code !== "string" ||
			typeof err.message !== "string"
		)
			return null;
	}
	return msg as unknown as ClientResponse;
};
