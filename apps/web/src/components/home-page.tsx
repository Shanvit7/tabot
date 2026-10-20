import { chatGptContextUrl, type Derived } from "@tabot/shared";
import { CatchBoundary, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUpRight,
	Bookmark,
	BookmarkCheck,
	Check,
	ChevronDown,
	Compass,
	MousePointer2,
	Search,
	Shuffle,
	X,
} from "lucide-react";
import {
	lazy,
	Suspense,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Connectors } from "~/components/connectors";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import { SessionDate } from "~/components/context-graph/session-date";
import { SessionTime } from "~/components/context-graph/session-time";
import { ExportDisclosure } from "~/components/export-disclosure";
import { HomeShell } from "~/components/home-shell";
import { GraphLoading } from "~/components/ui/work-panels";
import { useExtensionRedirect } from "~/hooks/use-extension-redirect";
import { useHomeData } from "~/hooks/use-home-data";
import { useTrailbook } from "~/hooks/use-trailbook";
import { originOf } from "~/lib/context-graph-data";
import {
	type ActivitySummary,
	activitySummaries,
	findActivities,
} from "~/lib/home-retrieval";
import { useAssistantConnection } from "~/providers/assistant-connection";

const HomeConnections = lazy(() =>
	import("~/components/home-connections").then((module) => ({
		default: module.HomeConnections,
	})),
);

const ActivityWhen = ({ activity }: { activity: ActivitySummary }) => (
	<p className="flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-(--work-muted)">
		<SessionDate timestamp={activity.startTimestamp} />
		<span>
			<SessionTime
				timestamp={activity.startTimestamp}
				day={activity.startTimestamp}
			/>
			{" – "}
			<SessionTime
				timestamp={activity.endTimestamp}
				day={activity.startTimestamp}
			/>
		</span>
	</p>
);

const SiteIcon = ({
	origin,
	favicon,
}: {
	origin: string;
	favicon?: string;
}) => {
	const [failed, setFailed] = useState(false);
	return (
		<span
			aria-hidden="true"
			className="grid size-11 shrink-0 place-items-center rounded-xl bg-(--work-raised) text-lg font-semibold text-(--work-ink)"
		>
			{favicon && !failed ? (
				<img
					src={favicon}
					alt=""
					className="size-6 object-contain"
					onError={() => setFailed(true)}
				/>
			) : (
				new URL(origin).hostname
					.replace(/^www\./, "")
					.slice(0, 1)
					.toUpperCase()
			)}
		</span>
	);
};

const SaveTrail = ({
	activity,
	saved,
	disabled,
	onSave,
}: {
	activity: ActivitySummary;
	saved: boolean;
	disabled: boolean;
	onSave: (activity: ActivitySummary) => void;
}) => (
	<button
		type="button"
		disabled={disabled}
		aria-pressed={saved}
		aria-label={`${saved ? "Remove" : "Save"} ${activity.title}${saved ? " from saved trails" : " to saved trails"}`}
		onClick={() => onSave(activity)}
		className={`trail-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${saved ? "bg-(--work-accent) text-(--trail-on-accent)" : "border border-(--work-line) bg-(--work-surface) text-(--work-ink) hover:bg-(--work-raised)"}`}
	>
		{saved ? (
			<BookmarkCheck aria-hidden="true" className="trail-stamp size-4" />
		) : (
			<Bookmark aria-hidden="true" className="size-4" />
		)}
		{saved ? "Saved" : "Save trail"}
	</button>
);

const TrailSites = ({
	activity,
	favicons,
}: {
	activity: ActivitySummary;
	favicons: Map<string, string>;
}) => (
	<ul aria-label="Websites in this activity" className="flex flex-wrap gap-2">
		{activity.sites.slice(0, 4).map((site) => (
			<li
				key={site.origin}
				className="flex items-center gap-2 rounded-xl bg-(--work-surface) py-2 pl-2 pr-3 text-sm font-medium"
			>
				<SiteIcon origin={site.origin} favicon={favicons.get(site.origin)} />
				<span className="max-w-36 truncate">{site.name}</span>
			</li>
		))}
		{activity.sites.length > 4 && (
			<li className="self-center px-2 text-sm text-(--work-muted)">
				+{activity.sites.length - 4} websites
			</li>
		)}
	</ul>
);

type ActivityDetailProps = {
	selected: ActivitySummary | undefined;
	heading: React.RefObject<HTMLHeadingElement | null>;
	storageWarning: React.ReactNode;
	feedback: React.ReactNode;
	searching: boolean;
	scope: "recent" | "saved";
	favicons: Map<string, string>;
	saved: (id: string) => boolean;
	savingDisabled: boolean;
	saveTrail: (activity: ActivitySummary) => void;
	hasAssistant: boolean;
	assistantConnected: boolean;
	mark: (action: "viewed" | "followed") => void;
};

const ActivityDetail = ({
	selected,
	heading,
	storageWarning,
	feedback,
	searching,
	scope,
	favicons,
	saved,
	savingDisabled,
	saveTrail,
	hasAssistant,
	assistantConnected,
	mark,
}: ActivityDetailProps) => (
	<div className="trail-home trail-view">
		{storageWarning}
		<Link
			to="/home"
			search={{ context: undefined }}
			viewTransition
			className="trail-press mb-6 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-(--work-muted) hover:bg-(--work-surface)"
		>
			<ArrowLeft aria-hidden="true" className="size-4" />
			{searching
				? "Back to results"
				: scope === "saved"
					? "Back to saved trails"
					: "Back to your trails"}
		</Link>
		{selected ? (
			<article>
				<div className="trail-dark rounded-3xl bg-(--trail-ground) p-6 sm:p-9">
					<div className="flex flex-wrap items-start justify-between gap-5">
						<div className="min-w-0">
							<h1
								ref={heading}
								tabIndex={-1}
								className="wrap-break-word text-3xl font-semibold tracking-tight sm:text-4xl"
							>
								{selected.title}
							</h1>
							<div className="mt-3">
								<ActivityWhen activity={selected} />
							</div>
						</div>
						<SaveTrail
							activity={selected}
							saved={saved(selected.id)}
							disabled={savingDisabled}
							onSave={saveTrail}
						/>
					</div>
					<div className="mt-7">
						<TrailSites activity={selected} favicons={favicons} />
					</div>
				</div>
				<section
					aria-labelledby="activity-sites-heading"
					className="mt-9 max-w-3xl"
				>
					<h2 id="activity-sites-heading" className="text-xl font-semibold">
						One click back to a familiar place.
					</h2>
					<p className="mt-2 text-sm leading-6 text-(--work-muted)">
						These links open website homepages, not your previously visited
						pages.
					</p>
					{selected.sites.length === 0 && (
						<p className="mt-5 text-sm text-(--work-muted)">
							No website links available for this activity.
						</p>
					)}
					<ul className="mt-5 divide-y divide-(--work-line)">
						{selected.sites.map((site) => (
							<li
								key={site.origin}
								className="flex flex-wrap items-center gap-3 py-4 sm:gap-4"
							>
								<SiteIcon
									origin={site.origin}
									favicon={favicons.get(site.origin)}
								/>
								<div className="min-w-0 flex-1">
									<h3 className="wrap-break-word text-base font-semibold">
										{site.name}
									</h3>
									<p className="break-all text-sm text-(--work-muted)">
										{site.host}
									</p>
								</div>
								<a
									href={site.origin}
									target="_blank"
									rel="noopener noreferrer"
									onClick={() => mark("followed")}
									aria-label={`Open ${site.host} in a new tab`}
									className="trail-press inline-flex min-h-11 items-center gap-2 rounded-full bg-(--work-surface) px-4 text-sm font-semibold hover:bg-(--work-raised)"
								>
									Open website
									<ArrowUpRight aria-hidden="true" className="size-4" />
								</a>
							</li>
						))}
					</ul>
				</section>
				{hasAssistant && (
					<div className="mt-8 max-w-sm border-t border-(--work-line) pt-5">
						<p className="text-sm text-(--work-muted)">
							Want help looking back at this activity?
						</p>
						<AskChatGpt
							href={chatGptContextUrl(selected.id)}
							connected={assistantConnected}
						/>
					</div>
				)}
			</article>
		) : (
			<div className="max-w-xl py-8">
				<h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
					This activity is no longer available
				</h1>
				<p className="mt-3 leading-7 text-(--work-muted)">
					It may have been removed from this device. Go back to your trails to
					find another activity.
				</p>
			</div>
		)}
		{feedback}
	</div>
);

type HomeAsideProps = {
	completed: number;
	steps: { label: string; done: boolean; icon: typeof Compass }[];
	discovery: ActivitySummary | undefined;
	discoveryPoolLength: number;
	setDiscoveryCursor: React.Dispatch<React.SetStateAction<number>>;
	favicons: Map<string, string>;
};

const HomeAside = ({
	completed,
	steps,
	discovery,
	discoveryPoolLength,
	setDiscoveryCursor,
	favicons,
}: HomeAsideProps) => (
	<aside aria-label="Rediscover and collect" className="space-y-5">
		<section
			aria-labelledby="comeback-heading"
			className="rounded-2xl border border-(--work-line) p-6"
		>
			<div className="mb-4 flex items-center justify-between">
				<span
					className={`grid size-11 place-items-center rounded-full ${completed === 3 ? "bg-(--work-accent)" : "bg-(--work-raised)"}`}
				>
					{completed === 3 ? (
						<Check aria-hidden="true" className="trail-stamp size-5" />
					) : (
						<Compass aria-hidden="true" className="size-5" />
					)}
				</span>
				<span className="text-sm font-medium text-(--work-muted)">
					{completed} of 3 steps
				</span>
			</div>
			<h2 id="comeback-heading" className="text-xl font-semibold">
				{completed === 3 ? "That’s a comeback." : "Make your first comeback."}
			</h2>
			<p className="mt-2 text-sm leading-6 text-(--work-muted)">
				{completed === 3
					? "A familiar place, found again. Your collection is ready for the next time."
					: "A tiny quest: find a trail, follow a link, and keep something worth returning to."}
			</p>
			<progress
				aria-label="First comeback steps completed"
				max={3}
				value={completed}
				className="trail-progress mt-5 h-2 w-full"
			/>
			<ol className="mt-4 space-y-3">
				{steps.map(({ label, done, icon: Icon }) => (
					<li
						key={label}
						className={`flex items-center gap-3 text-sm ${done ? "font-medium" : "text-(--work-muted)"}`}
					>
						<span
							className={`grid size-7 shrink-0 place-items-center rounded-full ${done ? "bg-(--work-accent) text-(--trail-on-accent)" : "bg-(--work-surface)"}`}
						>
							{done ? (
								<Check aria-hidden="true" className="trail-stamp size-3.5" />
							) : (
								<Icon aria-hidden="true" className="size-3.5" />
							)}
						</span>
						{label}
						<span className="sr-only">
							{done ? ", completed" : ", not completed"}
						</span>
					</li>
				))}
			</ol>
		</section>
		{discovery && (
			<section
				aria-labelledby="rediscover-heading"
				className="overflow-hidden rounded-2xl bg-(--work-surface) p-6"
			>
				<div className="flex items-center justify-between gap-2">
					<h2 id="rediscover-heading" className="text-lg font-semibold">
						A little time travel
					</h2>
					<Shuffle aria-hidden="true" className="size-4 text-(--work-muted)" />
				</div>
				<p className="mt-2 text-sm leading-6 text-(--work-muted)">
					Something from earlier. Still familiar?
				</p>
				<div key={discovery.id} className="trail-discovery mt-5">
					<div className="mb-4 flex gap-2">
						{discovery.sites.slice(0, 3).map((site) => (
							<SiteIcon
								key={site.origin}
								origin={site.origin}
								favicon={favicons.get(site.origin)}
							/>
						))}
					</div>
					<h3 className="wrap-break-word text-lg font-semibold">
						{discovery.title}
					</h3>
					<div className="mt-2">
						<ActivityWhen activity={discovery} />
					</div>
					<Link
						to="/home"
						search={{ context: discovery.id }}
						viewTransition
						className="trail-press mt-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold underline"
					>
						Rediscover trail
						<ArrowUpRight aria-hidden="true" className="size-4" />
					</Link>
				</div>
				{discoveryPoolLength > 1 && (
					<button
						type="button"
						onClick={() => setDiscoveryCursor((cursor) => cursor + 1)}
						className="trail-press mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-(--work-muted) hover:bg-(--work-raised)"
					>
						<Shuffle aria-hidden="true" className="size-4" />
						Another trail
					</button>
				)}
			</section>
		)}
	</aside>
);

type ActivityEmptyStateProps = {
	matches: ActivitySummary[];
	searching: boolean;
	scope: "recent" | "saved";
	setScope: React.Dispatch<React.SetStateAction<"recent" | "saved">>;
	clearSearch: () => void;
};

const ActivityEmptyState = ({
	matches,
	searching,
	scope,
	setScope,
	clearSearch,
}: ActivityEmptyStateProps) => (
	<>
		{matches.length === 0 &&
			matches.length === 0 &&
			(searching || scope === "saved" ? (
				<div className="rounded-2xl bg-(--work-surface) p-7">
					<Bookmark
						aria-hidden="true"
						className="mb-5 size-7 text-(--work-muted)"
					/>
					<h3 className="text-xl font-semibold">
						{searching
							? "No trail with that website. Yet."
							: "Give a good trail a home."}
					</h3>
					<p className="mt-3 max-w-lg text-base leading-7 text-(--work-muted)">
						{searching
							? "Try part of a website name, or clear your search to see your trails."
							: "Save an activity you want to come back to. It’ll be waiting here, without another search."}
					</p>
					<button
						type="button"
						onClick={() => {
							setScope("recent");
							clearSearch();
						}}
						className="trail-press mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-(--work-ink) px-5 text-sm font-semibold text-white"
					>
						{searching ? "Clear search" : "Explore recent activity"}
						<ArrowRight aria-hidden="true" className="size-4" />
					</button>
				</div>
			) : (
				<GraphLoading
					className="min-h-110"
					title="Your first dot starts here"
					message="Browse normally with Tabot enabled. Your first browsing trail will be waiting here."
				/>
			))}
	</>
);

type ActivityResultsProps = {
	query: string;
	deferredQuery: string;
	searching: boolean;
	scope: "recent" | "saved";
	matches: ActivitySummary[];
	visibleCount: number;
	setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
	latest: ActivitySummary | undefined;
	showLatest: boolean;
	rows: ActivitySummary[];
	collectionHeading: React.RefObject<HTMLHeadingElement | null>;
	favicons: Map<string, string>;
	saved: (id: string) => boolean;
	savingDisabled: boolean;
	saveTrail: (activity: ActivitySummary) => void;
	book: { savedIds: string[] };
	savedActivities: ActivitySummary[];
	setScope: React.Dispatch<React.SetStateAction<"recent" | "saved">>;
	clearSearch: () => void;
};

const ActivityResults = ({
	query,
	deferredQuery,
	searching,
	scope,
	matches,
	visibleCount,
	setVisibleCount,
	latest,
	showLatest,
	rows,
	collectionHeading,
	favicons,
	saved,
	savingDisabled,
	saveTrail,
	book,
	savedActivities,
	setScope,
	clearSearch,
}: ActivityResultsProps) => (
	<section
		id="activity-results"
		aria-labelledby="recent-activity-heading"
		aria-busy={query !== deferredQuery}
		className="min-w-0"
	>
		<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
			<h2
				ref={collectionHeading}
				tabIndex={-1}
				id="recent-activity-heading"
				className="text-xl font-semibold"
			>
				{searching
					? "What turned up"
					: scope === "saved"
						? "Your saved trails"
						: "Back to it"}
			</h2>
			<fieldset
				aria-label="Choose activity collection"
				className="inline-flex rounded-full bg-(--work-raised) p-1"
			>
				{(["recent", "saved"] as const).map((value) => (
					<button
						key={value}
						type="button"
						aria-pressed={scope === value}
						aria-controls="activity-results"
						onClick={() => {
							setScope(value);
							setVisibleCount(value === "saved" ? 8 : 4);
						}}
						className={`trail-press min-h-11 rounded-full px-4 text-sm font-medium ${scope === value ? "bg-white shadow-sm" : "text-(--work-muted) hover:text-(--work-ink)"}`}
						data-selected={scope === value}
					>
						{value === "recent" ? "Recent" : "Saved"}
					</button>
				))}
			</fieldset>
		</div>
		<p role="status" className="sr-only">
			{searching
				? matches.length
					? "Matching activity found."
					: "No matching activity."
				: ""}
		</p>
		{showLatest && latest && (
			<article className="trail-dark overflow-hidden rounded-3xl bg-(--trail-ground) p-6 sm:p-7">
				<div className="flex items-center justify-between gap-3">
					<p className="text-sm text-(--work-muted)">
						Your most recent activity
					</p>
					<Compass aria-hidden="true" className="size-5 text-(--work-accent)" />
				</div>
				<h3 className="mt-5 wrap-break-word text-[30px] font-semibold leading-tight tracking-tight sm:text-[34px]">
					{latest.title}
				</h3>
				<div className="mt-3">
					<ActivityWhen activity={latest} />
				</div>
				<div className="my-6">
					<TrailSites activity={latest} favicons={favicons} />
				</div>
				<div className="flex flex-wrap items-center gap-3 border-t border-(--work-line) pt-5">
					<Link
						to="/home"
						search={{ context: latest.id }}
						viewTransition
						className="trail-press group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-(--work-accent) px-5 text-sm font-semibold text-(--trail-on-accent)"
					>
						Continue trail
						<ArrowRight
							aria-hidden="true"
							className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
						/>
					</Link>
					<SaveTrail
						activity={latest}
						saved={saved(latest.id)}
						disabled={savingDisabled}
						onSave={saveTrail}
					/>
				</div>
			</article>
		)}
		{rows.length > 0 && (
			<ul className="mt-3 divide-y divide-(--work-line)">
				{rows.map((activity) => (
					<li key={activity.id} className="flex items-center gap-2 py-1">
						<Link
							to="/home"
							search={{ context: activity.id }}
							viewTransition
							className="trail-press group flex min-h-24 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-4 hover:bg-(--work-surface)"
						>
							<SiteIcon
								origin={activity.sites[0].origin}
								favicon={favicons.get(activity.sites[0].origin)}
							/>
							<div className="min-w-0 flex-1">
								<h3 className="wrap-break-word text-base font-semibold group-hover:underline">
									{activity.title}
								</h3>
								<p className="mt-1 wrap-break-word text-sm leading-6 text-(--work-muted)">
									{activity.sites
										.slice(0, 3)
										.map((site) => site.host)
										.join(" · ")}
								</p>
								<ActivityWhen activity={activity} />
							</div>
							<ArrowRight
								aria-hidden="true"
								className="size-4 shrink-0 text-(--work-muted) transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
							/>
						</Link>
						{scope === "saved" && (
							<button
								type="button"
								onClick={() => saveTrail(activity)}
								aria-label={`Remove ${activity.title} from saved trails`}
								className="trail-press grid size-11 shrink-0 place-items-center rounded-full hover:bg-(--work-raised)"
							>
								<BookmarkCheck aria-hidden="true" className="size-4" />
							</button>
						)}
					</li>
				))}
			</ul>
		)}
		<ActivityEmptyState
			matches={matches}
			searching={searching}
			scope={scope}
			setScope={setScope}
			clearSearch={clearSearch}
		/>
		{matches.length > visibleCount && (
			<button
				type="button"
				onClick={() => setVisibleCount((count) => count + 8)}
				className="trail-press mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold hover:bg-(--work-surface)"
			>
				{searching ? "Show more results" : "Show earlier activity"}
				<ChevronDown aria-hidden="true" className="size-4" />
			</button>
		)}
		{scope === "saved" && (
			<p className="mt-5 text-sm leading-6 text-(--work-muted)">
				Saved on this browser. Only activity IDs are kept; saving doesn’t
				preserve the original pages or protect activity from deletion.
				{book.savedIds.length > savedActivities.length &&
					" Some saved trails aren’t in the current activity snapshot."}
			</p>
		)}
	</section>
);

// Real aggregate UI; sample data belongs only in the local verification harness.
export const ActivityHome = ({
	derived,
	favicons,
	requestedId,
	assistantConnected,
	hasAssistant = assistantConnected,
}: {
	derived: Derived | null;
	favicons: Map<string, string>;
	requestedId: string | null;
	assistantConnected: boolean;
	hasAssistant?: boolean;
}) => {
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [scope, setScope] = useState<"recent" | "saved">("recent");
	const [visibleCount, setVisibleCount] = useState(4);
	const [exploring, setExploring] = useState(false);
	const [discoveryCursor, setDiscoveryCursor] = useState(0);
	const [notice, setNotice] = useState("");
	const heading = useRef<HTMLHeadingElement>(null);
	const searchInput = useRef<HTMLInputElement>(null);
	const collectionHeading = useRef<HTMLHeadingElement>(null);
	const { book, ready, storageError, mark, toggle } = useTrailbook();
	const recorded = useMemo(
		() => activitySummaries(derived?.contexts ?? []),
		[derived],
	);
	const activities = useMemo(
		() => recorded.filter((activity) => activity.sites.length > 0),
		[recorded],
	);
	const activitiesById = useMemo(
		() => new Map(activities.map((activity) => [activity.id, activity])),
		[activities],
	);
	const savedActivities = useMemo(
		() =>
			book.savedIds.flatMap((id) => {
				const activity = activitiesById.get(id);
				return activity ? [activity] : [];
			}),
		[activitiesById, book.savedIds],
	);
	const matches = useMemo(
		() =>
			findActivities(
				scope === "saved" ? savedActivities : activities,
				deferredQuery,
			),
		[activities, savedActivities, scope, deferredQuery],
	);
	const searching = deferredQuery.trim().length > 0;
	const selected = recorded.find((activity) => activity.id === requestedId);
	const previousRequestedId = useRef(requestedId);
	const discoveryPool = activities.slice(1);
	const discovery = discoveryPool[discoveryCursor % discoveryPool.length];
	const saved = (id: string) => book.savedIds.includes(id);
	const savingDisabled = !ready || storageError === "read";
	const steps = [
		{ label: "Explore a trail", done: book.viewed, icon: Compass },
		{ label: "Open a website", done: book.followed, icon: MousePointer2 },
		{ label: "Save a trail", done: book.savedIds.length > 0, icon: Bookmark },
	];
	const completed = steps.filter((step) => step.done).length;
	const clearSearch = () => {
		setQuery("");
		setVisibleCount(4);
		searchInput.current?.focus();
	};
	const saveTrail = (activity: ActivitySummary) => {
		const next = toggle(activity.id);
		if (next)
			setNotice(
				next.savedIds.includes(activity.id)
					? `${activity.title} saved. Find it in Saved.`
					: `${activity.title} removed from Saved.`,
			);
	};

	useEffect(() => {
		if (requestedId !== null) heading.current?.focus();
		else if (previousRequestedId.current !== null) searchInput.current?.focus();
		previousRequestedId.current = requestedId;
	}, [requestedId]);
	useEffect(() => {
		if (selected && ready) mark("viewed");
	}, [selected, ready, mark]);

	const storageWarning = storageError && (
		<p
			role="status"
			className="mb-5 rounded-xl border border-(--work-line) bg-(--work-surface) p-4 text-sm leading-6"
		>
			{storageError === "read"
				? "Your saved trails couldn’t be read. Reload before changing your collection; existing saves have not been overwritten."
				: "Collection changes are available for this session only. Browser storage couldn’t save them for your next visit."}
		</p>
	);
	const feedback = (
		<div
			className="pointer-events-none fixed inset-x-4 bottom-5 z-50 mx-auto max-w-xl"
			role="status"
			aria-atomic="true"
		>
			{notice && (
				<div
					key={notice}
					className="trail-reward pointer-events-auto flex items-center gap-3 rounded-2xl bg-(--trail-ground) p-4 text-sm leading-6 text-white shadow-xl"
				>
					<Check
						aria-hidden="true"
						className="size-5 shrink-0 text-(--work-accent)"
					/>
					<p className="flex-1">{notice}</p>
					<button
						type="button"
						onClick={() => setNotice("")}
						aria-label="Dismiss saved trail message"
						className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
					>
						<X aria-hidden="true" className="size-4" />
					</button>
				</div>
			)}
		</div>
	);

	if (requestedId !== null)
		return (
			<ActivityDetail
				selected={selected}
				heading={heading}
				storageWarning={storageWarning}
				feedback={feedback}
				searching={searching}
				scope={scope}
				favicons={favicons}
				saved={saved}
				savingDisabled={savingDisabled}
				saveTrail={saveTrail}
				hasAssistant={hasAssistant}
				assistantConnected={assistantConnected}
				mark={mark}
			/>
		);

	const [latest, ...earlier] = matches.slice(0, visibleCount);
	const showLatest = !searching && scope === "recent" && latest;
	const rows = showLatest ? earlier : matches.slice(0, visibleCount);
	return (
		<div className="trail-home trail-view">
			{storageWarning}
			<header className="flex flex-wrap items-start justify-between gap-5">
				<div>
					<h1 className="text-balance text-[34px] font-semibold leading-tight tracking-tight sm:text-[46px]">
						Find your way back.
					</h1>
					<p className="mt-3 max-w-xl text-base leading-7 text-(--work-muted)">
						Pick up a browsing trail. Rediscover a detour. Keep the good ones.
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						setScope("saved");
						setQuery("");
						setVisibleCount(8);
						collectionHeading.current?.focus();
					}}
					className="trail-press inline-flex min-h-11 items-center gap-2 rounded-full border border-(--work-line) bg-white px-4 text-sm font-semibold hover:bg-(--work-surface)"
				>
					<Bookmark aria-hidden="true" className="size-4" />
					Your collection
					<span className="grid min-w-6 place-items-center rounded-full bg-(--work-raised) px-1.5 text-xs leading-6">
						{ready ? book.savedIds.length : "–"}
					</span>
				</button>
			</header>
			<section aria-labelledby="find-activity-heading" className="mt-7">
				<h2 id="find-activity-heading" className="text-sm font-medium">
					<label htmlFor="activity-search">Search your trails</label>
				</h2>
				<div className="work-search-field mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-(--work-line) bg-(--work-surface) pl-5 pr-2 transition-colors focus-within:border-(--work-ink) focus-within:bg-white focus-within:ring-2 focus-within:ring-(--work-accent)">
					<Search
						aria-hidden="true"
						className="size-5 shrink-0 text-(--work-muted)"
					/>
					<input
						ref={searchInput}
						id="activity-search"
						type="search"
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setVisibleCount(event.target.value.trim() ? 8 : 4);
						}}
						onKeyDown={(event) => {
							if (event.key === "Escape") clearSearch();
						}}
						placeholder="Find something from earlier…"
						aria-describedby="activity-search-help"
						aria-controls="activity-results"
						className="min-h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-(--work-muted) [&::-webkit-search-cancel-button]:hidden"
					/>
					{query && (
						<button
							type="button"
							onClick={clearSearch}
							aria-label="Clear search"
							className="trail-press grid size-11 shrink-0 place-items-center rounded-full hover:bg-(--work-raised)"
						>
							<X aria-hidden="true" className="size-4" />
						</button>
					)}
				</div>
				<p
					id="activity-search-help"
					className="mt-2 text-sm leading-6 text-(--work-muted)"
				>
					Search by website name, across all your activity. Everything stays on
					this device.
				</p>
			</section>
			<div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
				<ActivityResults
					query={query}
					deferredQuery={deferredQuery}
					searching={searching}
					scope={scope}
					matches={matches}
					visibleCount={visibleCount}
					setVisibleCount={setVisibleCount}
					latest={latest}
					showLatest={Boolean(showLatest)}
					rows={rows}
					collectionHeading={collectionHeading}
					favicons={favicons}
					saved={saved}
					savingDisabled={savingDisabled}
					saveTrail={saveTrail}
					book={book}
					savedActivities={savedActivities}
					setScope={setScope}
					clearSearch={clearSearch}
				/>
				<HomeAside
					completed={completed}
					steps={steps}
					discovery={discovery}
					discoveryPoolLength={discoveryPool.length}
					setDiscoveryCursor={setDiscoveryCursor}
					favicons={favicons}
				/>
			</div>
			{activities.length > 0 && derived && (
				<details
					open={exploring}
					onToggle={(event) => setExploring(event.currentTarget.open)}
					className="group mt-10 border-t border-(--work-line) pt-5"
				>
					<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl py-2 [&::-webkit-details-marker]:hidden">
						<span>
							<span className="block text-base font-semibold">
								Explore connections
							</span>
							<span className="mt-1 block text-sm leading-6 text-(--work-muted)">
								Zoom out and see how your websites and recurring patterns
								connect.
							</span>
						</span>
						<ChevronDown
							aria-hidden="true"
							className="size-5 shrink-0 transition-transform group-open:rotate-180"
						/>
					</summary>
					{exploring && (
						<CatchBoundary
							getResetKey={() => "home-connections"}
							errorComponent={() => (
								<p
									role="alert"
									className="py-6 text-sm leading-6 text-(--work-muted)"
								>
									Connections couldn’t load. Your trails and search still work.{" "}
									<button
										type="button"
										onClick={() => window.location.reload()}
										className="min-h-11 px-2 font-semibold underline"
									>
										Reload page
									</button>
								</p>
							)}
						>
							<Suspense fallback={<GraphLoading className="min-h-110" />}>
								<HomeConnections
									derived={derived}
									favicons={favicons}
									assistantConnected={assistantConnected}
								/>
							</Suspense>
						</CatchBoundary>
					)}
				</details>
			)}
			<Connectors />
			<ExportDisclosure derived={derived} />
			{feedback}
		</div>
	);
};

export const Home = ({ requestedId }: { requestedId: string | null }) => {
	const { derived, events, hasExtension, initialized, degraded } =
		useHomeData();
	const redirecting = useExtensionRedirect({ hasExtension, initialized });
	const assistantConnected = useAssistantConnection() === true;
	const claudeConnected = useAssistantConnection("claude") === true;
	const favicons = useMemo(() => {
		const map = new Map<string, string>();
		for (const event of events ?? []) {
			if (!event.favicon || !event.url) continue;
			const origin = originOf(event.url);
			if (origin) map.set(origin, event.favicon);
		}
		return map;
	}, [events]);
	if (!initialized || redirecting)
		return (
			<HomeShell>
				<GraphLoading className="min-h-110" />
			</HomeShell>
		);
	return (
		<HomeShell degraded={degraded}>
			<ActivityHome
				derived={derived}
				favicons={favicons}
				requestedId={requestedId}
				assistantConnected={assistantConnected}
				hasAssistant={assistantConnected || claudeConnected}
			/>
		</HomeShell>
	);
};
