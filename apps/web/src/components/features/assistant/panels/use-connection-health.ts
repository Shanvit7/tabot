import {
	type ConnectionState,
	deriveConnectionState,
	type RelayHealth,
} from "@tabot/shared/assistant-connections";
import { useEffect, useRef, useState } from "react";
import { readRelayHealth, reconnectRelay } from "~/lib/history";

export const useConnectionHealth = () => {
	const [reachable, setReachable] = useState<boolean | null>(null);
	const [health, setHealth] = useState<RelayHealth | null>(null);
	const [assistants, setAssistants] = useState<RelayHealth["assistants"]>(null);
	const [reconnecting, setReconnecting] = useState(false);
	const refreshRef = useRef<() => Promise<ConnectionState>>(
		async () => "checking",
	);

	useEffect(() => {
		let active = true;
		let last: ConnectionState = "checking";
		let polls = 0;
		const refresh = async () => {
			const result = await readRelayHealth();
			if (!active) return "checking" as const;
			setReachable(result.reachable);
			setHealth(result.health);
			setAssistants(result.assistants);
			last = deriveConnectionState(
				result.reachable,
				result.health,
				result.assistants,
			);
			return last;
		};
		refreshRef.current = refresh;
		void refresh();
		const onFocus = () => void refresh();
		window.addEventListener("focus", onFocus);
		// Reconnecting usually resolves on its own: poll every 3 s, stop after 30 s.
		const poll = window.setInterval(() => {
			if (last !== "relay-connecting") {
				polls = 0;
				return;
			}
			if (++polls <= 10) void refresh();
		}, 3_000);
		return () => {
			active = false;
			window.clearInterval(poll);
			window.removeEventListener("focus", onFocus);
		};
	}, []);

	const reconnect = async () => {
		setReconnecting(true);
		try {
			await reconnectRelay();
		} catch {}
		await refreshRef.current();
		setReconnecting(false);
	};

	return {
		state: deriveConnectionState(reachable, health, assistants),
		reconnecting,
		reconnect,
		refresh: () => refreshRef.current(),
	};
};
