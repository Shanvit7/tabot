import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Dock } from "~/components/shadcn-space/dock";

const WorkspaceLayout = () => (
	<>
		<Outlet />
		<Dock />
	</>
);

export const Route = createFileRoute("/_workspace")({
	component: WorkspaceLayout,
});
