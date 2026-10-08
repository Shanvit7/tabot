import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { Home } from "~/components/home-page";

const HomeRoute = () => {
	const href = useRouterState({ select: (state) => state.location.href });
	const requestedId = new URL(href, "https://tabot.local").searchParams.get(
		"context",
	);
	return <Home key={requestedId ?? "default"} requestedId={requestedId} />;
};

export const Route = createFileRoute("/home")({
	head: () => ({
		meta: [
			{ title: "Home | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: HomeRoute,
});
