export type AssistantProvider = "chatgpt" | "claude";

export type AssistantConnections = Record<AssistantProvider, boolean> & {
	order?: AssistantProvider[];
};

export const parseAssistantConnections = (
	value: unknown,
): AssistantConnections | null => {
	if (
		!value ||
		typeof value !== "object" ||
		!("chatgpt" in value) ||
		typeof value.chatgpt !== "boolean" ||
		!("claude" in value) ||
		typeof value.claude !== "boolean"
	)
		return null;
	const candidate = value as Record<string, unknown>;
	const order: AssistantProvider[] = Array.isArray(candidate.order)
		? candidate.order.filter(
				(provider: unknown): provider is AssistantProvider =>
					(provider === "chatgpt" || provider === "claude") &&
					candidate[provider] === true,
			)
		: [];
	return {
		chatgpt: value.chatgpt,
		claude: value.claude,
		order: [...new Set(order)],
	};
};

export const assistantProviderFromClientName = (
	clientName: string,
): AssistantProvider | null => {
	const name = clientName.toLowerCase();
	if (name.includes("claude")) return "claude";
	if (name.includes("chatgpt") || name.includes("openai")) return "chatgpt";
	return null;
};

export type RelayState = "idle" | "connecting" | "connected" | "offline";
export type RelayErrorCode =
	| "socket-error"
	| "socket-closed"
	| "heartbeat-timeout"
	| "connect-failed";

/** Allowlisted live-relay snapshot; no URLs, tokens or installation ids. */
export interface RelayHealth {
	relay: { state: RelayState; error: RelayErrorCode | null };
	/** Relay → extension test request; null when not attempted. */
	roundTrip: { ok: boolean; status?: number } | null;
	/** OAuth grants; null when they could not be read. */
	assistants: AssistantConnections | null;
}

const RELAY_STATES: readonly RelayState[] = [
	"idle",
	"connecting",
	"connected",
	"offline",
];
const RELAY_ERRORS: readonly RelayErrorCode[] = [
	"socket-error",
	"socket-closed",
	"heartbeat-timeout",
	"connect-failed",
];

export const parseRelayHealth = (value: unknown): RelayHealth | null => {
	if (!value || typeof value !== "object") return null;
	const { relay, roundTrip, assistants } = value as Record<string, unknown>;
	if (!relay || typeof relay !== "object") return null;
	const { state, error } = relay as Record<string, unknown>;
	if (!RELAY_STATES.includes(state as RelayState)) return null;
	if (error !== null && !RELAY_ERRORS.includes(error as RelayErrorCode))
		return null;
	let probe: RelayHealth["roundTrip"] = null;
	if (roundTrip !== null) {
		if (!roundTrip || typeof roundTrip !== "object") return null;
		const { ok, status } = roundTrip as Record<string, unknown>;
		if (typeof ok !== "boolean") return null;
		probe = typeof status === "number" ? { ok, status } : { ok };
	}
	return {
		relay: {
			state: state as RelayState,
			error: error as RelayErrorCode | null,
		},
		roundTrip: probe,
		assistants:
			assistants === null ? null : parseAssistantConnections(assistants),
	};
};

export type ConnectionState =
	| "checking"
	| "extension-unreachable"
	| "not-authorized"
	| "auth-unknown"
	| "relay-connecting"
	| "relay-offline"
	| "round-trip-failed"
	| "healthy";

/**
 * First failing link wins. `reachable` null = first check still running;
 * `health` null with a reachable extension = status could not be read.
 * "healthy" requires OAuth grant AND live socket AND a working test request.
 */
export const deriveConnectionState = (
	reachable: boolean | null,
	health: RelayHealth | null,
): ConnectionState => {
	if (reachable === null) return "checking";
	if (!reachable) return "extension-unreachable";
	if (!health?.assistants) return "auth-unknown";
	if (!health.assistants.chatgpt) return "not-authorized";
	if (health.relay.state === "idle" || health.relay.state === "connecting")
		return "relay-connecting";
	if (health.relay.state === "offline") return "relay-offline";
	return health.roundTrip?.ok ? "healthy" : "round-trip-failed";
};
