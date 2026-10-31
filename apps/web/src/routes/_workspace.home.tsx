import { createFileRoute } from "@tanstack/react-router";
import { ReadingDesk } from "~/components/home/reading-desk";
import { readHistoryCounts } from "~/lib/history";

const Home = () => <ReadingDesk initialHistory={Route.useLoaderData()} />;

export const Route = createFileRoute("/_workspace/home")({
	ssr: false,
	loader: async () => {
		try {
			return { counts: await readHistoryCounts(), connectionError: "" };
		} catch (error) {
			return {
				counts: null,
				connectionError:
					error instanceof Error
						? error.message
						: "Local history could not be read. Try again.",
			};
		}
	},
	pendingMs: 0,
	pendingMinMs: 200,
	pendingComponent: () => (
		<main className="min-h-svh bg-background px-6 pt-8 text-foreground sm:px-10">
			<div className="mx-auto max-w-5xl">
				<p
					role="status"
					className="mt-[30svh] text-center text-sm text-muted-foreground"
				>
					Checking Tabot…
				</p>
			</div>
		</main>
	),
	head: () => ({ meta: [{ title: "Find a page · Tabot" }] }),
	component: Home,
});
