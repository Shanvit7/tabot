import { createFileRoute } from "@tanstack/react-router";
import { Home } from "~/components/features/home/home";
import { validateHomeSearch } from "~/components/features/home/search/home-search-params";

export const Route = createFileRoute("/_workspace/home")({
	validateSearch: validateHomeSearch,
	ssr: false,
	head: () => ({ meta: [{ title: "Home · Tabot" }] }),
	component: Home,
});
