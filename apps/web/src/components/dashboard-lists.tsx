import type { BrowserContext, Session } from "@tabot/shared";
import { Empty } from "~/components/ui/dashboard-panels";
import { formatDuration } from "~/lib/dashboard-data";

const formatDate = (timestamp: number) =>
	new Date(timestamp).toLocaleString(
		Intl.DateTimeFormat().resolvedOptions().locale,
		{
			localeMatcher: "lookup",
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
	);

export const ActivityList = ({
	sessions,
	contexts,
}: {
	sessions: Session[];
	contexts: BrowserContext[];
}) => {
	if (sessions.length === 0 && contexts.length === 0) {
		return <Empty text="No activity yet — browse with extension connected." />;
	}

	return (
		<div className="space-y-3">
			{sessions.map((session) => (
				<article key={session.id} className="border-hard bg-zinc-50 p-4">
					<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
						<h3 className="min-w-0 break-all text-base font-bold">
							{session.domains[0]?.domain ?? "Unknown site"}
						</h3>
						<span className="font-mono text-xs text-muted-foreground">
							{formatDate(session.startTimestamp)}
						</span>
						<span className="font-mono text-xs text-muted-foreground">
							{formatDuration(session.duration)}
						</span>
					</div>
					<p className="mt-2 font-mono text-xs text-muted-foreground">
						{session.eventCount} events · {session.interactionCount}{" "}
						interactions · {session.tabSwitchCount} tab changes
					</p>
					<p className="mt-2 break-all font-mono text-xs text-muted-foreground">
						{session.domains.map((domain) => domain.domain).join(" · ")}
					</p>
				</article>
			))}
			{contexts.map((context) => (
				<article
					key={context.id}
					className="border-2 border-dashed border-black bg-yellow-100 p-4"
				>
					<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
						<h3 className="min-w-0 break-all text-base font-bold">
							{context.primaryDomain}
						</h3>
						<span className="font-mono text-xs text-muted-foreground">
							{formatDuration(context.duration)} · {context.sessionCount}{" "}
							sessions
						</span>
					</div>
					<p className="mt-2 break-all font-mono text-xs text-muted-foreground">
						{context.domains.map((domain) => domain.domain).join(" · ")}
					</p>
				</article>
			))}
		</div>
	);
};
