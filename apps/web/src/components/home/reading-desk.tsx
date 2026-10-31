import { parseRecentSearchQuestion } from "@tabot/shared/dashboard";
import { Debouncer } from "@tanstack/pacer";
import { Search, X } from "lucide-react";
import { domAnimation, LazyMotion, MotionConfig, m } from "motion/react";
import { useEffect, useReducer, useRef, useState } from "react";
import {
	initialReadingDeskSearchState,
	readingDeskSearchReducer,
} from "~/components/home/reading-desk-state";
import { messageOf } from "~/components/home/reading-desk-utils";
import { SearchResultSection } from "~/components/home/search-result-section";
import { TrackingControls } from "~/components/home/tracking-controls";
import { searchRetainedPages } from "~/lib/history";
import { cn } from "~/lib/utils";

export const ReadingDesk = () => {
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const query = input.trim();
	const recentSearchQuestion = Boolean(parseRecentSearchQuestion(query));
	const [composing, setComposing] = useState(false);
	const searchDebouncer = useRef<Debouncer<() => void> | null>(null);
	const [searchState, dispatchSearch] = useReducer(
		readingDeskSearchReducer,
		initialReadingDeskSearchState,
	);
	useEffect(() => {
		const initialQuery = new URLSearchParams(window.location.search).get("q");
		if (initialQuery) setInput(initialQuery.slice(0, 240));
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryCount intentionally resubmits unchanged query.
	useEffect(() => {
		if (!query) {
			dispatchSearch({ type: "clear" });
			return;
		}
		dispatchSearch({ type: "start" });
		if (composing) return;
		let active = true;
		const debouncer = new Debouncer(
			() => {
				void searchRetainedPages(query)
					.then(({ results, notes, searchStatus }) => {
						if (active) {
							dispatchSearch({
								type: "success",
								results,
								notes,
								searchStatus,
							});
						}
					})
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
	}, [query, composing, searchState.retryCount]);
	return (
		<main className="min-h-svh bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+10rem)] pt-8 text-foreground sm:px-10">
			<div className="mx-auto max-w-5xl">
				<header className="flex flex-wrap items-center justify-between gap-3">
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
					<TrackingControls />
				</header>
				<MotionConfig reducedMotion="user">
					<LazyMotion features={domAnimation}>
						<m.section
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
								{searchState.searching
									? "Finding your way back…"
									: searchState.searchError
										? "Find a page again."
										: searchState.results.length > 0
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
											if (
												event.key === "Enter" &&
												event.nativeEvent.isComposing
											)
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
						</m.section>
					</LazyMotion>
				</MotionConfig>
				<SearchResultSection
					query={query}
					recentSearchQuestion={recentSearchQuestion}
					state={searchState}
					onRetrySearch={() => dispatchSearch({ type: "retry" })}
					onSelectPage={(url) => dispatchSearch({ type: "select", url })}
				/>
			</div>
		</main>
	);
};
