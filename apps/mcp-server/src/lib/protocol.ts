export const ERROR_CODES = {
	OFFLINE: "extension_offline",
	TIMEOUT: "extension_timeout",
	DISCONNECTED: "extension_disconnected",
	MALFORMED: "malformed_message",
	INTERNAL: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Relay → extension request (plan §6). */
export interface ServerRequest {
	type: "request";
	requestId: string;
	method: string;
	params: unknown;
}

/** Extension → relay response (plan §6). Exactly one of result/error. */
export interface ClientResponse {
	type: "response";
	requestId: string;
	result?: unknown;
	error?: { code: string; message: string };
}

/** Thrown inside the relay so routes can map failures to clean errors (plan §13). */
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
	if (typeof value !== "object" || value === null) return null;
	const msg = value as Record<string, unknown>;
	if (msg.type !== "response") return null;
	if (typeof msg.requestId !== "string" || msg.requestId.length === 0)
		return null;
	if (msg.error !== undefined) {
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
