import type {
	DashboardPagePreview,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import { useEffect, useState } from "react";
import { MatchedText } from "~/components/home/matched-text";
import { PageReaderContent } from "~/components/home/page-reader-content";
import {
	actionClass,
	messageOf,
	urlLabel,
} from "~/components/home/reading-desk-utils";
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
				onRetry={() => setRetry((value) => value + 1)}
			/>
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
			</footer>
		</article>
	);
};
