import type { HistorySearchResult } from "@tabot/shared/dashboard";
import { PageFavicon } from "~/components/home/page-favicon";
import { PageReader } from "~/components/home/page-reader";
import { dateLabel, urlLabel } from "~/components/home/reading-desk-utils";
import { cn } from "~/lib/utils";

const pageEvidenceLabels: Record<
	HistorySearchResult["evidenceKinds"][number],
	string
> = {
	"url-only": "URL only",
	"title-only": "Page title",
	"auto-snippet": "Auto-captured excerpt",
	"interaction-excerpt": "Interaction excerpt",
	"search-phrase": "Saved search phrase",
};

const pageDescription = (page: HistorySearchResult) => {
	if (page.pageExcerptAvailable) return page.excerpt;
	if (page.pageTitle) return `Page title: ${page.pageTitle}`;
	if (page.searchQueries?.length)
		return `Google search: ${page.searchQueries[0]}`;
	return "Address saved · No title or page text captured";
};

export const SearchPageResults = ({
	results,
	selected,
	noteCountsByUrl,
	onSelectPage,
}: {
	results: HistorySearchResult[];
	selected: HistorySearchResult;
	noteCountsByUrl: Map<string, number>;
	onSelectPage: (url: string) => void;
}) => (
	<div className="grid items-start gap-6 md:grid-cols-5">
		<ul
			aria-label="Matching pages"
			className="reading-desk-list flex flex-col gap-3 md:col-span-2 md:max-h-[min(65svh,42rem)] md:min-h-0 md:overflow-x-hidden md:overflow-y-auto md:pr-2"
		>
			{results.map((page) => {
				const selectedPage = selected.url === page.url;
				const noteCount = noteCountsByUrl.get(page.url) ?? 0;
				return (
					<li key={page.url} className="w-full">
						<button
							type="button"
							aria-pressed={selectedPage}
							onClick={() => onSelectPage(page.url)}
							className={cn(
								"flex w-full items-start gap-4 border-b border-border px-3 py-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring",
								selectedPage ? "bg-work-surface" : "hover:bg-muted/60",
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
								{noteCount > 0 && (
									<span className="text-xs text-muted-foreground">
										{noteCount} notes
									</span>
								)}
								<span className="line-clamp-2 text-sm leading-6 text-muted-foreground">
									{pageDescription(page)}
								</span>
								<span className="text-xs text-muted-foreground">
									Last seen {dateLabel(page.lastSeen)} Evidence:{" "}
									{page.evidenceKinds
										.map((kind) => pageEvidenceLabels[kind])
										.join(", ")}
								</span>
							</span>
						</button>
					</li>
				);
			})}
		</ul>
		<PageReader
			key={`${selected.url}-${selected.sources[0]?.id}`}
			page={selected}
		/>
	</div>
);
