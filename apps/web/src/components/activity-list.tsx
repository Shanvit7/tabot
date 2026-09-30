import type { BrowserContext, Session } from "@tabot/shared";
import { Link } from "@tanstack/react-router";
import { formatDuration } from "~/lib/home-data";

const formatDate = (timestamp: number) =>
	new Date(timestamp).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});

export const ActivityList = ({
	sessions,
	contexts,
}: {
	sessions: Session[];
	contexts: BrowserContext[];
}) => {
	if (!sessions.length && !contexts.length)
		return (
			<p className="py-8 text-sm text-[#476151]">
				No activity yet. Browse with the extension connected to build your local
				record.
			</p>
		);
	return (
		<div className="divide-y work-rule">
			{sessions.map((session) => (
				<article
					key={session.id}
					className="grid gap-2 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6"
				>
					<time
						dateTime={new Date(session.startTimestamp).toISOString()}
						className="work-meta"
					>
						{formatDate(session.startTimestamp)}
					</time>
					<div className="min-w-0">
						<h3 className="wrap-break-word text-base font-semibold">
							{session.domains[0]?.domain ?? "Unknown site"}
						</h3>
						<p className="work-meta mt-2">
							{formatDuration(session.duration)} · {session.eventCount} moments
							· {session.interactionCount} interactions ·{" "}
							{session.tabSwitchCount} tab changes
						</p>
						<p className="mt-2 wrap-break-word text-sm text-[#476151]">
							{session.domains.map((domain) => domain.domain).join(" · ")}
						</p>
					</div>
				</article>
			))}
			{contexts.map((context) => (
				<article
					key={context.id}
					className="grid gap-2 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6"
				>
					<time
						dateTime={new Date(context.endTimestamp).toISOString()}
						className="work-meta"
					>
						{formatDate(context.endTimestamp)}
					</time>
					<div className="min-w-0">
						<h3 className="wrap-break-word text-base font-semibold">
							{context.primaryDomain}
						</h3>
						<p className="work-meta mt-2">
							Context · {formatDuration(context.duration)} ·{" "}
							{context.sessionCount} sessions · {context.domains.length} sites
						</p>
						<p className="mt-2 wrap-break-word text-sm text-[#476151]">
							{context.domains.map((domain) => domain.domain).join(" · ")}
						</p>
						<Link
							to="/home"
							search={{ context: context.id }}
							className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline"
						>
							Explore context
						</Link>
					</div>
				</article>
			))}
		</div>
	);
};
