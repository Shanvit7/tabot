import {
	type DashboardPagePreview,
	type HistorySearchResult,
	parseRecentSearchQuestion,
	type SearchAvailability,
} from "@tabot/shared/dashboard";
import { Debouncer } from "@tanstack/pacer";
import { ArrowUpRight, LoaderCircle, Search, X } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Counter from "~/../components/animata/text/counter";
import {
	readHistoryCounts,
	readPagePreview,
	searchRetainedPages,
} from "~/lib/history";
import { faviconOf } from "~/lib/site-format";
import { cn } from "~/lib/utils";

const SECOND_MS = 1_000;
const formatTwoDigits = (value: number) =>
	String(Math.floor(value)).padStart(2, "0");
const dateLabel = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
const TrackingDuration = ({
	firstEventTimestamp,
}: {
	firstEventTimestamp: number;
}) => {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), SECOND_MS);
		return () => window.clearInterval(timer);
	}, []);
	const elapsedSeconds = Math.max(
		0,
		Math.floor((now - firstEventTimestamp) / SECOND_MS),
	);
	const hours = Math.floor(elapsedSeconds / 3_600);
	const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
	const seconds = elapsedSeconds % 60;
	const unitClass =
		"text-base font-semibold tabular-nums leading-none text-foreground";
	return (
		<p className="flex items-baseline gap-1.5 whitespace-nowrap text-sm">
			<span className="text-xs text-muted-foreground">Tracking for</span>
			<span className="flex items-baseline gap-1">
				<Counter targetValue={hours} className={unitClass} />
				<span>h</span>
				<Counter
					format={formatTwoDigits}
					targetValue={minutes}
					className={unitClass}
				/>
				<span>m</span>
				<Counter
					format={formatTwoDigits}
					targetValue={seconds}
					className={unitClass}
				/>
				<span>s</span>
			</span>
		</p>
	);
};
const urlLabel = (page: HistorySearchResult) => {
	const path = new URL(page.url).pathname.split("/").filter(Boolean).at(-1);
	if (!path) return page.host;
	try {
		return decodeURIComponent(path).replaceAll("-", " ").replaceAll("_", " ");
	} catch {
		return path;
	}
};
const messageOf = (error: unknown) =>
	error instanceof Error
		? error.message
		: "Local history could not be read. Try again.";
const actionClass =
	"inline-flex min-h-11 items-center gap-2 rounded text-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

const PageFavicon = ({
	page,
}: {
	page: Pick<HistorySearchResult, "url" | "host" | "favicon">;
}) => {
	const [failed, setFailed] = useState(false);
	const fallback = faviconOf(new URL(page.url).origin);
	const preferred = page.favicon ?? fallback;
	const src =
		failed && preferred !== fallback
			? fallback
			: failed
				? undefined
				: preferred;

	return (
		<span
			aria-hidden="true"
			className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1"
		>
			{failed || !src ? (
				<span className="font-display text-lg">
					{page.host[0].toUpperCase()}
				</span>
			) : (
				<img
					src={src}
					alt=""
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					className="size-full object-contain"
					onError={() => setFailed(true)}
				/>
			)}
		</span>
	);
};

const MatchedText = ({ text, terms }: { text: string; terms: string[] }) => (
	<>
		{[...text.matchAll(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu)].map((match) =>
			terms.includes(match[0].normalize("NFKC").toLowerCase()) ? (
				<mark
					key={match.index}
					className="rounded-sm bg-primary/35 text-foreground"
				>
					{match[0]}
				</mark>
			) : (
				match[0]
			),
		)}
	</>
);

const PageReader = ({ page }: { page: HistorySearchResult }) => {
	// Search citations put the excerpt's source first, not necessarily the newest capture.
	const [sourceId, setSourceId] = useState(
		page.sources.find((source) => source.kind === "page")?.id,
	);
	const [preview, setPreview] = useState<DashboardPagePreview | null>(null);
	const [loading, setLoading] = useState(Boolean(sourceId));
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly reloads the same capture.
	useEffect(() => {
		if (!sourceId) return;
		let active = true;
		setLoading(true);
		setPreview(null);
		setError("");
		void readPagePreview(sourceId, page.url)
			.then((value) => {
				if (active) {
					setPreview(value);
					setLoading(false);
				}
			})
			.catch((reason: unknown) => {
				if (active) {
					setError(messageOf(reason));
					setLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [sourceId, page.url, retry]);
	const pageSources = page.sources.filter((source) => source.kind === "page");
	const selectedSource = pageSources.find((source) => source.id === sourceId);
	const text =
		preview?.segments ?? (page.pageExcerptAvailable ? [page.excerpt] : []);
	const uniqueText = [...new Set(text)].join("\n\n");
	return (
		<article aria-label="Selected page" className="min-w-0 md:col-span-3">
			<header className="border-b border-border pb-4">
				<h2 className="wrap-break-word font-heading text-lg font-semibold tracking-tight">
					{urlLabel(page)}
				</h2>
				<p className="mt-1 break-all text-sm text-muted-foreground">
					{page.host} ·{" "}
					{preview
						? preview.title && preview.segments.length === 0
							? "Captured page title"
							: "Captured page text"
						: page.searchQueries?.length
							? "Saved search query"
							: page.pageExcerptAvailable
								? "Search excerpt"
								: "Address only"}
				</p>
			</header>
			{preview?.title && (
				<p className="border-b border-border py-4 text-sm font-medium">
					Page title:{" "}
					<MatchedText text={preview.title} terms={page.matchedTerms} />
				</p>
			)}
			<div aria-busy={loading} className="py-5">
				{text.length ? (
					<section
						aria-label="Captured page text"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: Keep scrollable captured text keyboard-accessible.
						tabIndex={0}
						className="max-h-96 overflow-auto rounded-md border bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
					>
						<pre className="typeset typeset-capture m-0 whitespace-pre-wrap wrap-break-word p-4 text-foreground">
							<MatchedText text={uniqueText} terms={page.matchedTerms} />
						</pre>
					</section>
				) : page.searchQueries?.length ? (
					<section
						aria-label="Saved search queries"
						className="rounded-md border bg-muted/40 p-4 text-sm leading-6"
					>
						{page.searchQueries.map((searchQuery) => (
							<p key={searchQuery} className="mb-2 last:mb-0">
								<MatchedText text={searchQuery} terms={page.matchedTerms} />
							</p>
						))}
					</section>
				) : (
					<p className="text-sm leading-6 text-muted-foreground">
						No page text saved. The page title above is the only captured page
						evidence.
					</p>
				)}
				{loading && (
					<p
						role="status"
						className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
					>
						<LoaderCircle
							aria-hidden="true"
							className="size-4 motion-safe:animate-spin"
						/>
						Loading saved text…
					</p>
				)}
				{error && (
					<div role="alert" className="mt-4 text-sm text-destructive">
						<p>{error}</p>
						<button
							type="button"
							className={actionClass}
							onClick={() => setRetry((value) => value + 1)}
						>
							Retry
						</button>
					</div>
				)}
				{!loading && !error && sourceId && !preview && (
					<p role="status" className="mt-4 text-sm text-muted-foreground">
						Saved text unavailable.{" "}
						{page.pageExcerptAvailable && "Search again for a fresh excerpt."}
					</p>
				)}
				{preview && (
					<p className="mt-6 text-xs leading-5 text-muted-foreground">
						<time dateTime={new Date(preview.timestamp).toISOString()}>
							Captured {dateLabel(preview.timestamp)}
						</time>
						{preview.coverage.partial && " · Partial"}
						{preview.coverage.truncated && " · Text cut off"}
						{preview.redacted && " · Sensitive text hidden"}
					</p>
				)}
				<dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t pt-4 text-xs text-muted-foreground">
					<div>
						<dt>First seen</dt>
						<dd className="mt-1 text-foreground">
							<time dateTime={new Date(page.firstSeen).toISOString()}>
								{dateLabel(page.firstSeen)}
							</time>
						</dd>
					</div>
					<div>
						<dt>Last seen</dt>
						<dd className="mt-1 text-foreground">
							<time dateTime={new Date(page.lastSeen).toISOString()}>
								{dateLabel(page.lastSeen)}
							</time>
						</dd>
					</div>
				</dl>
			</div>
			<footer className="flex flex-wrap items-start justify-between gap-x-4 border-t border-border pt-3">
				{pageSources.length > 1 && (
					<details className="min-w-0 text-xs text-muted-foreground">
						<summary className="min-h-11 w-fit cursor-pointer rounded py-3 focus-visible:outline-2 focus-visible:outline-ring">
							Choose a saved capture
						</summary>
						<ul className="flex flex-col gap-2 pb-3">
							{pageSources.map((source) => (
								<li key={source.id}>
									<button
										type="button"
										aria-pressed={selectedSource?.id === source.id}
										className={cn(
											actionClass,
											selectedSource?.id === source.id &&
												"font-medium text-foreground",
										)}
										onClick={() => setSourceId(source.id)}
									>
										Read capture ·{" "}
										<time dateTime={new Date(source.timestamp).toISOString()}>
											{new Date(source.timestamp)
												.toISOString()
												.replace("T", " ")
												.slice(0, 16)}
										</time>
									</button>
								</li>
							))}
						</ul>
					</details>
				)}
				<a
					href={page.url}
					target="_blank"
					rel="noreferrer"
					className={actionClass}
				>
					Open page<span className="sr-only"> in new tab</span>
					<ArrowUpRight aria-hidden="true" className="size-4" />
				</a>
			</footer>
		</article>
	);
};

export const ReadingDesk = ({
	initialHistory,
}: {
	initialHistory: {
		counts: {
			eventCount: number;
			pageCount: number;
			firstEventTimestamp: number | null;
		} | null;
		connectionError: string;
	};
}) => {
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const query = input.trim();
	const recentSearchQuestion = Boolean(parseRecentSearchQuestion(query));
	const [composing, setComposing] = useState(false);
	const searchDebouncer = useRef<Debouncer<() => void> | null>(null);
	const [retry, setRetry] = useState(0);
	const [results, setResults] = useState<HistorySearchResult[]>([]);
	const [searchStatus, setSearchStatus] = useState<SearchAvailability | null>(
		null,
	);
	const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState("");
	const [counts, setCounts] = useState(initialHistory.counts);
	const [connectionError, setConnectionError] = useState(
		initialHistory.connectionError,
	);
	const [connectRetry, setConnectRetry] = useState(0);
	const firstEventTimestamp = counts?.firstEventTimestamp ?? null;
	const trackingMessage =
		firstEventTimestamp !== null
			? null
			: counts === null
				? "Tracking unavailable"
				: counts.eventCount > 0
					? "Reload extension to enable timer"
					: "Waiting for first event";
	useEffect(() => {
		if (connectRetry === 0) return;
		let active = true;
		setConnectionError("");
		void readHistoryCounts()
			.then((value) => {
				if (active) {
					setCounts(value);
					setConnectionError("");
				}
			})
			.catch((reason: unknown) => {
				if (active) setConnectionError(messageOf(reason));
			});
		return () => {
			active = false;
		};
	}, [connectRetry]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly resubmits an unchanged query.
	useEffect(() => {
		if (!query) {
			setResults([]);
			setSearchStatus(null);
			setSearchError("");
			setSearching(false);
			return;
		}
		setSearching(true);
		setSearchStatus(null);
		setSearchError("");
		if (composing) return;
		let active = true;
		const debouncer = new Debouncer(
			() => {
				void searchRetainedPages(query)
					.then(({ results: value, searchStatus: status }) => {
						if (active) {
							setResults(value);
							setSearchStatus(status);
							setSelectedUrl(null);
							setSearching(false);
						}
					})
					.catch((reason: unknown) => {
						if (active) {
							setSearchError(messageOf(reason));
							setSearching(false);
						}
					});
			},
			{ wait: 300 },
		);
		searchDebouncer.current = debouncer;
		debouncer.maybeExecute();
		return () => {
			active = false;
			debouncer.cancel();
			searchDebouncer.current = null;
		};
	}, [query, composing, retry]);
	const selected =
		results.find((page) => page.url === selectedUrl) ?? results[0];
	return (
		<main className="min-h-svh bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+10rem)] pt-8 text-foreground sm:px-10">
			<div className="mx-auto max-w-5xl">
				<header className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<img
							src={`${import.meta.env.BASE_URL}logo.png`}
							alt=""
							width={28}
							height={28}
							className="size-7 object-contain"
						/>
						<span className="text-base font-semibold">tabot</span>
					</div>
					{firstEventTimestamp !== null ? (
						<TrackingDuration firstEventTimestamp={firstEventTimestamp} />
					) : (
						<p
							title={connectionError || undefined}
							className="whitespace-nowrap text-xs text-muted-foreground"
						>
							{trackingMessage}
						</p>
					)}
				</header>
				<MotionConfig reducedMotion="user">
					<motion.section
						initial={{ y: 16 }}
						animate={{ y: 0 }}
						transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
						aria-label="Find a page"
						className={cn(
							"mx-auto max-w-2xl",
							query
								? "pt-10 sm:pt-14"
								: "flex min-h-[60svh] flex-col justify-center",
						)}
					>
						<h1 className="mb-6 text-center text-2xl font-medium tracking-tight">
							{searching
								? "Finding your way back…"
								: searchError
									? "Find a page again."
									: results.length > 0
										? "You’ve been here before."
										: query
											? "No match this time."
											: "Find a page again."}
						</h1>
						<search>
							<form
								onSubmit={(event) => {
									event.preventDefault();
									if (!composing) searchDebouncer.current?.flush();
									if (!counts) setConnectRetry((value) => value + 1);
								}}
								className="relative flex items-center gap-2 border-x-0 border-t-0 border-b border-input bg-background p-1.5 focus-within:border-work-ink"
							>
								<Search
									aria-hidden="true"
									className="ml-2 size-4 shrink-0 text-muted-foreground"
								/>
								<label htmlFor="history-query" className="sr-only">
									Search retained pages
								</label>
								<input
									ref={inputRef}
									id="history-query"
									type="search"
									enterKeyHint="search"
									autoComplete="off"
									maxLength={240}
									value={input}
									onChange={(event) => setInput(event.target.value)}
									onCompositionStart={() => setComposing(true)}
									onCompositionEnd={(event) => {
										setInput(event.currentTarget.value);
										setComposing(false);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter" && event.nativeEvent.isComposing)
											event.preventDefault();
									}}
									placeholder="What do you remember?"
									aria-describedby="history-help"
									className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground"
								/>
								{input && (
									<button
										aria-label="Clear search"
										type="button"
										onClick={() => {
											setInput("");
											inputRef.current?.focus();
										}}
										className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
									>
										<X aria-hidden="true" className="size-4" />
									</button>
								)}
							</form>
						</search>
						{!query && (
							<div className="mt-5 text-center text-sm leading-6 text-muted-foreground">
								{connectionError ? (
									<div role="alert">
										<p>{connectionError}</p>
										<button
											type="button"
											className={actionClass}
											onClick={() => setConnectRetry((value) => value + 1)}
										>
											Retry connection
										</button>
									</div>
								) : !counts ? (
									<p role="status">Connecting to Tabot…</p>
								) : counts.eventCount + counts.pageCount === 0 ? (
									<p>
										No retained history yet. Enable tracking in Tabot, browse a
										page, then search here.
									</p>
								) : counts.pageCount === 0 ? (
									<p>
										Browser events are available. Page text appears only when
										Tabot captures eligible pages.
									</p>
								) : null}
							</div>
						)}
					</motion.section>
				</MotionConfig>
				{query && (
					<section
						aria-label="Search results"
						aria-busy={searching}
						className="mt-10"
					>
						{searching && (
							<div role="status" className="mb-7 py-8">
								<span className="sr-only">Searching local history…</span>
								<div
									aria-hidden="true"
									className="h-1.5 w-full overflow-hidden bg-work-surface"
								>
									<div className="h-full w-1/3 bg-linear-to-r from-transparent via-primary to-transparent motion-safe:animate-[search-progress_1.4s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-primary/60" />
								</div>
							</div>
						)}
						{searchError && (
							<div
								role="alert"
								className="mb-6 rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
							>
								<p>
									{searchError}{" "}
									{results.length > 0 && "Previous results remain below."}
								</p>
								<button
									type="button"
									className={actionClass}
									onClick={() => setRetry((value) => value + 1)}
								>
									Retry search
								</button>
							</div>
						)}
						{!searching && !searchError && searchStatus && (
							<p role="status" className="mb-4 text-sm text-muted-foreground">
								{searchStatus.mode === "hybrid"
									? "Meaning-based and matching-word search are ready on this device."
									: searchStatus.model === "unavailable"
										? "Meaning-based search is unavailable. Results use matching words."
										: searchStatus.indexing
											? "Tabot is building its local search index. Matching-word search remains available."
											: searchStatus.model === "ready"
												? "Meaning-based search is unavailable. Results use matching words."
												: "Meaning-based search is not ready yet. Results use matching words."}
							</p>
						)}
						{!searching && !searchError && !results.length && (
							<p className="py-8 text-center text-sm leading-6 text-muted-foreground">
								{recentSearchQuestion
									? "No Google search query was recorded near that time. Older visits predate local search-term capture."
									: `No saved title or page text matches “${query}”. URL-only visits cannot match their topic. Open a page with Tabot tracking on and leave it visible briefly to capture local context.`}
							</p>
						)}
						{selected && (
							<div className="grid items-start gap-6 md:grid-cols-5">
								<ul
									aria-label="Matching pages"
									className="reading-desk-list flex flex-col gap-3 md:col-span-2 md:max-h-[min(65svh,42rem)] md:min-h-0 md:overflow-x-hidden md:overflow-y-auto md:pr-2"
								>
									{results.map((page) => (
										<li key={page.url} className="w-full">
											<button
												type="button"
												aria-pressed={selected.url === page.url}
												onClick={() => setSelectedUrl(page.url)}
												className={cn(
													"flex w-full items-start gap-4 border-b border-border px-3 py-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring",
													selected.url === page.url
														? "bg-work-surface"
														: "hover:bg-muted/60",
												)}
											>
												<PageFavicon page={page} />
												<span className="flex min-w-0 flex-1 flex-col gap-2">
													<span className="break-all text-xs text-muted-foreground">
														{page.host}
													</span>
													<span className="wrap-break-word font-medium">
														{urlLabel(page)}
													</span>
													<span className="line-clamp-2 text-sm leading-6 text-muted-foreground">
														{page.pageExcerptAvailable
															? page.excerpt
															: page.pageTitle
																? `Page title: ${page.pageTitle}`
																: page.searchQueries?.length
																	? `Google search: ${page.searchQueries[0]}`
																	: "Address saved · No title or page text captured"}
													</span>
													<span className="text-xs text-muted-foreground">
														Last seen {dateLabel(page.lastSeen)}
														Evidence:{" "}
														{page.evidenceKinds
															.map(
																(kind) =>
																	({
																		"url-only": "URL only",
																		"title-only": "Page title",
																		"auto-snippet": "Auto-captured excerpt",
																		"interaction-excerpt":
																			"Interaction excerpt",
																		"search-phrase": "Saved search phrase",
																	})[kind],
															)
															.join(", ")}
													</span>
												</span>
											</button>
										</li>
									))}
								</ul>
								<PageReader
									key={`${selected.url}-${selected.sources[0]?.id}`}
									page={selected}
								/>
							</div>
						)}
					</section>
				)}
			</div>
		</main>
	);
};
