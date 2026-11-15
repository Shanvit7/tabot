import { createFileRoute } from "@tanstack/react-router";
import { Home } from "~/components/features/home/home";

export const Route = createFileRoute("/_workspace/home")({
	ssr: false,
	head: () => ({ meta: [{ title: "Home · Tabot" }] }),
	component: Home,
});
