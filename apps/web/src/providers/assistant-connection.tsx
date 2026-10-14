import type { AssistantConnections, AssistantProvider } from "@tabot/shared";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useReducer,
} from "react";
import { fetchAssistantConnections } from "~/lib/home-data";

type AssistantConnectionState = AssistantConnections | null | undefined;

const AssistantConnectionContext =
	createContext<AssistantConnectionState>(undefined);

export const assistantConnectionReducer = (
	_state: AssistantConnectionState,
	connections: AssistantConnections | null,
): AssistantConnectionState => connections;

export const useAssistantConnection = (
	provider: AssistantProvider = "chatgpt",
): boolean | null | undefined => {
	const connections = useContext(AssistantConnectionContext);
	return connections === null ? null : connections?.[provider];
};

export const useAssistantConnectionOrder = (): AssistantProvider[] =>
	useContext(AssistantConnectionContext)?.order ?? [];

export const AssistantConnectionProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const [connections, dispatch] = useReducer(
		assistantConnectionReducer,
		undefined,
	);

	useEffect(() => {
		let alive = true;
		let inFlight = false;
		const refresh = async () => {
			if (inFlight || document.hidden) return;
			inFlight = true;
			try {
				const next = await fetchAssistantConnections();
				if (alive) dispatch(next);
			} catch {
				if (alive) dispatch(null);
			} finally {
				inFlight = false;
			}
		};
		void refresh();
		const interval = setInterval(refresh, 10_000);
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			alive = false;
			clearInterval(interval);
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, []);

	return (
		<AssistantConnectionContext.Provider value={connections}>
			{children}
		</AssistantConnectionContext.Provider>
	);
};
