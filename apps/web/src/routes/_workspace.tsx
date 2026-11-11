import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dock } from "~/components/shadcn-space/dock";
import { readHistoryCounts } from "~/lib/history";

const WorkspaceLayout = () => {
	const navigate = useNavigate();
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		let active = true;
		void readHistoryCounts()
			.then(() => {
				if (active) setConnected(true);
			})
			.catch(() => {
				if (active)
					void navigate({ to: "/extension-not-connected", replace: true });
			});
		return () => {
			active = false;
		};
	}, [navigate]);

	if (!connected)
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
			<Dock />
		</>
	);
};

export const Route = createFileRoute("/_workspace")({
	component: WorkspaceLayout,
});
