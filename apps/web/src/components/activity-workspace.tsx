import { derive } from "@tabot/shared";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
	ActivityPatterns,
	ActivityTimeline,
} from "~/components/activity-history";
import { ActivityTrailMap } from "~/components/activity-trail-map";
import { Connectors } from "~/components/connectors";
import { ExportDisclosure } from "~/components/export-disclosure";
import { HomeShell } from "~/components/home-shell";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { buildActivityExplorer } from "~/lib/activity-explorer";
import { rangeStart } from "~/lib/home-data";
import "~/styles/activity-history.css";

type View = "map" | "timeline" | "patterns";
const periods = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "7 days" },
	{ id: "30d", label: "30 days" },
	{ id: "all", label: "All time" },
] as const;

export const ActivityWorkspace = ({ view }: { view: View }) => {
	const { events, initialized, hasExtension, degraded } = useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const [period, setPeriod] = useState<(typeof periods)[number]["id"]>(
		view === "map" ? "7d" : "7d",
	);
	const [query, setQuery] = useState("");
	const term = query.trim().toLowerCase();
	const from = rangeStart(period);
	const to = Date.now();
	const model = useMemo(
		() => buildActivityExplorer(events ?? [], from, to),
		[events, from, to],
	);
	const derived = useMemo(() => (events ? derive(events) : null), [events]);
	const scope =
		typeof window === "undefined"
			? null
			: new URLSearchParams(window.location.search);
	const scopeFrom = Number(scope?.get("from"));
	const scopeTo = Number(scope?.get("to"));
	const validScope =
		view === "timeline" &&
		Number.isFinite(scopeFrom) &&
		Number.isFinite(scopeTo) &&
		scopeFrom > 0 &&
		scopeTo >= scopeFrom;
	const visibleTimeline = model.timeline.filter(
		(entry) =>
			`${entry.source} ${entry.target}`.toLowerCase().includes(term) &&
			(!validScope || (entry.at >= scopeFrom && entry.at <= scopeTo)),
	);
	const visiblePatterns = model.patterns.filter((pattern) =>
		[
			...pattern.fingerprint.orderedOrigins,
			...pattern.fingerprint.domains.map((site) => site.domain),
		].some((origin) => origin.toLowerCase().includes(term)),
	);
	const title =
		view === "map"
			? "Retrace your steps."
			: view === "timeline"
				? "Wind back your day."
				: "Find familiar rhythms.";
	const description =
		view === "map"
			? "A day, a trail, a familiar place. Find your way back."
			: view === "timeline"
				? "Scrub, step, or replay. One recorded moment at a time."
				: "Explore the repeats. See the dates that make them real.";

	if (!initialized || redirecting)
		return (
			<HomeShell>
				<GraphLoading
					title="Loading local activity"
					message="Your browser history stays on this device."
				/>
			</HomeShell>
		);
	if (events === null)
		return (
			<HomeShell degraded={degraded}>
				<section className="grid min-h-64 content-center justify-items-center gap-3 text-center">
					<h1 className="text-3xl font-semibold">
						Activity could not be loaded.
					</h1>
					<p className="max-w-lg text-work-muted">
						Your local data is unchanged. Check that the Tabot extension is
						available, then retry.
					</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="min-h-11 bg-work-accent px-4"
					>
						Try again
					</button>
				</section>
			</HomeShell>
		);

	const onReplay = (start: number, end: number) =>
		window.location.assign(`/activities?from=${start}&to=${end}`);
	return (
		<HomeShell degraded={degraded}>
			<header className="mb-8 flex flex-wrap items-end justify-between gap-5">
				<div>
					<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
						{title}
					</h1>
					<p className="mt-3 max-w-2xl text-lg text-work-muted">
						{description}
					</p>
				</div>
				<label className="grid gap-1 text-sm">
					<span>Activity period</span>
					<select
						value={period}
						onChange={(event) => setPeriod(event.target.value as typeof period)}
						className="min-h-11 border border-work-line bg-white px-3"
					>
						<option value="today">Today</option>
						<option value="7d">Last 7 days</option>
						<option value="30d">Last 30 days</option>
						<option value="all">All time</option>
					</select>
				</label>
			</header>
			<div className="mb-5 flex flex-wrap items-center gap-4">
				<label className="flex min-h-12 w-full items-center gap-3 border border-work-line bg-work-surface px-4 sm:max-w-sm">
					<Search size={18} aria-hidden="true" />
					<span className="sr-only">Search websites</span>
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Find a website…"
						className="min-w-0 flex-1 bg-transparent outline-none"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							aria-label="Clear search"
						>
							<X size={18} />
						</button>
					)}
				</label>
				<span className="text-sm text-work-muted">
					{new Set(
						events
							.map((event) => {
								try {
									return new URL(event.url ?? "").hostname;
								} catch {
									return "";
								}
							})
							.filter(Boolean),
					).size.toLocaleString("en-GB")}{" "}
					websites · activity remains local
				</span>
				{validScope && (
					<button
						type="button"
						className="min-h-11 underline"
						onClick={() => window.location.assign("/activities")}
					>
						Clear appearance filter
					</button>
				)}
			</div>
			{view === "map" && (
				<ActivityTrailMap
					key={`${period}:${query}`}
					trails={model.trails}
					query={term}
				/>
			)}
			{view === "timeline" && (
				<ActivityTimeline
					key={`${period}:${query}:${validScope ? `${scopeFrom}:${scopeTo}` : ""}`}
					timeline={visibleTimeline}
				/>
			)}
			{view === "patterns" && (
				<ActivityPatterns
					key={`${period}:${query}`}
					patterns={visiblePatterns}
					hasQuery={!!term}
					timeline={model.timeline}
					onReplay={onReplay}
				/>
			)}
			<p className="mt-5 text-sm text-work-muted">
				Activity is derived from recorded website changes. Time estimates are
				not attention or productivity measures.
			</p>
			<Connectors />
			<ExportDisclosure derived={derived} />
		</HomeShell>
	);
};
