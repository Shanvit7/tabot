import { createFileRoute } from "@tanstack/react-router";
import { ActivityWorkspace } from "~/components/activity/activity-workspace";

export const Route = createFileRoute("/recurring-patterns")({
	head: () => ({
		meta: [
			{ title: "Recurring patterns | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: () => <ActivityWorkspace view="patterns" />,
});
