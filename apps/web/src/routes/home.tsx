import { createFileRoute } from "@tanstack/react-router";
import { ActivityWorkspace } from "~/components/activity-workspace";

export const Route = createFileRoute("/home")({
	head: () => ({
		meta: [
			{ title: "Trail map | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: () => <ActivityWorkspace view="map" />,
});
