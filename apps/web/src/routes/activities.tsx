import { createFileRoute } from "@tanstack/react-router";
import { ActivityWorkspace } from "~/components/activity-workspace";

export const Route = createFileRoute("/activities")({
	head: () => ({
		meta: [
			{ title: "Timeline | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: () => <ActivityWorkspace view="timeline" />,
});
