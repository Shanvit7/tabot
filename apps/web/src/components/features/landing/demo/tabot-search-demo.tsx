import { ChevronDown, Search, Settings } from "lucide-react";
import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	useCurrentFrame,
} from "remotion";
import { DemoCursor } from "~/components/features/assistant/chatgpt-tutorial/primitives";
import { getTypedText } from "~/components/features/assistant/chatgpt-tutorial/timeline";
import { searchResultKinds } from "~/components/features/home/search/result-kinds";
import { searchPeriods } from "~/components/features/home/search/result-section/types";
import {
	approxTimeSpentLabel,
	dateLabel,
	urlLabel,
} from "~/components/features/home/search/utils";
import {
	NOTE_PAGE,
	NOTE_SEARCH_QUERY,
	NOTE_TEXT,
} from "~/components/features/landing/demo/notes-demo-data";
import {
	getTabotSearchStage,
	SEARCH_QUERY,
	TABOT_SEARCH_COUNTS,
	TABOT_SEARCH_RESULTS,
} from "~/components/features/landing/demo/paired-search-demo-data";
import { LOGO_URL } from "~/lib/constants";

export const TabotSearchComposition = ({
	notes = false,
}: {
	notes?: boolean;
}) => {
	const frame = useCurrentFrame();
	const stage = getTabotSearchStage(frame);
	const searchQuery = notes ? NOTE_SEARCH_QUERY : SEARCH_QUERY;
	const query = getTypedText(searchQuery, frame, 18, 100);
	const counts = notes
		? { Everything: 1, Sites: 0, Pages: 0, Notes: 1 }
		: TABOT_SEARCH_COUNTS;
	const selectedTab = interpolate(frame, [175, 205], [0, notes ? 3 : 2], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.inOut(Easing.cubic),
	});
	const introHeight = interpolate(frame, [125, 170], [430, 165], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.inOut(Easing.cubic),
	});
	const resultsOpacity = interpolate(frame, [130, 160], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const menuOpacity = interpolate(frame, [224, 234, 282, 296], [0, 1, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const period = stage === "pages" ? searchPeriods[2] : searchPeriods[0];

	return (
		<AbsoluteFill aria-hidden="true" className="bg-background text-foreground">
			<header className="flex h-16 items-center justify-between border-b border-border px-10">
				<div className="flex items-center gap-2">
					<Img
						src={LOGO_URL}
						alt=""
						width={28}
						height={28}
						className="size-7 object-contain"
					/>
					<span className="text-base font-semibold">tabot</span>
				</div>
				<Settings aria-hidden="true" className="size-5 text-muted-foreground" />
			</header>
			<main className="mx-auto max-w-5xl px-10">
				<section
					className="mx-auto flex max-w-2xl flex-col justify-center"
					style={{ height: introHeight }}
				>
					<h1 className="mb-6 text-center text-2xl font-medium tracking-tight">
						Find your way back to
						<span className="ml-1 inline-grid text-left font-semibold underline decoration-primary decoration-2 underline-offset-4">
							{/* Reserve both states so centered heading stays still while typing. */}
							<span
								aria-hidden="true"
								className="invisible col-start-1 row-start-1"
							>
								{`“${searchQuery}”`}
							</span>
							<span
								aria-hidden="true"
								className="invisible col-start-1 row-start-1"
							>
								a page you visited
							</span>
							<span className="col-start-1 row-start-1">
								{query ? `“${query}”` : "a page you visited"}
							</span>
						</span>
					</h1>
					<div className="relative flex h-14 items-center gap-2 border-b border-input bg-background p-1.5 focus-within:border-work-ink">
						<Search
							aria-hidden="true"
							className="ml-2 size-4 shrink-0 text-muted-foreground"
						/>
						<span
							className={`flex-1 px-1 text-base ${query ? "" : "text-muted-foreground"}`}
						>
							{query || "Try a site name, page title, or date"}
						</span>
						<DemoCursor at={18} className="left-12 top-4" />
					</div>
				</section>
				<section
					aria-label={notes ? "Matching saved notes" : "Matching Tabot pages"}
					className="mt-4"
					style={{ opacity: resultsOpacity }}
				>
					<div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
						<div className="relative grid w-[22rem] max-w-full grid-cols-4 rounded-full bg-work-raised p-1 shadow-sm">
							<div
								aria-hidden="true"
								className="absolute inset-y-1 left-1 w-1/4 rounded-full bg-background shadow-sm"
								style={{ transform: `translateX(${selectedTab * 100}%)` }}
							/>
							{searchResultKinds.map((kind) => (
								<span
									key={kind}
									className="relative z-10 flex min-h-10 items-center justify-center gap-1 px-2 text-sm text-work-ink"
								>
									{kind}
									{counts[kind] > 0 && (
										<span className="text-xs tabular-nums opacity-70">
											{counts[kind]}
										</span>
									)}
								</span>
							))}
							<DemoCursor
								at={177}
								className={notes ? "left-[18rem] top-4" : "left-[12rem] top-4"}
							/>
						</div>
						<div className="relative">
							<div className="flex h-10 w-36 items-center justify-between rounded-md border border-input bg-background px-3 text-sm font-medium">
								<span>{period.label}</span>
								<ChevronDown
									aria-hidden="true"
									className="size-4 text-muted-foreground"
								/>
							</div>
							<div
								className="absolute right-0 top-12 z-20 w-44 rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg"
								style={{
									opacity: menuOpacity,
									transform: `translateY(${(1 - menuOpacity) * -5}px)`,
								}}
							>
								{searchPeriods.map((option) => (
									<span
										key={option.id}
										className={`block rounded px-3 py-2 ${option.id === (frame >= 282 ? "week" : "today") ? "bg-muted font-medium" : "text-muted-foreground"}`}
									>
										{option.label}
									</span>
								))}
								<DemoCursor at={232} className="right-8 top-28" />
							</div>
						</div>
					</div>
					<ul className="relative flex flex-col gap-2">
						{notes ? (
							<li
								className="relative flex min-h-28 flex-col items-start gap-2 rounded-lg border border-border bg-work-surface p-3"
								style={{
									opacity: interpolate(frame, [300, 325], [0, 1], {
										extrapolateLeft: "clamp",
										extrapolateRight: "clamp",
									}),
									translate: `0 ${interpolate(frame, [300, 325], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
								}}
							>
								<div className="flex w-full items-center justify-between text-xs text-muted-foreground">
									<span className="flex items-center gap-2">
										<span className="grid size-6 place-items-center rounded border border-border bg-background font-semibold">
											A
										</span>
										{NOTE_PAGE.host}
									</span>
									<span className="tabular-nums">
										{dateLabel(NOTE_PAGE.updatedAt)}
									</span>
								</div>
								<p className="text-sm leading-5">{NOTE_TEXT}</p>
								<span className="text-xs text-muted-foreground underline underline-offset-4">
									{NOTE_PAGE.title}
								</span>
							</li>
						) : (
							TABOT_SEARCH_RESULTS.map((page, index) => {
								const rowProgress = interpolate(
									frame,
									[300 + index * 18, 325 + index * 18],
									[0, 1],
									{
										extrapolateLeft: "clamp",
										extrapolateRight: "clamp",
									},
								);
								const timeSpent = approxTimeSpentLabel(page.estimatedActiveMs);

								return (
									<li
										key={page.url}
										className="relative flex min-h-28 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-work-surface p-3"
										style={{
											opacity: rowProgress,
											transform: `translateY(${(1 - rowProgress) * 8}px)`,
										}}
									>
										<span className="flex min-w-0 items-center gap-2">
											<span className="flex size-6 shrink-0 items-center justify-center rounded border border-border bg-background text-xs font-semibold">
												A
											</span>
											<span className="truncate text-xs text-muted-foreground underline underline-offset-4">
												{page.host}
											</span>
										</span>
										<span className="w-full truncate text-sm font-medium underline underline-offset-4">
											{urlLabel(page)}
										</span>
										<p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
											{page.excerpt}
										</p>
										<span className="mt-auto text-xs tabular-nums text-muted-foreground">
											{dateLabel(page.lastSeen)}
											{timeSpent ? ` · ${timeSpent}` : ""}
										</span>
									</li>
								);
							})
						)}
					</ul>
				</section>
			</main>
		</AbsoluteFill>
	);
};
