import type { ConnectionState } from "@tabot/shared/assistant-connections";

export const CONNECTION_TAB_LABEL: Record<ConnectionState, string> = {
	checking: "Checking…",
	"extension-unreachable": "Tabot not found",
	"not-authorized": "Set up ChatGPT",
	"auth-unknown": "Can’t check",
	"relay-connecting": "Connecting…",
	"relay-offline": "Connection lost",
	"round-trip-failed": "No reply",
	healthy: "Connected",
};
