import type {
	DashboardNoteResult,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import type { LibrarySite } from "@tabot/shared/library";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageFavicon } from "~/components/home/page-favicon";
import { PageNotes } from "~/components/home/page-notes";
import { PageReader } from "~/components/home/page-reader";
import { dateLabel, urlLabel } from "~/components/home/reading-desk-utils";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { cn } from "~/lib/utils";

const description = (page: HistorySearchResult) => {
	if (page.pageExcerptAvailable) return page.excerpt;
	if (page.pageTitle) return `Page title: ${page.pageTitle}`;
	if (page.searchQueries?.length)
		return `Google search: ${page.searchQueries[0]}`;
	return "Address saved · No title or page text captured";
};

export const SearchEverythingBoard = ({
	pagesOnly = false,
	notesOnly = false,
	sites = [],
	sitesTotal = 0,
	sitesHasMore = false,
	sitesLoading = false,
	sitesError = "",
	onBrowseSites,
	results,
	notes,
	noteCountsByUrl,
	onUpdateNote,
	onLoadMore,
	hasMorePages,
	hasMoreNotes,
	loadingMorePages,
	loadingMoreNotes,
	loadMoreError,
}: {
	pagesOnly?: boolean;
	notesOnly?: boolean;
	sites?: LibrarySite[];
	sitesTotal?: number;
	sitesHasMore?: boolean;
	sitesLoading?: boolean;
	sitesError?: string;
	onBrowseSites?: () => void;
	results: HistorySearchResult[];
	notes: DashboardNoteResult[];
	noteCountsByUrl: Map<string, number>;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
	onLoadMore: (list: "pages" | "notes") => void;
	hasMorePages: boolean;
	hasMoreNotes: boolean;
	loadingMorePages: boolean;
	loadingMoreNotes: boolean;
	loadMoreError: string;
}) => {
	const [active, setActive] = useState<
		| { type: "page"; item: HistorySearchResult }
		| { type: "note"; item: DashboardNoteResult }
		| null
	>(null);
	const [editingNote, setEditingNote] = useState(false);
	const [draft, setDraft] = useState("");
	const [savingNote, setSavingNote] = useState(false);
	const [saveError, setSaveError] = useState("");
	const pagesScrollRef = useRef<HTMLUListElement>(null);
	const notesScrollRef = useRef<HTMLUListElement>(null);
	const pagesVirtualizer = useVirtualizer({
		count: results.length + Number(hasMorePages),
		getScrollElement: () => pagesScrollRef.current,
		estimateSize: () => 140,
		getItemKey: (index) => results[index]?.url ?? "pages-loader",
		overscan: 4,
	});
	const notesVirtualizer = useVirtualizer({
		count: notes.length + Number(hasMoreNotes),
		getScrollElement: () => notesScrollRef.current,
		estimateSize: () => 150,
		getItemKey: (index) => notes[index]?.id ?? "notes-loader",
		overscan: 4,
	});
	useEffect(() => {
		if (
			hasMorePages &&
			!loadingMorePages &&
			!loadMoreError &&
			pagesVirtualizer
				.getVirtualItems()
				.some(({ index }) => index >= results.length - 3)
		)
			onLoadMore("pages");
	}, [
		hasMorePages,
		loadingMorePages,
		loadMoreError,
		onLoadMore,
		pagesVirtualizer,
		results.length,
	]);
	useEffect(() => {
		if (
			hasMoreNotes &&
			!loadingMoreNotes &&
			!loadMoreError &&
			notesVirtualizer
				.getVirtualItems()
				.some(({ index }) => index >= notes.length - 3)
		)
			onLoadMore("notes");
	}, [
		hasMoreNotes,
		loadingMoreNotes,
		loadMoreError,
		notes.length,
		notesVirtualizer,
		onLoadMore,
	]);
	return (
		<>
			<div
				className={cn(
					"grid items-start gap-3 sm:gap-5",
					!pagesOnly && !notesOnly && "grid-cols-1 md:grid-cols-3",
				)}
			>
				{!pagesOnly && !notesOnly && (
					<section aria-label="Matching sites" className="min-w-0">
						<ul className="max-h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-width:thin]">
							{sites.map((site) => (
								<li
									key={site.site}
									className="border-b border-border last:border-0"
								>
									<a
										href={`https://${site.site}/`}
										target="_blank"
										rel="noreferrer"
										className="flex min-w-0 items-center gap-2 py-3 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring"
									>
										<PageFavicon
											page={{
												url: site.url,
												host: site.site,
												favicon: site.favicon,
											}}
										/>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium underline underline-offset-4">
												{site.site}
											</span>
											<span className="block text-xs text-muted-foreground">
												{site.pageCount} pages · {site.noteCount} notes
											</span>
										</span>
									</a>
								</li>
							))}
							{!sites.length && (
								<li className="py-3 text-xs text-muted-foreground">
									{sitesError ||
										(sitesLoading ? "Loading sites…" : "No matching sites")}
								</li>
							)}
						</ul>
						{(sitesHasMore || sitesTotal > 0) && (
							<Button
								variant="ghost"
								size="sm"
								onClick={onBrowseSites}
								className="mt-1"
							>
								Browse all sites
							</Button>
						)}
					</section>
				)}
				{!notesOnly && (
					<section aria-label="Matching pages" className="min-w-0">
						<ul
							ref={pagesScrollRef}
							aria-label="Matching pages"
							className="relative h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 motion-reduce:scroll-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
						>
							<li
								aria-hidden="true"
								className="w-full"
								style={{ height: pagesVirtualizer.getTotalSize() }}
							/>
							{pagesVirtualizer.getVirtualItems().map((virtualRow) => {
								const page = results[virtualRow.index];
								if (!page)
									return (
										<li
											key="pages-loader"
											className="absolute left-0 top-0 w-full pb-2"
											style={{ transform: `translateY(${virtualRow.start}px)` }}
										>
											{loadMoreError ? (
												<button
													type="button"
													onClick={() => onLoadMore("pages")}
													className="w-full py-3 text-center text-xs text-destructive underline underline-offset-4"
												>
													Couldn’t load pages. Retry
												</button>
											) : (
												<p
													role="status"
													className="py-3 text-center text-xs text-muted-foreground"
												>
													{loadingMorePages
														? "Loading pages…"
														: "Loading more pages on scroll"}
												</p>
											)}
										</li>
									);
								return (
									<li
										key={virtualRow.key}
										data-index={virtualRow.index}
										ref={pagesVirtualizer.measureElement}
										className="absolute left-0 top-0 w-full pb-2"
										style={{ transform: `translateY(${virtualRow.start}px)` }}
									>
										<div className="relative flex min-h-28 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-work-surface p-2.5 transition-colors hover:border-work-ink/40 hover:bg-muted/40 sm:p-3">
											<button
												type="button"
												onClick={() => setActive({ type: "page", item: page })}
												aria-label={`Show details for ${urlLabel(page)}`}
												className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											/>
											<span className="flex min-w-0 items-center gap-2">
												<PageFavicon page={page} />
												<a
													href={page.url}
													target="_blank"
													rel="noreferrer"
													className="relative z-20 truncate text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
												>
													{page.host}
												</a>
											</span>
											<a
												href={page.url}
												target="_blank"
												rel="noreferrer"
												className="relative z-20 line-clamp-2 w-full wrap-break-word text-sm font-medium leading-5 underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
											>
												{urlLabel(page)}
											</a>
											<p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
												{description(page)}
											</p>
											<div className="mt-auto flex w-full items-center justify-between gap-2">
												<span className="text-xs tabular-nums text-muted-foreground">
													{noteCountsByUrl.get(page.url)
														? `${noteCountsByUrl.get(page.url)} notes · `
														: ""}
													{dateLabel(page.lastSeen)}
												</span>
											</div>
										</div>
									</li>
								);
							})}
							{!results.length && !hasMorePages && (
								<li className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
									No matching pages
								</li>
							)}
						</ul>
					</section>
				)}
				{!pagesOnly && (
					<section aria-label="Matching notes" className="min-w-0">
						<ul
							ref={notesScrollRef}
							aria-label="Matching notes"
							className="relative h-[min(65svh,42rem)] min-h-32 overflow-y-auto overscroll-y-contain pr-1 motion-reduce:scroll-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
						>
							<li
								aria-hidden="true"
								className="w-full"
								style={{ height: notesVirtualizer.getTotalSize() }}
							/>
							{notesVirtualizer.getVirtualItems().map((virtualRow) => {
								const note = notes[virtualRow.index];
								if (!note)
									return (
										<li
											key="notes-loader"
											className="absolute left-0 top-0 w-full pb-2"
											style={{ transform: `translateY(${virtualRow.start}px)` }}
										>
											{loadMoreError ? (
												<button
													type="button"
													onClick={() => onLoadMore("notes")}
													className="w-full py-3 text-center text-xs text-destructive underline underline-offset-4"
												>
													Couldn’t load notes. Retry
												</button>
											) : (
												<p
													role="status"
													className="py-3 text-center text-xs text-muted-foreground"
												>
													{loadingMoreNotes
														? "Loading notes…"
														: "Loading more notes on scroll"}
												</p>
											)}
										</li>
									);
								return (
									<li
										key={virtualRow.key}
										data-index={virtualRow.index}
										ref={notesVirtualizer.measureElement}
										className="absolute left-0 top-0 w-full pb-2"
										style={{ transform: `translateY(${virtualRow.start}px)` }}
									>
										<div className="relative flex min-h-28 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-work-surface p-2.5 text-left transition-colors hover:border-work-ink/40 hover:bg-muted/40 sm:p-3">
											<button
												type="button"
												onClick={() => {
													setActive({ type: "note", item: note });
													setDraft(note.text);
													setEditingNote(false);
													setSaveError("");
												}}
												aria-label={`Show note details from ${note.host}`}
												className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											/>
											<span className="flex w-full min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
												<span className="flex min-w-0 items-center gap-2">
													<PageFavicon page={note} />
													<a
														href={note.url}
														target="_blank"
														rel="noreferrer"
														className="relative z-20 truncate underline-offset-4 hover:underline focus-visible:underline"
													>
														{note.host}
													</a>
												</span>
												<time
													className="shrink-0 tabular-nums"
													dateTime={new Date(note.updatedAt).toISOString()}
												>
													{dateLabel(note.updatedAt)}
												</time>
											</span>
											<span className="line-clamp-3 w-full whitespace-pre-wrap wrap-break-word text-sm leading-5">
												{note.text}
											</span>
											<div className="mt-auto flex w-full min-w-0 items-center justify-between gap-2">
												<a
													href={note.url}
													target="_blank"
													rel="noreferrer"
													className="relative z-20 line-clamp-1 min-w-0 text-xs text-muted-foreground underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
												>
													{note.title ?? note.host}
												</a>
											</div>
										</div>
									</li>
								);
							})}
							{!notes.length && !hasMoreNotes && (
								<li className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
									No matching notes
								</li>
							)}
						</ul>
					</section>
				)}
			</div>
			<Sheet
				open={active !== null}
				onOpenChange={(open) => !open && setActive(null)}
			>
				<SheetContent
					side="right"
					className="w-full overflow-y-auto sm:w-[min(42rem,80vw)] sm:max-w-none"
				>
					{active && (
						<>
							<SheetHeader className="border-b border-border px-5 py-5 pr-14">
								<div className="flex min-w-0 items-center gap-3">
									<PageFavicon page={active.item} />
									<SheetTitle className="wrap-break-word">
										<a
											href={active.item.url}
											target="_blank"
											rel="noreferrer"
											className="underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
										>
											{active.type === "page"
												? urlLabel(active.item)
												: (active.item.title ?? active.item.host)}
										</a>
									</SheetTitle>
								</div>
								<SheetDescription className="break-all">
									{active.item.host} ·{" "}
									{dateLabel(
										active.type === "page"
											? active.item.lastSeen
											: active.item.updatedAt,
									)}
								</SheetDescription>
							</SheetHeader>
							<div className="flex flex-col gap-5 overflow-y-auto px-5 pb-6">
								{active.type === "page" ? (
									<>
										<PageReader
											key={`${active.item.url}-${active.item.sources[0]?.id}`}
											page={active.item}
										/>
										<PageNotes
											key={active.item.url}
											url={active.item.url}
											onUpdateNote={onUpdateNote}
										/>
									</>
								) : (
									<>
										{editingNote ? (
											<form
												className="flex flex-col gap-3"
												onSubmit={async (event) => {
													event.preventDefault();
													if (active.type !== "note" || savingNote) return;
													setSavingNote(true);
													setSaveError("");
													try {
														const updated = await onUpdateNote(
															active.item.id,
															draft.trim(),
														);
														setActive({
															type: "note",
															item: { ...active.item, ...updated },
														});
														setDraft(updated.text);
														setEditingNote(false);
													} catch {
														setSaveError(
															"Couldn’t save note. Check connection and try again.",
														);
													} finally {
														setSavingNote(false);
													}
												}}
											>
												<label
													htmlFor="note-editor"
													className="text-sm font-medium"
												>
													Edit note
												</label>
												<textarea
													id="note-editor"
													value={draft}
													onChange={(event) => setDraft(event.target.value)}
													maxLength={4000}
													rows={7}
													required
													className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
												/>
												<div className="flex items-center justify-between gap-3">
													<p
														aria-live="polite"
														className="text-xs text-muted-foreground"
													>
														{draft.length}/4000
													</p>
													<div className="flex gap-2">
														<Button
															type="button"
															variant="outline"
															disabled={savingNote}
															onClick={() => {
																setEditingNote(false);
																setDraft(active.item.text);
																setSaveError("");
															}}
														>
															<X aria-hidden="true" /> Cancel
														</Button>
														<Button
															type="submit"
															disabled={
																savingNote ||
																!draft.trim() ||
																draft.trim() === active.item.text
															}
														>
															<Check aria-hidden="true" />{" "}
															{savingNote ? "Saving…" : "Save note"}
														</Button>
													</div>
												</div>
												{saveError && (
													<p role="alert" className="text-sm text-destructive">
														{saveError}
													</p>
												)}
											</form>
										) : (
											<div className="flex flex-col gap-3">
												<p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">
													{active.item.text}
												</p>
												<Button
													variant="outline"
													onClick={() => {
														setDraft(active.item.text);
														setEditingNote(true);
													}}
												>
													<Pencil aria-hidden="true" /> Edit note
												</Button>
											</div>
										)}
										{active.item.title && (
											<p className="text-sm text-muted-foreground">
												Saved from: {active.item.title}
											</p>
										)}
									</>
								)}
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
};
