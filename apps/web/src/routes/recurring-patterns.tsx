import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HomeShell } from "~/components/home-shell";
import { RecurringPatternAssistant } from "~/components/recurring-pattern-assistant";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { originOf, prettySite } from "~/lib/context-graph-data";
import { RecurrenceMap } from "~/lib/recurrence-map";
import { useAssistantConnection } from "~/providers/assistant-connection";

const RecurringPatterns = () => {
	const { derived, events, initialized, hasExtension } = useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const assistantConnected = useAssistantConnection() === true;
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
	if (!initialized || redirecting) {
		return (
			<HomeShell>
				<GraphLoading />
			</HomeShell>
		);
	}
	const selected =
		memories.find((memory) => memory.id === selectedId) ?? memories[0];
	// Selection drives both the assistant prompt and the supporting-context link.
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
				<p className="mt-2 max-w-xl text-sm text-preview-muted">
					Separate observed periods with similar browsing behavior.
				</p>
				<RecurringPatternAssistant connected={assistantConnected} />
			</header>
			{memories.length ? (
				<RecurrenceMap
					memories={memories}
					favicons={favicons}
					selectedId={selected?.id ?? ""}
					onSelect={setSelectedId}
					selectedActions={
						selected && (
							<>
								<RecurringPatternAssistant
									memoryId={selected.id}
									connected={assistantConnected}
								/>
								{topOrigin && (
									<Link
										to="/home"
										search={{ context: selected.lastContextId }}
										aria-label={`View latest period on map for ${prettySite(topOrigin)}`}
										title={`View latest period on map for ${prettySite(topOrigin)}`}
										className="inline-flex min-h-11 items-center rounded-lg border border-preview-line px-3 text-xs font-medium text-(--work-muted) hover:bg-[#e9eee8]"
									>
										View latest period on map
									</Link>
								)}
							</>
						)
					}
				/>
			) : (
				<GraphLoading
					title="No repeated activity yet"
					message="Browse normally. Similar visits at different times will show up here."
				/>
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
