import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dock } from "~/components/shadcn-space/dock";
import { readAssistantConnections, readHistoryCounts } from "~/lib/history";

const WorkspaceLayout = () => {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const [chatGptConnected, setChatGptConnected] = useState<boolean | null>(
		null,
	);

	useEffect(() => {
		let active = true;
		const refreshConnection = () => {
			void readHistoryCounts()
				.then(async () => {
					const connections = await readAssistantConnections().catch(
						() => null,
					);
					if (!active) return;
					const isConnected = connections?.chatgpt === true;
					setChatGptConnected(isConnected);
					if (!isConnected && !matchRoute({ to: "/assistant", fuzzy: false }))
						void navigate({ to: "/assistant", replace: true });
				})
				.catch(() => {
					if (active)
						void navigate({ to: "/extension-not-connected", replace: true });
				});
		};
		refreshConnection();
		window.addEventListener("focus", refreshConnection);
		window.addEventListener("tabot:connection-check", refreshConnection);
		return () => {
			active = false;
			window.removeEventListener("focus", refreshConnection);
			window.removeEventListener("tabot:connection-check", refreshConnection);
		};
	}, [matchRoute, navigate]);

	if (chatGptConnected === null)
		return (
			<main className="grid min-h-svh place-items-center bg-work-canvas px-6 text-work-muted">
				<p role="status" className="text-sm">
					Checking Tabot in this Chrome profile…
				</p>
			</main>
		);

	return (
		<>
			<Outlet />
			<Dock chatGptConnected={chatGptConnected} />
		</>
	);
};

export const Route = createFileRoute("/_workspace")({
	component: WorkspaceLayout,
});
