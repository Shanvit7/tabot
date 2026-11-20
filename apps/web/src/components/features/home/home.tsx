import { Debouncer } from "@tanstack/pacer";
import { Link } from "@tanstack/react-router";
import { Ascii } from "ascii.rest/react";
import { Search, Settings, X } from "lucide-react";
import {
	domAnimation,
	LazyMotion,
	MotionConfig,
	m,
	useReducedMotion,
} from "motion/react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { homeAmbient } from "~/components/features/home/ambient";
import { SearchResultSection } from "~/components/features/home/search/result-section";
import { searchPeriods } from "~/components/features/home/search/result-section/types";
import {
	initialSearchState,
	searchReducer,
} from "~/components/features/home/search/state";
import { useHomeSearchParams } from "~/components/features/home/search/use-home-search-params";
import {
	messageOf,
	searchTimeRange,
} from "~/components/features/home/search/utils";
import { TrackingControls } from "~/components/features/home/tracking/controls";
import { Button } from "~/components/ui/button";
import BlurOutUp from "~/components/ui/motion/text/blur-out-up";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { LOGO_URL } from "~/lib/constants";
import {
	preloadSearchModel,
	searchRetainedPages,
	updateDashboardNote,
} from "~/lib/history";
import { cn } from "~/lib/utils";

export const Home = () => {
	const reduceMotion = useReducedMotion();
	const {
		query: input,
		category,
		period,
		setQuery,
		setCategory,
		setPeriod,
	} = useHomeSearchParams();
	const inputRef = useRef<HTMLInputElement>(null);
	const query = input.trim();
	const [composing, setComposing] = useState(false);
	const [searchState, dispatchSearch] = useReducer(
		searchReducer,
		initialSearchState,
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: freeze one time window per search, not per Home mount.
	const searchNow = useMemo(
		() => Date.now(),
		[query, period, searchState.retryCount],
	);
	const selectedPeriod =
		searchPeriods.find((option) => option.id === period) ?? searchPeriods[0];
	const { from, to } = searchTimeRange(selectedPeriod.days, searchNow);
	const searchDebouncer = useRef<Debouncer<() => void> | null>(null);
	const loadingLists = useRef(new Set<string>());
	const searchGeneration = useRef(0);
	useEffect(() => {
		void preloadSearchModel().catch(() => {});
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryCount intentionally resubmits unchanged query.
	useEffect(() => {
		searchGeneration.current += 1;
		if (!query) {
			dispatchSearch({ type: "clear" });
			return;
		}
		dispatchSearch({ type: "start" });
		if (composing) return;
		let active = true;
		const debouncer = new Debouncer(
			() => {
				void searchRetainedPages(query, { from, to })
					.then(
						({ results, notes, searchStatus, resultsTotal, notesTotal }) => {
							if (active) {
								dispatchSearch({
									type: "success",
									results,
									notes,
									searchStatus,
									resultsTotal,
									notesTotal,
								});
							}
						},
					)
					.catch((reason: unknown) => {
						if (active) {
							dispatchSearch({ type: "error", message: messageOf(reason) });
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
	}, [query, composing, from, to, searchState.retryCount]);
	return (
		<main className="relative isolate min-h-svh overflow-hidden bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+10rem)] pt-8 text-foreground sm:px-10">
			<div className="relative z-10 mx-auto max-w-5xl">
				<header className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<img
							src={LOGO_URL}
							alt=""
							width={28}
							height={28}
							className="size-7 object-contain"
						/>
						<span className="text-base font-semibold">Tabot</span>
					</div>
					<div className="flex items-center gap-2">
						<TooltipProvider delayDuration={350}>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										asChild
										variant="ghost"
										size="icon-lg"
										className="size-11 rounded-full"
									>
										<Link to="/settings" aria-label="Settings & Help">
											<Settings aria-hidden="true" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent>Settings & Help</TooltipContent>
							</Tooltip>
						</TooltipProvider>
						<TrackingControls />
					</div>
				</header>
				<MotionConfig reducedMotion="user">
					<LazyMotion features={domAnimation}>
						<m.section
							initial={{ y: 16 }}
							animate={{ y: 0 }}
							transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
							aria-label="Home"
							className={cn(
								"mx-auto flex max-w-2xl flex-col justify-center transition-[min-height,padding-top] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
								query ? "min-h-0 pt-10 sm:pt-14" : "min-h-[60svh] pt-6",
							)}
						>
							<h1
								aria-label={
									query
										? `Find your way back to "${query}"`
										: "Find your way back to a page you visited, a site you remember, or yesterday’s activity"
								}
								className="mb-6 text-center text-2xl font-medium tracking-tight"
							>
								<span aria-hidden="true">Find your way back to</span>
								{query ? (
									<span
										aria-hidden="true"
										className="ml-1 inline-block max-w-[60vw] truncate align-bottom font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4 sm:max-w-sm"
									>
										&ldquo;{query}&rdquo;
									</span>
								) : reduceMotion ? (
									<span className="ml-1 font-semibold underline decoration-primary decoration-2 underline-offset-4">
										a page
									</span>
								) : (
									<BlurOutUp
										text={[
											"a page you visited",
											"a site you remember",
											"yesterday’s activity",
										]}
										className="ml-1 inline-flex h-[1.5em] w-[17ch] translate-y-[0.1em] align-bottom"
										titleClassName="[justify-self:start] bg-transparent font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4"
									/>
								)}
							</h1>
							<search>
								<form
									onSubmit={(event) => {
										event.preventDefault();
										if (!composing) searchDebouncer.current?.flush();
									}}
									className="relative flex items-center gap-2 border-x-0 border-t-0 border-b border-input bg-background p-1.5 focus-within:border-work-ink"
								>
									<Search
										aria-hidden="true"
										className="ml-2 size-4 shrink-0 text-muted-foreground"
									/>
									<label htmlFor="history-query" className="sr-only">
										Search sites, pages, and notes
									</label>
									<input
										ref={inputRef}
										id="history-query"
										type="search"
										enterKeyHint="search"
										autoComplete="off"
										maxLength={240}
										value={input}
										onChange={(event) => setQuery(event.target.value)}
										onCompositionStart={() => setComposing(true)}
										onCompositionEnd={(event) => {
											setQuery(event.currentTarget.value);
											setComposing(false);
										}}
										onKeyDown={(event) => {
											if (
												event.key === "Enter" &&
												event.nativeEvent.isComposing
											)
												event.preventDefault();
										}}
										placeholder="Search sites, page titles, or your notes"
										className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground"
									/>
									{input && (
										<button
											aria-label="Clear search"
											type="button"
											onClick={() => {
												setQuery("");
												inputRef.current?.focus();
											}}
											className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
										>
											<X aria-hidden="true" className="size-4" />
										</button>
									)}
								</form>
							</search>
						</m.section>
					</LazyMotion>
				</MotionConfig>
				<SearchResultSection
					query={query}
					state={searchState}
					kind={category}
					onKindChange={setCategory}
					period={period}
					now={searchNow}
					onPeriodChange={setPeriod}
					onRetrySearch={() => dispatchSearch({ type: "retry" })}
					onUpdateNote={async (id, text) => {
						const note = await updateDashboardNote(id, text);
						dispatchSearch({ type: "update-note", note });
						return note;
					}}
					onLoadMore={(list) => {
						const generation = searchGeneration.current;
						const requestKey = `${generation}:${list}`;
						if (
							searchState.searching ||
							searchState.searchError ||
							loadingLists.current.has(requestKey) ||
							!(list === "pages"
								? searchState.hasMorePages
								: searchState.hasMoreNotes)
						)
							return;
						loadingLists.current.add(requestKey);
						dispatchSearch({ type: "load-more-start", list });
						void searchRetainedPages(query, {
							from,
							to,
							includeTotals: false,
							offset: list === "pages" ? searchState.pagesOffset : 0,
							noteOffset: list === "notes" ? searchState.notesOffset : 0,
						})
							.then(({ results, notes }) => {
								if (searchGeneration.current === generation)
									dispatchSearch({
										type: "load-more-success",
										list,
										results,
										notes,
									});
							})
							.catch(() => {
								if (searchGeneration.current === generation)
									dispatchSearch({ type: "load-more-error", list });
							})
							.finally(() => loadingLists.current.delete(requestKey));
					}}
				/>
			</div>
			<div
				aria-hidden="true"
				className={cn(
					"pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-50 transition-opacity duration-500 motion-reduce:transition-none dark:opacity-40",
					query && "opacity-25 dark:opacity-15",
				)}
			>
				<div className="absolute -left-[3vw] top-0 h-svh w-[26vw] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] max-sm:-left-[5vw] max-sm:w-[23vw]">
					<Ascii piece={homeAmbient} className="h-full w-full" />
				</div>
				<div className="absolute -right-[3vw] top-0 h-svh w-[26vw] -scale-x-100 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] max-sm:-right-[5vw] max-sm:w-[23vw]">
					<Ascii piece={homeAmbient} className="h-full w-full" />
				</div>
			</div>
		</main>
	);
};
