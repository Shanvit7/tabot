import type {
	DashboardPagePreview,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import { LoaderCircle } from "lucide-react";
import { MatchedText } from "~/components/home/matched-text";
import { actionClass, dateLabel } from "~/components/home/reading-desk-utils";

export const PageReaderContent = ({
	page,
	text,
	sourceId,
	preview,
	loading,
	error,
	onRetry,
}: {
	page: HistorySearchResult;
	text: string;
	sourceId: string | undefined;
	preview: DashboardPagePreview | null;
	loading: boolean;
	error: string;
	onRetry: () => void;
}) => (
	<div aria-busy={loading} className="py-5">
		{text ? (
			<section
				aria-label="Captured page text"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keep scrollable captured text keyboard-accessible.
				tabIndex={0}
				className="max-h-96 overflow-auto rounded-md border bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
			>
				<pre className="typeset typeset-capture m-0 whitespace-pre-wrap wrap-break-word p-4 text-foreground">
					<MatchedText text={text} terms={page.matchedTerms} />
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
				<button type="button" className={actionClass} onClick={onRetry}>
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
);
