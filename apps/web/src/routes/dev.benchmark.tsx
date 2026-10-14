import { createFileRoute, notFound } from "@tanstack/react-router";
import { Benchmark } from "~/components/dev-benchmark";

export const Route = createFileRoute("/dev/benchmark")({
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound();
	},
	head: () => ({
		meta: [
			{ title: "Transport benchmark | Tabot dev" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Benchmark,
});
