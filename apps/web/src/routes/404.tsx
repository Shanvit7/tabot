import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "~/components/errors/not-found";

export const Route = createFileRoute("/404")({
	head: () => ({
		meta: [
			{ title: "Page not found | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: NotFound,
});
