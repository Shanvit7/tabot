import { createFileRoute } from "@tanstack/react-router";
import { Home } from "~/components/home-page";

export const Route = createFileRoute("/home")({
	head: () => ({
		meta: [
			{ title: "Home | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Home,
});
