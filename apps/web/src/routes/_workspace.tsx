import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProfileCheckArt } from "~/components/features/workspace/profile-check-art";
import { Dock } from "~/components/ui/navigation/dock";
import { readHistoryCounts } from "~/lib/history";

const WorkspaceLayout = () => {
	const navigate = useNavigate();
	const isSettingsPage = useMatchRoute()({ to: "/settings", fuzzy: false });
	const [extensionReady, setExtensionReady] = useState(false);

	useEffect(() => {
		let active = true;
		const refreshConnection = () => {
			void readHistoryCounts()
				.then(() => {
					if (active) setExtensionReady(true);
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
	}, [navigate]);

	if (!extensionReady)
		return (
			<main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-work-canvas px-6 text-work-muted">
				<ProfileCheckArt />
				<p role="status" className="text-sm">
					Checking Tabot in this Chrome profile…
				</p>
			</main>
		);

	return (
		<>
			<Outlet />
			{!isSettingsPage && <Dock />}
		</>
	);
};

export const Route = createFileRoute("/_workspace")({
	head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
	component: WorkspaceLayout,
});
