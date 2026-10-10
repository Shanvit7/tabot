import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useReducer,
} from "react";
import { fetchAssistantConnection } from "~/lib/home-data";

type AssistantConnection = boolean | null | undefined;

const AssistantConnectionContext =
	createContext<AssistantConnection>(undefined);

export const assistantConnectionReducer = (
	_state: AssistantConnection,
	connected: boolean | null,
): AssistantConnection => connected;

export const useAssistantConnection = () =>
	useContext(AssistantConnectionContext);

export const AssistantConnectionProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const [connected, dispatch] = useReducer(
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
				const next = await fetchAssistantConnection();
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
		<AssistantConnectionContext.Provider value={connected}>
			{children}
		</AssistantConnectionContext.Provider>
	);
};
