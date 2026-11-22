import type { ConnectionState } from "@tabot/shared/assistant-connections";

export const CONNECTION_TAB_LABEL: Record<ConnectionState, string> = {
	checking: "Checking…",
	"extension-unreachable": "Can’t reach Tabot",
	"not-authorized": "Connect Tabot",
	"auth-unknown": "Check ChatGPT",
	"relay-unavailable": "Reconnect Tabot",
	"relay-connecting": "Connecting…",
	"relay-offline": "Tabot offline",
	"round-trip-failed": "Tabot not responding",
	healthy: "Connected",
};
