import { createFileRoute, Link } from "@tanstack/react-router";
import { ActivityList } from "~/components/dashboard-lists";
import { DashboardShell } from "~/components/dashboard-shell";
import { Button } from "~/components/ui/button";
import { Loading } from "~/components/ui/dashboard-panels";
import { useDashboardData } from "~/hooks/use-dashboard-data";

const Activities = () => {
	const { derived, initialized } = useDashboardData();
	if (!initialized) return <Loading />;

	return (
		<DashboardShell>
			<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-4xl font-bold tracking-tight">All activity</h1>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Browsing stretches and contexts, newest first.
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to="/dashboard">Back to dashboard</Link>
				</Button>
			</div>
			<ActivityList
				sessions={derived?.sessions.slice().reverse() ?? []}
				contexts={derived?.contexts.slice().reverse() ?? []}
			/>
		</DashboardShell>
	);
};

export const Route = createFileRoute("/activities")({
	head: () => ({
		meta: [
			{ title: "Activities | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Activities,
});
