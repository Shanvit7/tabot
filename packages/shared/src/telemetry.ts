export type TelemetryContext = {
	platform: string;
	release: string;
	environment: string;
};

export type SafeExceptionFrame = {
	filename: string;
	lineno: number;
	colno: number;
	platform: "web:javascript";
};

export type TelemetryErrorSource =
	| "route_boundary"
	| "window_error"
	| "unhandled_rejection"
	| "unhandled_error"
	| "search_indexing_failed"
	| "search_query_failed"
	| "search_warmup_failed"
	| "unknown";

export type TelemetryFailureCode =
	| "model-load-failed"
	| "embedding-inference-failed"
	| "embedding-invalid"
	| "invalid-embedding-request"
	| "embedding-worker-failed"
	| "embedding-busy";

export type TelemetryEvent =
	| { type: "page_view"; route: string; context: TelemetryContext }
	| {
			type: "exception";
			source: TelemetryErrorSource;
			handled: boolean;
			failureCode?: TelemetryFailureCode;
			exception: {
				name: string;
				message: string;
				frames: SafeExceptionFrame[];
			};
			context: TelemetryContext;
	  };

export type TelemetryTransport = {
	capture: (event: TelemetryEvent) => void | Promise<void>;
};

const SAFE_ERROR_NAMES = new Set([
	"Error",
	"AggregateError",
	"EvalError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
]);
const SAFE_FILENAME = /^[A-Za-z0-9_.-]{1,120}$/;
const SAFE_SOURCES = new Set<TelemetryErrorSource>([
	"route_boundary",
	"window_error",
	"unhandled_rejection",
	"unhandled_error",
	"search_indexing_failed",
	"search_query_failed",
	"search_warmup_failed",
	"unknown",
]);

const safeFrames = (stack: string | undefined): SafeExceptionFrame[] => {
	if (!stack) return [];
	const frames: SafeExceptionFrame[] = [];
	for (const line of stack.slice(0, 16_384).split("\n").slice(1)) {
		let location = line.trim();
		if (location.startsWith("at ")) {
			location = location.slice(3);
			const open = location.indexOf(" (");
			if (open >= 0 && location.endsWith(")"))
				location = location.slice(open + 2, -1);
		} else {
			const at = location.lastIndexOf("@");
			if (at >= 0) location = location.slice(at + 1);
		}
		const coordinates = location.match(/^(.*):(\d+):(\d+)$/);
		if (!coordinates) continue;
		const filename =
			coordinates[1]
				.replace(/[?#].*$/, "")
				.split(/[\\/]/)
				.at(-1) ?? "";
		if (!SAFE_FILENAME.test(filename)) continue;
		const lineno = Number(coordinates[2]);
		const colno = Number(coordinates[3]);
		if (lineno > 1_000_000 || colno > 1_000_000) continue;
		frames.push({ filename, lineno, colno, platform: "web:javascript" });
		if (frames.length === 12) break;
	}
	return frames;
};

const safeFailureCode = (value: unknown): TelemetryFailureCode | undefined => {
	try {
		if (value instanceof Error && SAFE_FAILURE_CODES.has(value.message))
			return value.message as TelemetryFailureCode;
	} catch {
		// Malformed thrown values are reduced to generic diagnostics.
	}
	return undefined;
};

const SAFE_FAILURE_CODES: ReadonlySet<string> = new Set([
	"model-load-failed",
	"embedding-inference-failed",
	"embedding-invalid",
	"invalid-embedding-request",
	"embedding-worker-failed",
	"embedding-busy",
]);

const safeException = (value: unknown) => {
	let name = "Error";
	let stack: string | undefined;
	try {
		if (value instanceof Error) {
			if (SAFE_ERROR_NAMES.has(value.name)) name = value.name;
			stack = value.stack;
		}
	} catch {
		// Malformed thrown values are reduced to generic diagnostics.
	}
	return { name, message: "redacted", frames: safeFrames(stack) };
};

export const createTelemetry = (
	transport: TelemetryTransport,
	context: TelemetryContext,
) => {
	const send = (event: TelemetryEvent) => {
		try {
			void Promise.resolve(transport.capture(event)).catch(() => {});
		} catch {
			// Telemetry must never interrupt product behavior.
		}
	};

	return {
		pageView: (route: string) =>
			send({
				type: "page_view",
				route: /^\/[a-z0-9/-]{0,80}$/i.test(route) ? route : "/other",
				context,
			}),
		captureError: (
			value: unknown,
			source: TelemetryErrorSource,
			handled = false,
		) => {
			const failureCode = safeFailureCode(value);
			send({
				type: "exception",
				source: SAFE_SOURCES.has(source) ? source : "unknown",
				handled,
				...(failureCode ? { failureCode } : {}),
				exception: safeException(value),
				context,
			});
		},
	};
};
