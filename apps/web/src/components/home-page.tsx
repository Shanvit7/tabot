import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { Connectors } from "~/components/connectors";
import { ExportDisclosure } from "~/components/export-disclosure";
import { HomeShell } from "~/components/home-shell";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { GRAPH_LIMITS, originOf } from "~/lib/context-graph-data";
import { rangeStart, type StatsRange } from "~/lib/home-data";
import { useAssistantConnection } from "~/providers/assistant-connection";

const ContextGraph = lazy(() =>
	import("~/lib/context-graph").then((module) => ({
		default: module.ContextGraph,
	})),
);

type RangeKey = StatsRange | "custom";

const RANGES: Array<{ id: RangeKey; label: string }> = [
	{ id: "5m", label: "5 min" },
	{ id: "1h", label: "1 hour" },
	{ id: "6h", label: "6 hours" },
	{ id: "today", label: "Today" },
	{ id: "7d", label: "7 days" },
	{ id: "30d", label: "30 days" },
	{ id: "all", label: "All time" },
	{ id: "custom", label: "Pick dates" },
];

const dayStart = (value: string) =>
	value ? new Date(`${value}T00:00:00`).getTime() : 0;
const dayEnd = (value: string) =>
	value
		? new Date(`${value}T23:59:59.999`).getTime()
		: Number.POSITIVE_INFINITY;

export const Home = ({ requestedId }: { requestedId: string | null }) => {
	const { derived, events, hasExtension, initialized } = useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const assistantConnected = useAssistantConnection();
	const [range, setRange] = useState<RangeKey>(requestedId ? "all" : "today");
	const [query, setQuery] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const contexts = useMemo(() => derived?.contexts ?? [], [derived]);
	// Favicons the extension captured from the tab win over the derived
	// /favicon.ico: many sites serve an SVG icon or none at all at that path.
	const favicons = useMemo(() => {
		const map = new Map<string, string>();
		for (const event of events ?? []) {
			if (!event.favicon || !event.url) continue;
			const origin = originOf(event.url);
			if (origin) map.set(origin, event.favicon);
		}
		return map;
	}, [events]);
	const shown = useMemo(() => {
		const start = range === "custom" ? dayStart(from) : rangeStart(range);
		const end = range === "custom" ? dayEnd(to) : Number.POSITIVE_INFINITY;
		return contexts.filter(
			(context) => context.endTimestamp >= start && context.endTimestamp <= end,
		);
	}, [contexts, range, from, to]);
	const limits = GRAPH_LIMITS[range === "custom" ? "all" : range];
	if (!initialized || redirecting) {
		return (
			<HomeShell>
				<GraphLoading className="min-h-110" />
			</HomeShell>
		);
	}
	const requested = requestedId
		? shown.find((context) => context.id === requestedId)
		: undefined;
	return (
		<HomeShell>
			<header className="mb-8">
				<h1 className="text-[32px] font-semibold tracking-tight sm:text-[40px]">
					What you've been up to.
				</h1>
				<p className="mt-2 max-w-xl text-[15px] leading-6 text-[#476151]">
					Tabot watched your last few hours go by and drew them out. Click
					anything below and it tells you what it noticed.
				</p>
			</header>
			<section aria-labelledby="map-heading">
				<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
					<h2
						id="map-heading"
						className="text-sm font-medium text-[#476151]"
						hidden={shown.length === 0}
					>
						Every dot is one of three things
					</h2>
					{shown.length > 0 && (
						<span className="flex flex-wrap items-center gap-3 text-xs text-[#476151]">
							<span className="flex items-center gap-1">
								<i
									aria-hidden="true"
									className="size-2 rounded-full bg-[#e8f3e8] outline outline-[#15251b]"
								/>{" "}
								a stretch of browsing
							</span>
							<span className="flex items-center gap-1">
								<i
									aria-hidden="true"
									className="size-2 rounded-full bg-[#6f9c81]"
								/>{" "}
								a place you visit
							</span>
							<span className="flex items-center gap-1">
								<i
									aria-hidden="true"
									className="size-2 rounded-full bg-[#bfff00]"
								/>{" "}
								a pattern you repeat
							</span>
						</span>
					)}
				</div>
				{contexts.length ? (
					<div className="mt-4 rounded-xl bg-[#0b1310] p-4 sm:p-6">
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<fieldset className="inline-flex rounded-lg border border-[#2f4738] bg-[#101d15] p-1">
								<legend className="sr-only">Time range</legend>
								{RANGES.map((option) => (
									<button
										key={option.id}
										type="button"
										aria-pressed={range === option.id}
										onClick={() => setRange(option.id)}
										className={`min-h-9 rounded-md px-3 text-xs font-semibold ${
											range === option.id
												? "bg-[#bfff00] text-[#15251b]"
												: "text-[#8fae95] hover:text-[#e8f3e8]"
										}`}
									>
										{option.label}
									</button>
								))}
							</fieldset>
							<div className="work-search-field ml-auto flex min-h-10 w-full items-center gap-2 rounded-lg border border-[#2f4738] bg-[#101d15] pl-3 pr-1.5 transition-colors focus-within:border-[#bfff00] sm:w-96">
								<svg
									aria-hidden="true"
									viewBox="0 0 16 16"
									className="size-3.5 shrink-0 text-[#6f8f78]"
								>
									<circle
										cx="7"
										cy="7"
										r="4.5"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.6"
									/>
									<path
										d="M10.4 10.4 14 14"
										stroke="currentColor"
										strokeWidth="1.6"
										strokeLinecap="round"
									/>
								</svg>
								<input
									type="text"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Escape") setQuery("");
									}}
									placeholder="Find a place you visit or a pattern you repeat"
									aria-label="Find on the map"
									className="min-w-0 flex-1 bg-transparent text-[13px] text-[#e8f3e8] outline-none placeholder:text-[#6f8f78]"
								/>
								{query && (
									<button
										type="button"
										onClick={() => setQuery("")}
										aria-label="Clear search"
										className="grid size-7 shrink-0 place-items-center rounded-md text-[#8fae95] hover:bg-[#1a2b21] hover:text-[#e8f3e8]"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 16 16"
											className="size-3.5"
										>
											<path
												d="M4 4l8 8M12 4l-8 8"
												stroke="currentColor"
												strokeWidth="1.6"
												strokeLinecap="round"
											/>
										</svg>
									</button>
								)}
							</div>
							{range === "custom" && (
								<div className="flex items-center gap-2 text-xs text-[#8fae95]">
									<input
										type="date"
										aria-label="From date"
										value={from}
										onChange={(event) => setFrom(event.target.value)}
										className="min-h-9 rounded-md border border-[#2f4738] bg-[#101d15] px-2 text-xs text-[#e8f3e8]"
									/>
									<span>to</span>
									<input
										type="date"
										aria-label="To date"
										value={to}
										onChange={(event) => setTo(event.target.value)}
										className="min-h-9 rounded-md border border-[#2f4738] bg-[#101d15] px-2 text-xs text-[#e8f3e8]"
									/>
								</div>
							)}
						</div>
						{shown.length ? (
							<>
								<Suspense fallback={<GraphLoading className="min-h-110" />}>
									<ContextGraph
										key={requested?.id ?? "default"}
										contexts={shown}
										memories={derived?.memories ?? []}
										limits={limits}
										favicons={favicons}
										initialSelectedId={
											requested ? `c:${requested.id}` : undefined
										}
										query={query}
										assistantConnected={assistantConnected === true}
									/>
								</Suspense>
								<p className="mt-4 text-xs text-[#8fae95]">
									{shown.length} stretch{shown.length === 1 ? "" : "es"} drawn
									here. Check below to download!.
								</p>
							</>
						) : (
							<GraphLoading
								className="min-h-110"
								title="No browsing in these dates"
								message="Try a wider date range to find your activity."
							>
								<button
									type="button"
									onClick={() => setRange("all")}
									className="min-h-11 rounded-lg bg-[#bfff00] px-4 text-sm font-semibold text-[#15251b]"
								>
									Show all time
								</button>
							</GraphLoading>
						)}
					</div>
				) : (
					<div className="mt-4">
						<GraphLoading
							className="min-h-110"
							title="Your first dot starts here"
							message="No browsing here yet. Browse normally and your day will appear here."
						/>
					</div>
				)}
			</section>
			<div className="mt-10 flex gap-6 text-sm font-semibold">
				<Link to="/activities" className="underline">
					Everything you did
				</Link>
				<Link to="/recurring-patterns" className="underline">
					Recurring patterns
				</Link>
			</div>
			<Connectors />
			<ExportDisclosure derived={derived} />
		</HomeShell>
	);
};
