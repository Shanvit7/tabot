import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { Home } from "~/components/home-page";

const HomeRoute = () => {
	const search = useRouterState({
		select: (state) => state.location.searchStr,
	});
	const requestedId = new URLSearchParams(search).get("context");
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
