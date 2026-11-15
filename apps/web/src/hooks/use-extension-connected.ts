import { useEffect, useState } from "react";
import { isTabotConnected } from "~/lib/history";

export const useExtensionConnected = () => {
	const [connected, setConnected] = useState(false);
	useEffect(() => {
		let active = true;
		let checking = false;
		const refreshConnection = async () => {
			if (checking) return;
			checking = true;
			const isConnected = await isTabotConnected();
			if (active) setConnected(isConnected);
			checking = false;
		};
		void refreshConnection();
		window.addEventListener("focus", refreshConnection);
		return () => {
			active = false;
			window.removeEventListener("focus", refreshConnection);
		};
	}, []);
	return connected;
};
