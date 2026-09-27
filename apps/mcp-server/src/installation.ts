import { MAX_MESSAGE_CHARS, REQUEST_TIMEOUT_MS } from "./lib/constants";
import {
	ERROR_CODES,
	parseClientMessage,
	RelayError,
	type ServerRequest,
} from "./lib/protocol";

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * One Durable Object per logical Tabot installation (plan §12). Owns the live
 * extension WebSocket, routes correlated requests to it, and never stores
 * browsing context — only in-flight request state (plan §19).
 */
export class TabotInstallation implements DurableObject {
	private readonly state: DurableObjectState;
	private readonly pending = new Map<string, PendingRequest>();

	constructor(state: DurableObjectState, _env: unknown) {
		this.state = state;
		// Heartbeats answered without waking the object (plan §12 hibernation).
		this.state.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") === "websocket") {
			return this.acceptWebSocket(
				request.headers.get("Sec-WebSocket-Protocol"),
			);
		}
		return this.dispatchRequest(request);
	}

	private acceptWebSocket(protocol: string | null): Response {
		// Single live connection per installation: replace any stale socket.
		for (const existing of this.state.getWebSockets()) {
			existing.close(1000, "replaced");
		}
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.state.acceptWebSocket(server);
		return new Response(null, {
			status: 101,
			headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined,
			webSocket: client,
		});
	}

	private async dispatchRequest(request: Request): Promise<Response> {
		let method: string;
		let params: unknown;
		try {
			const body = (await request.json()) as {
				method?: unknown;
				params?: unknown;
			};
			if (typeof body.method !== "string") throw new Error("missing method");
			method = body.method;
			params = body.params ?? {};
		} catch {
			return Response.json(
				{
					ok: false,
					error: {
						code: ERROR_CODES.INTERNAL,
						message: "Bad dispatch request",
					},
				},
				{ status: 400 },
			);
		}
		try {
			const result = await this.dispatch(method, params);
			return Response.json({ ok: true, result });
		} catch (error) {
			if (error instanceof RelayError) {
				return Response.json(
					{ ok: false, error: { code: error.code, message: error.message } },
					{ status: 502 },
				);
			}
			return Response.json(
				{
					ok: false,
					error: { code: ERROR_CODES.INTERNAL, message: "Relay failure" },
				},
				{ status: 500 },
			);
		}
	}

	/** Send a request to the extension and await the correlated response (plan §6). */
	dispatch(method: string, params: unknown): Promise<unknown> {
		const socket = this.state.getWebSockets()[0];
		if (!socket) {
			return Promise.reject(
				new RelayError(
					ERROR_CODES.OFFLINE,
					"Tabot extension is currently offline. Open Chrome with Tabot enabled and try again.",
				),
			);
		}
		const requestId = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(
					new RelayError(
						ERROR_CODES.TIMEOUT,
						"Tabot extension did not respond in time.",
					),
				);
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(requestId, { resolve, reject, timer });
			const request: ServerRequest = {
				type: "request",
				requestId,
				method,
				params,
			};
			socket.send(JSON.stringify(request));
		});
	}

	async webSocketMessage(
		_socket: WebSocket,
		message: string | ArrayBuffer,
	): Promise<void> {
		if (typeof message !== "string") return;
		if (message.length > MAX_MESSAGE_CHARS) {
			this.rejectAll(
				new RelayError(
					ERROR_CODES.MALFORMED,
					"Extension message exceeded size limit.",
				),
			);
			return;
		}
		const parsed = parseClientMessage(message);
		if (!parsed) return;
		const entry = this.pending.get(parsed.requestId);
		if (!entry) return;
		this.pending.delete(parsed.requestId);
		clearTimeout(entry.timer);
		if (parsed.error) {
			entry.reject(new RelayError(ERROR_CODES.INTERNAL, parsed.error.message));
		} else {
			entry.resolve(parsed.result);
		}
	}

	async webSocketClose(socket: WebSocket): Promise<void> {
		this.rejectAll(
			new RelayError(
				ERROR_CODES.DISCONNECTED,
				"Extension disconnected during request.",
			),
		);
		socket.close(1000, "closed");
	}

	async webSocketError(_socket: WebSocket, _error: unknown): Promise<void> {
		this.rejectAll(
			new RelayError(ERROR_CODES.DISCONNECTED, "Extension connection errored."),
		);
	}

	private rejectAll(error: Error): void {
		for (const [requestId, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(error);
			this.pending.delete(requestId);
		}
	}
}
