import { ArrowUpRight, Compass } from "lucide-react";
import { SessionDate } from "~/components/context-graph/session-date";
import { SessionInspector } from "~/components/context-graph/session-inspector";
import { SessionTime } from "~/components/context-graph/session-time";
import type { SessionSummary } from "~/lib/context-graph-data";
import { formatDuration } from "~/lib/home-data";

export const Sessions = ({
	sessionIds,
	sessions,
}: {
	sessionIds: string[];
	sessions: SessionSummary[];
}) => {
	const ids = new Set(sessionIds);
	const matching = sessions
		.filter((session) => ids.has(session.id))
		.toSorted((a, b) => a.startTimestamp - b.startTimestamp);
	return (
		<section
			aria-label="Browsing sessions"
			className="session-recap mt-5 border-t border-(--session-line) pt-4"
		>
			<h4 className="flex items-center gap-2 text-sm font-semibold text-(--session-ink)">
				<Compass
					aria-hidden="true"
					className="size-4 text-(--session-accent)"
				/>
				Browsing sessions
			</h4>
			{matching.length === 0 ? (
				<p className="mt-3 text-sm text-(--session-muted)">
					No browsing sessions available for this activity.
				</p>
			) : (
				<div className="mt-3 space-y-2">
					{matching.map((session) => {
						const sites = session.domains.filter(
							(site) => site.kind === "site",
						).length;
						return (
							<button
								key={session.id}
								type="button"
								aria-haspopup="dialog"
								onClick={() => {
									void SessionInspector.upsert({ session });
								}}
								className="group flex w-full items-center justify-between gap-3 rounded-xl border border-(--session-line) bg-(--session-bg) px-3 py-3 text-left text-(--session-ink) transition-colors hover:border-(--session-accent) hover:bg-(--session-raised) motion-reduce:transition-none"
							>
								<span className="min-w-0">
									<span className="block text-xs text-(--session-muted)">
										<SessionDate timestamp={session.startTimestamp} />
									</span>
									<span className="mt-1 block text-sm font-medium">
										<SessionTime
											timestamp={session.startTimestamp}
											day={session.startTimestamp}
										/>
										{" · "}
										{formatDuration(session.duration)} in Chrome
									</span>
									<span className="mt-1 block text-xs text-(--session-muted)">
										{sites} {sites === 1 ? "website" : "websites"} ·{" "}
										{session.tabCount} {session.tabCount === 1 ? "tab" : "tabs"}
									</span>
								</span>
								<ArrowUpRight
									aria-hidden="true"
									className="size-4 shrink-0 text-(--session-accent)"
								/>
							</button>
						);
					})}
				</div>
			)}
			{matching.length > 0 && matching.length < ids.size && (
				<p className="mt-3 text-xs text-(--session-muted)">
					Some browsing sessions are no longer available.
				</p>
			)}
		</section>
	);
};
