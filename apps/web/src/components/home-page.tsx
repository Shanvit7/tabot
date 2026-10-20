import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Bookmark,
	Check,
	Compass,
	Flag,
	FolderHeart,
	Search,
	Sparkles,
	Trophy,
} from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { HomeShell } from "~/components/home-shell";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { useTrailbook } from "~/hooks/use-trailbook";
import { rangeStart } from "~/lib/home-data";
import { type SiteSummary, siteSummaries } from "~/lib/home-retrieval";

const SiteRow = ({
	site,
	saved,
	disabled,
	onToggle,
}: {
	site: SiteSummary;
	saved: boolean;
	disabled?: boolean;
	onToggle: (site: SiteSummary) => void;
}) => (
	<div className="flex h-[76px] min-w-0 items-center gap-3 border-b border-(--work-line) px-2">
		<span
			className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-[#e9e7f4] text-[#59418a] sm:flex"
			aria-hidden="true"
		>
			<Compass size={18} />
		</span>
		<div className="min-w-0 flex-1">
			<a
				href={site.origin}
				target="_blank"
				rel="noreferrer"
				className="block min-h-6 truncate font-medium"
			>
				{site.host}
			</a>
			<time
				dateTime={new Date(site.lastSeen).toISOString()}
				className="block truncate text-xs text-muted"
			>
				Last seen {new Date(site.lastSeen).toLocaleString()}
			</time>
		</div>
		<button
			type="button"
			className="trail-press inline-flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-(--work-raised)"
			aria-label={`${saved ? "Remove" : "Save"} ${site.host} ${saved ? "from" : "to"} saved places`}
			aria-pressed={saved}
			disabled={disabled}
			onClick={() => onToggle(site)}
		>
			<Bookmark
				size={18}
				fill={saved ? "currentColor" : "none"}
				aria-hidden="true"
			/>
		</button>
	</div>
);

const VirtualSiteList = ({
	sites,
	savedOrigins,
	disabled,
	onToggle,
}: {
	sites: SiteSummary[];
	savedOrigins: Set<string>;
	disabled: boolean;
	onToggle: (site: SiteSummary) => void;
}) => {
	// TanStack Virtual owns a mutable instance; keep React Compiler off this component.
	"use no memo";
	const scroll = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: sites.length,
		getScrollElement: () => scroll.current,
		estimateSize: () => 76,
		getItemKey: (index) => sites[index].origin,
		overscan: 5,
	});
	const rows = virtualizer.getVirtualItems();

	return (
		<section
			ref={scroll}
			className="mt-4 h-[27rem] overflow-auto rounded-2xl bg-white px-2"
			data-testid="site-archive"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: Scroll region needs keyboard scrolling.
			tabIndex={0}
			aria-label="Website activity. Scroll to explore."
		>
			<ol
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{rows.map((row) => {
					const site = sites[row.index];
					return (
						<li
							key={row.key}
							aria-setsize={sites.length}
							aria-posinset={row.index + 1}
							className="absolute left-0 top-0 w-full"
							style={{ transform: `translateY(${row.start}px)` }}
						>
							<SiteRow
								site={site}
								saved={savedOrigins.has(site.origin)}
								disabled={disabled}
								onToggle={onToggle}
							/>
						</li>
					);
				})}
			</ol>
		</section>
	);
};

export const Home = () => {
	const { events, initialized, hasExtension, degraded } = useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const { book, ready: bookReady, storageError, toggle } = useTrailbook();
	const [period, setPeriod] = useState<"today" | "7d">("7d");
	const [showSaved, setShowSaved] = useState(false);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query.trim().toLowerCase());

	const sites = useMemo(() => siteSummaries(events ?? []), [events]);
	const savedOrigins = useMemo(() => new Set(book.savedIds), [book.savedIds]);
	const savedSites = useMemo(
		() => sites.filter((site) => savedOrigins.has(site.origin)),
		[sites, savedOrigins],
	);
	const recentSites = useMemo(() => {
		const start = rangeStart(period);
		return sites.filter((site) => site.lastSeen >= start);
	}, [period, sites]);
	const listSites = useMemo(() => {
		const source = showSaved ? savedSites : recentSites;
		return source.filter((site) =>
			site.host.toLowerCase().includes(deferredQuery),
		);
	}, [deferredQuery, recentSites, savedSites, showSaved]);
	const questTarget = recentSites[0];
	const questComplete = questTarget
		? savedOrigins.has(questTarget.origin)
		: false;
	const toggleSite = (site: SiteSummary) => toggle(site.origin);

	if (!initialized || redirecting || !bookReady) {
		return <HomeShell>Loading local activity…</HomeShell>;
	}

	return (
		<HomeShell degraded={degraded}>
			<div className="trail-home trail-view">
				<header className="flex flex-wrap items-end justify-between gap-5">
					<div>
						<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
							Small quests. Good finds.
						</h1>
						<p className="mt-4 max-w-xl text-muted">
							Keep the places you want to find again. Your browsing stays on
							this device—no scores or race.
						</p>
					</div>
					<div className="flex items-center gap-3 rounded-2xl bg-[#e9e7f4] px-5 py-4 text-[#59418a]">
						<Trophy size={24} aria-hidden="true" />
						<span>
							<strong className="block text-(--work-ink)">
								{book.savedIds.length} saved
							</strong>
							<span className="text-sm">Your collection</span>
						</span>
					</div>
				</header>

				{storageError && (
					<p
						role="status"
						className="mt-5 rounded-xl bg-[#fff3d9] p-3 text-sm text-[#513800]"
					>
						{storageError === "read"
							? "Saved places could not be read from this browser. They are unchanged."
							: "This change is temporary; browser storage could not save it."}
					</p>
				)}

				<div className="mt-9 grid items-start gap-5 lg:grid-cols-3">
					<section
						aria-labelledby="rediscover-heading"
						className="rounded-2xl bg-[#edf0e8] p-5"
					>
						<h2
							id="rediscover-heading"
							className="mb-5 flex items-center gap-2 font-semibold"
						>
							<Compass size={18} aria-hidden="true" /> Rediscover
						</h2>
						{recentSites.slice(0, 2).map((site) => (
							<article
								key={site.origin}
								className="mb-4 rounded-xl bg-white p-4"
							>
								<a
									href={site.origin}
									target="_blank"
									rel="noreferrer"
									className="block truncate text-lg font-medium"
								>
									{site.host}
								</a>
								<p className="mt-2 text-xs text-muted">
									Last seen {new Date(site.lastSeen).toLocaleString()}
								</p>
								<button
									type="button"
									className="work-button work-button--quiet mt-4 w-full trail-press"
									aria-pressed={savedOrigins.has(site.origin)}
									onClick={() => toggleSite(site)}
								>
									{savedOrigins.has(site.origin) ? (
										<Check size={17} aria-hidden="true" />
									) : (
										<Bookmark size={17} aria-hidden="true" />
									)}
									{savedOrigins.has(site.origin)
										? "Saved · remove"
										: "Keep this place"}
								</button>
							</article>
						))}
						{recentSites.length === 0 && (
							<p className="rounded-xl bg-white p-5 text-sm text-muted">
								No recent websites in this period. Browse normally with Tabot
								enabled.
							</p>
						)}
					</section>

					<section
						aria-labelledby="quest-heading"
						className="rounded-2xl bg-[#e9e7f4] p-5"
					>
						<h2
							id="quest-heading"
							className="mb-5 flex items-center gap-2 font-semibold"
						>
							<Flag size={18} aria-hidden="true" /> Your little quest
						</h2>
						<div className="rounded-xl bg-[#3f315c] p-6 text-white">
							<Sparkles
								size={30}
								aria-hidden="true"
								className="text-[#e3d9ff]"
							/>
							<h3 className="mt-8 text-2xl font-medium leading-tight">
								{!questTarget
									? "Find a place worth keeping."
									: questComplete
										? "Good find, kept."
										: "Keep one good find."}
							</h3>
							<p className="mt-3 min-h-12 text-sm leading-relaxed text-[#e3d9ff]">
								{!questTarget
									? "Browse normally and save a website whenever you want to find it again."
									: questComplete
										? `${questTarget.host} is in your collection. No points to chase.`
										: `Choose ${questTarget.host} if you want an easy way back. No points to chase.`}
							</p>
							{questTarget && !questComplete && (
								<button
									type="button"
									className="work-button quest-cta mt-5 w-full trail-press"
									disabled={storageError === "read"}
									onClick={() => toggleSite(questTarget)}
								>
									<Bookmark size={17} aria-hidden="true" /> Keep{" "}
									{questTarget.host}
								</button>
							)}
						</div>
					</section>

					<section
						aria-labelledby="collection-heading"
						className="rounded-2xl border border-(--work-line) p-5"
					>
						<h2
							id="collection-heading"
							className="mb-5 flex items-center gap-2 font-semibold"
						>
							<FolderHeart size={18} aria-hidden="true" /> Saved places
							<span className="ml-auto text-sm font-normal">
								{book.savedIds.length}
							</span>
						</h2>
						<ul>
							{savedSites.slice(0, 3).map((site) => (
								<li key={site.origin}>
									<SiteRow
										site={site}
										saved
										disabled={storageError === "read"}
										onToggle={toggleSite}
									/>
								</li>
							))}
						</ul>
						{savedSites.length === 0 && (
							<p className="py-8 text-sm text-muted">
								{book.savedIds.length
									? "Saved sites are not in the activity history currently available."
									: "Your collection starts with one place worth finding again."}
							</p>
						)}
						<p className="mt-5 text-sm text-muted">
							Keep what matters. Leave the rest.
						</p>
					</section>
				</div>

				<section
					aria-labelledby="archive-heading"
					className="mt-10 border-t border-(--work-line) pt-7"
				>
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div>
							<h2 id="archive-heading" className="text-2xl font-semibold">
								{showSaved ? "Your saved places" : "Recent websites"}
							</h2>
							<p className="mt-2 text-sm text-muted">
								{showSaved
									? "Places you chose to keep."
									: "Website names and last-seen times only."}
							</p>
						</div>
						<label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-(--work-line) bg-white px-3 sm:w-72">
							<Search size={17} aria-hidden="true" />
							<span className="sr-only">Search websites</span>
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								type="search"
								placeholder="Find a website…"
								className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
							/>
						</label>
					</div>
					<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
						<nav aria-label="Activity list" className="flex gap-4 text-sm">
							<button
								type="button"
								aria-pressed={!showSaved}
								className="min-h-11 underline-offset-4 aria-pressed:underline"
								onClick={() => setShowSaved(false)}
							>
								Recent
							</button>
							<button
								type="button"
								aria-pressed={showSaved}
								className="min-h-11 underline-offset-4 aria-pressed:underline"
								onClick={() => setShowSaved(true)}
							>
								Saved places
							</button>
						</nav>
						{!showSaved && (
							<fieldset className="flex rounded-xl bg-[#edf0e8] p-1 text-sm">
								<legend className="sr-only">Activity period</legend>
								{(["today", "7d"] as const).map((value) => (
									<button
										type="button"
										key={value}
										aria-pressed={period === value}
										className="min-h-11 rounded-lg px-4 aria-pressed:bg-white aria-pressed:font-medium"
										onClick={() => setPeriod(value)}
									>
										{value === "today" ? "Today" : "This week"}
									</button>
								))}
							</fieldset>
						)}
					</div>
					{listSites.length ? (
						<VirtualSiteList
							sites={listSites}
							savedOrigins={savedOrigins}
							disabled={storageError === "read"}
							onToggle={toggleSite}
						/>
					) : (
						<p
							role="status"
							className="mt-4 rounded-2xl bg-(--work-surface) p-8 text-sm text-muted"
						>
							{deferredQuery
								? "No websites match your search."
								: showSaved
									? "No saved places yet. Keep a website you want to find again."
									: "No recent websites in this period."}
						</p>
					)}
				</section>
				<p role="status" aria-live="polite" className="sr-only">
					{storageError === "write"
						? "Saved places change could not be saved."
						: ""}
				</p>
			</div>
		</HomeShell>
	);
};
