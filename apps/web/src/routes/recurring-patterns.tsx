import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HomeShell } from "~/components/home-shell";
import { Loading } from "~/components/ui/work-panels";
import { useHomeData } from "~/hooks/use-home-data";
import { originOf, prettySite } from "~/lib/context-graph-data";
import { RecurrenceMap } from "~/lib/recurrence-map";

const RecurringPatterns = () => {
	const { derived, events, initialized, hasExtension } = useHomeData();
	const [selectedId, setSelectedId] = useState("");
	const memories = useMemo(
		() =>
			(derived?.memories ?? []).filter((memory) => memory.kind === "recurrent"),
		[derived],
	);
	// Same preference as Home: a favicon captured from the tab beats the guess.
	const favicons = useMemo(() => {
		const map = new Map<string, string>();
		for (const event of events ?? []) {
			if (!event.favicon || !event.url) continue;
			const origin = originOf(event.url);
			if (origin) map.set(origin, event.favicon);
		}
		return map;
	}, [events]);
	if (!initialized) return <Loading />;
	const selected =
		memories.find((memory) => memory.id === selectedId) ?? memories[0];
	// The row already prints the sequence, period count and last-seen date, so the
	// only thing left to offer is the drill-through into the Home graph.
	const topOrigin =
		selected?.fingerprint?.orderedOrigins?.[0] ??
		selected?.fingerprint?.domains?.[0]?.domain ??
		"";
	return (
		<HomeShell>
			<header className="mb-8">
				<h1 className="text-[32px] font-semibold tracking-tight sm:text-[40px]">
					Recurring patterns
				</h1>
				<p className="mt-2 max-w-xl text-sm text-[#476151]">
					Separate observed periods with similar browsing behavior.
				</p>
			</header>
			{!hasExtension && (
				<p
					role="alert"
					className="mb-6 rounded-lg bg-[#fff2da] p-4 text-sm text-[#80500f]"
				>
					Extension not detected. Load Tabot in this Chrome profile, then
					reload.
				</p>
			)}
			{memories.length ? (
				<>
					<RecurrenceMap
						memories={memories}
						favicons={favicons}
						selectedId={selected?.id ?? ""}
						onSelect={setSelectedId}
					/>
					{selected && topOrigin && (
						<Link
							to="/home"
							search={{ context: selected.lastContextId }}
							className="work-meta mt-4 inline-flex min-h-11 items-center text-[#476151] underline"
						>
							See {prettySite(topOrigin)} on Home
						</Link>
					)}
				</>
			) : (
				<p className="rounded-xl bg-[#f5f8f4] p-10 text-sm text-[#476151]">
					No recurring patterns yet. Browse normally; patterns appear after
					separate periods of similar activity.
				</p>
			)}
		</HomeShell>
	);
};
export const Route = createFileRoute("/recurring-patterns")({
	head: () => ({
		meta: [
			{ title: "Recurring patterns | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: RecurringPatterns,
});
