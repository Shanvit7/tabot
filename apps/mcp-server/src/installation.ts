import {
	MAX_MESSAGE_CHARS,
	MAX_PENDING_REQUESTS,
	REQUEST_TIMEOUT_MS,
} from "./lib/constants";
import { logEvent } from "./lib/log";
import {
	ERROR_CODES,
	parseClientMessage,
	RelayError,
	type ServerRequest,
} from "./lib/protocol";

interface PendingRequest {
	socket: WebSocket;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * One Durable Object per logical Tabot installation. Owns the live extension
 * WebSocket, routes correlated requests to it, and never stores browsing
 * context — only in-flight request state.
 */
export class TabotInstallation implements DurableObject {
	private readonly state: DurableObjectState;
	private readonly pending = new Map<string, PendingRequest>();

	constructor(state: DurableObjectState, _env: unknown) {
		this.state = state;
		// Heartbeats answered without waking the object.
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
			this.rejectSocket(
				existing,
				new RelayError(
					ERROR_CODES.DISCONNECTED,
					"Extension connection replaced.",
				),
			);
			existing.close(1000, "replaced");
		}
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.state.acceptWebSocket(server);
		logEvent("relay_connected");
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

	/** Send a request to the extension and await the correlated response. */
	dispatch(method: string, params: unknown): Promise<unknown> {
		const socket = this.state
			.getWebSockets()
			.find((candidate) => candidate.readyState === WebSocket.OPEN);
		if (!socket) {
			return Promise.reject(
				new RelayError(
					ERROR_CODES.OFFLINE,
					"Tabot extension is currently offline. Open Chrome with Tabot enabled and try again.",
				),
			);
		}
		if (this.pending.size >= MAX_PENDING_REQUESTS) {
			return Promise.reject(
				new RelayError(
					ERROR_CODES.BUSY,
					"Tabot extension has too many pending requests. Try again.",
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
			this.pending.set(requestId, { socket, resolve, reject, timer });
			const request: ServerRequest = {
				type: "request",
				requestId,
				method,
				params,
			};
			try {
				socket.send(JSON.stringify(request));
			} catch {
				this.pending.delete(requestId);
				clearTimeout(timer);
				reject(
					new RelayError(
						ERROR_CODES.DISCONNECTED,
						"Extension connection could not send request.",
					),
				);
			}
		});
	}

	async webSocketMessage(
		socket: WebSocket,
		message: string | ArrayBuffer,
	): Promise<void> {
		if (typeof message !== "string" || message.length > MAX_MESSAGE_CHARS) {
			this.rejectSocket(
				socket,
				new RelayError(
					ERROR_CODES.MALFORMED,
					"Extension message format or size is invalid.",
				),
			);
			socket.close(
				typeof message === "string" ? 1009 : 1003,
				"invalid message",
			);
			logEvent("relay_rejected", { code: ERROR_CODES.MALFORMED });
			return;
		}
		const parsed = parseClientMessage(message);
		if (!parsed) {
			this.rejectSocket(
				socket,
				new RelayError(
					ERROR_CODES.MALFORMED,
					"Extension sent an invalid response.",
				),
			);
			socket.close(1008, "invalid response");
			logEvent("relay_rejected", { code: ERROR_CODES.MALFORMED });
			return;
		}
		const entry = this.pending.get(parsed.requestId);
		if (!entry || entry.socket !== socket) return;
		this.pending.delete(parsed.requestId);
		clearTimeout(entry.timer);
		if (parsed.error) {
			const code =
				Object.values(ERROR_CODES).find(
					(known) => known === parsed.error?.code,
				) ?? ERROR_CODES.INTERNAL;
			entry.reject(new RelayError(code, parsed.error.message));
		} else {
			entry.resolve(parsed.result);
		}
	}

	async webSocketClose(socket: WebSocket): Promise<void> {
		this.rejectSocket(
			socket,
			new RelayError(
				ERROR_CODES.DISCONNECTED,
				"Extension disconnected during request.",
			),
		);
		logEvent("relay_disconnected", { code: ERROR_CODES.DISCONNECTED });
		socket.close(1000, "closed");
	}

	async webSocketError(socket: WebSocket, _error: unknown): Promise<void> {
		this.rejectSocket(
			socket,
			new RelayError(ERROR_CODES.DISCONNECTED, "Extension connection errored."),
		);
		logEvent("relay_error", { code: ERROR_CODES.DISCONNECTED });
		socket.close(1011, "connection error");
	}

	private rejectSocket(socket: WebSocket, error: Error): void {
		for (const [requestId, entry] of this.pending) {
			if (entry.socket !== socket) continue;
			clearTimeout(entry.timer);
			entry.reject(error);
			this.pending.delete(requestId);
		}
	}
}
