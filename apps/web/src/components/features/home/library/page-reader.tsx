import type {
	DashboardPagePreview,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { MatchedText } from "~/components/features/home/library/matched-text";
import { PageReaderContent } from "~/components/features/home/library/page-reader-content";
import { messageOf, urlLabel } from "~/components/features/home/search/utils";
import { readPagePreview } from "~/lib/history";
import { cn } from "~/lib/utils";

const pageCaptureLabel = (
	page: HistorySearchResult,
	preview: DashboardPagePreview | null,
) => {
	if (preview)
		return preview.title && preview.segments.length === 0
			? "Captured page title"
			: "Captured page text";
	if (page.searchQueries?.length) return "Saved search query";
	return page.pageExcerptAvailable ? "Search excerpt" : "Address only";
};

export const PageReader = ({ page }: { page: HistorySearchResult }) => {
	// Search citations put the excerpt's source first, not necessarily the newest capture.
	const [sourceId, setSourceId] = useState(
		() => page.sources.find((source) => source.kind === "page")?.id,
	);
	const [preview, setPreview] = useState<DashboardPagePreview | null>(null);
	const [loading, setLoading] = useState(Boolean(sourceId));
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	const [capturesOpen, setCapturesOpen] = useState(false);
	const capturesId = useId();
	const retryRead = useCallback(() => setRetry((value) => value + 1), []);
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
					<a
						href={page.url}
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
					>
						{urlLabel(page)}
					</a>
				</h2>
				<p className="mt-1 break-all text-sm text-muted-foreground">
					{page.host} · {pageCaptureLabel(page, preview)}
				</p>
			</header>
			{preview?.title && (
				<p className="border-b border-border py-4 text-sm font-medium">
					Page title:{" "}
					<MatchedText text={preview.title} terms={page.matchedTerms} />
				</p>
			)}
			<PageReaderContent
				page={page}
				text={uniqueText}
				sourceId={sourceId}
				preview={preview}
				loading={loading}
				error={error}
				onRetry={retryRead}
			/>
			<footer className="flex flex-wrap items-start justify-between gap-x-4 border-t border-border pt-3">
				{pageSources.length > 1 && (
					<div className="w-full min-w-0 text-sm">
						<button
							type="button"
							aria-expanded={capturesOpen}
							aria-controls={capturesId}
							className="flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded font-medium text-work-muted focus-visible:outline-2 focus-visible:outline-ring"
							onClick={() => setCapturesOpen((open) => !open)}
						>
							Saved captures
							<span className="tabular-nums text-muted-foreground">
								({pageSources.length})
							</span>
							<ChevronDown
								aria-hidden="true"
								className={cn(
									"size-4 transition-transform duration-200 motion-reduce:transition-none",
									capturesOpen && "rotate-180",
								)}
							/>
						</button>
						<div
							id={capturesId}
							aria-hidden={!capturesOpen}
							inert={!capturesOpen}
							className={cn(
								"grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
								capturesOpen
									? "grid-rows-[1fr] opacity-100"
									: "grid-rows-[0fr] opacity-0",
							)}
						>
							<div className="min-h-0 overflow-hidden">
								<ul className="mt-2 flex list-none flex-col gap-1 p-0">
									{pageSources.map((source) => {
										const selected = selectedSource?.id === source.id;
										const timestamp = new Date(source.timestamp);
										return (
											<li key={source.id}>
												<button
													type="button"
													aria-pressed={selected}
													className={cn(
														"flex min-h-11 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
														selected
															? "border-work-ink bg-work-surface font-medium text-foreground"
															: "border-border text-work-muted",
													)}
													onClick={() => setSourceId(source.id)}
												>
													<span>
														{selected ? "Currently reading" : "Read capture"}
													</span>
													<time
														className="shrink-0 tabular-nums text-xs text-muted-foreground"
														dateTime={timestamp.toISOString()}
													>
														{timestamp
															.toISOString()
															.replace("T", " ")
															.slice(0, 16)}
													</time>
												</button>
											</li>
										);
									})}
								</ul>
							</div>
						</div>
					</div>
				)}
			</footer>
		</article>
	);
};
