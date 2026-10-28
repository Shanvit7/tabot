const DASHBOARD_ORIGIN = "https://shanvit7.github.io";
const LOCAL_DASHBOARD_PORTS = new Set(["3000", "3001"]);

export const isDashboardSender = (value: string | undefined): boolean => {
	if (!value) return false;
	try {
		const url = new URL(value);
		if (url.username || url.password) return false;
		return (
			(url.protocol === "https:" &&
				url.origin === DASHBOARD_ORIGIN &&
				(url.pathname === "/tabot" || url.pathname.startsWith("/tabot/"))) ||
			(url.protocol === "http:" &&
				url.hostname === "localhost" &&
				LOCAL_DASHBOARD_PORTS.has(url.port))
		);
	} catch {
		return false;
	}
};
