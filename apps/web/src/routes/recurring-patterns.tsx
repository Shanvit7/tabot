import { createFileRoute } from "@tanstack/react-router";
import { HomeShell } from "~/components/home-shell";

const RecurringPatterns = () => (
	<HomeShell>
		<h1 className="text-[32px] font-semibold tracking-tight sm:text-[40px]">
			Recurring patterns
		</h1>
		<p role="status" className="mt-3 max-w-xl text-sm text-preview-muted">
			This visualization is paused while Tabot’s interface is being redesigned.
			Your browsing data remains stored locally in the extension.
		</p>
	</HomeShell>
);

export const Route = createFileRoute("/recurring-patterns")({
	head: () => ({
		meta: [
			{ title: "Recurring patterns | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: RecurringPatterns,
});
