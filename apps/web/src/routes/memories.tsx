import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { MemoryList } from "~/components/memory-list";
import { Button } from "~/components/ui/button";
import { Loading } from "~/components/ui/dashboard-panels";
import { useDashboardData } from "~/hooks/use-dashboard-data";

const Memories = () => {
	const { derived, initialized } = useDashboardData();
	if (!initialized) return <Loading />;

	return (
		<DashboardShell>
			<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-4xl font-bold tracking-tight">All memories</h1>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Recurring browser patterns, shown with their recorded evidence.
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to="/dashboard">Back to dashboard</Link>
				</Button>
			</div>
			<MemoryList memories={derived?.memories.slice().reverse() ?? []} />
		</DashboardShell>
	);
};

export const Route = createFileRoute("/memories")({
	head: () => ({
		meta: [
			{ title: "Memories | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Memories,
});
