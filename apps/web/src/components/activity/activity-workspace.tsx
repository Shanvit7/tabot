import { derive, type HistorySearchResult } from "@tabot/shared";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildActivityExplorer } from "~/components/activity/activity-explorer";
import {
	ActivityPatterns,
	ActivityTimeline,
} from "~/components/activity/activity-history";
import { ActivityTrailMap } from "~/components/activity/activity-trail-map";
import { ExportDisclosure } from "~/components/activity/export-disclosure";
import { HomeShell } from "~/components/activity/home-shell";
import { Connectors } from "~/components/assistant-connection/connectors";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { fetchHistorySearch, rangeStart } from "~/lib/home-data";
import "~/styles/activity-history.css";

type View = "map" | "timeline" | "patterns";
const periods = [
	{ id: "today", label: "Today" },
	{ id: "7d", label: "7 days" },
	{ id: "30d", label: "30 days" },
	{ id: "all", label: "All time" },
] as const;

export const ActivityWorkspace = ({ view }: { view: View }) => {
	const { events, initialized, hasExtension, degraded, searchVersion } =
		useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const [period, setPeriod] = useState<(typeof periods)[number]["id"]>(
		view === "map" ? "7d" : "7d",
	);
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState<
		HistorySearchResult[] | null
	>(null);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchUnavailable, setSearchUnavailable] = useState(false);
	const term = query.trim().toLowerCase();
	const searchableView = view === "map" || view === "timeline";
	const from = useMemo(() => rangeStart(period), [period]);
	const to = Date.now();
	useEffect(() => {
		void searchVersion; // Re-query when page/event counts change, even if query text stays the same.
		if (!searchableView || !term) {
			setSearchResults(null);
			setSearchLoading(false);
			setSearchUnavailable(false);
			return;
		}
		let active = true;
		setSearchLoading(true);
		setSearchUnavailable(false);
		const timer = setTimeout(() => {
			void fetchHistorySearch(query.trim(), { from, to: Date.now() }).then(
				(results) => {
					if (!active) return;
					setSearchResults(results);
					setSearchUnavailable(results === null);
					setSearchLoading(false);
				},
			);
		}, 250);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [from, query, searchVersion, searchableView, term]);
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
					<span className="sr-only">
						{searchableView ? "Search local history" : "Search websites"}
					</span>
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={
							searchableView ? "Search local history…" : "Find a website…"
						}
						maxLength={240}
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
			{view === "map" && !term && (
				<ActivityTrailMap
					key={`${period}:${query}`}
					trails={model.trails}
					query={term}
				/>
			)}
			{searchableView && term && (
				<section
					className="mb-8 border border-work-line bg-work-surface p-5"
					aria-live="polite"
					aria-label="Local history search results"
				>
					<h2 className="text-xl font-semibold">Evidence-backed matches</h2>
					<p className="mt-1 text-sm text-work-muted">
						Searches recorded URLs and already captured, redacted page excerpts
						on this device.
					</p>
					{searchLoading && <p className="mt-4">Searching local history…</p>}
					{searchUnavailable && (
						<p className="mt-4">
							Local search unavailable. Your history is unchanged; try again.
						</p>
					)}
					{!searchLoading &&
						!searchUnavailable &&
						searchResults?.length === 0 && (
							<p className="mt-4">
								No matching local evidence. Try different words or a shorter
								date range.
							</p>
						)}
					<div className="mt-4 grid gap-3">
						{searchResults?.map((result) => (
							<article key={result.url} className="border border-work-line p-4">
								<a
									href={result.url}
									target="_blank"
									rel="noreferrer"
									className="font-medium underline"
								>
									{result.host}
									{new URL(result.url).pathname}
								</a>
								<p className="mt-2 text-work-muted">{result.excerpt}</p>
								<p className="mt-2 text-sm text-work-muted">
									{result.eventCount.toLocaleString("en-GB")} activity records ·{" "}
									{result.pageCount.toLocaleString("en-GB")} captured excerpts ·
									last seen {new Date(result.lastSeen).toLocaleString("en-GB")}
								</p>
								<details className="mt-2 text-sm">
									<summary>{result.sourceCount} supporting records</summary>
									<ul className="mt-2 grid gap-1">
										{result.sources.map((source) => (
											<li key={`${source.kind}:${source.id}`}>
												<a
													href={source.url}
													target="_blank"
													rel="noreferrer"
													className="underline"
												>
													{source.kind === "page"
														? "Captured page"
														: "Activity"}{" "}
													· {new Date(source.timestamp).toLocaleString("en-GB")}{" "}
													· {source.id}
												</a>
											</li>
										))}
									</ul>
								</details>
							</article>
						))}
					</div>
				</section>
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
