import { createFileRoute } from "@tanstack/react-router";
import { ReadingDesk } from "~/components/home/reading-desk";

const Home = () => <ReadingDesk />;

export const Route = createFileRoute("/_workspace/home")({
	ssr: false,
	head: () => ({ meta: [{ title: "Find a page · Tabot" }] }),
	component: Home,
});
