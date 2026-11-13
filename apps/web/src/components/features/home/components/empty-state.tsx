import { Globe2, NotebookPen, SearchX, StickyNote } from "lucide-react";
import type { SearchResultKind } from "~/components/features/home/search/result-kinds";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";

const copy: Record<
	SearchResultKind,
	{ title: string; description: string; icon: typeof SearchX }
> = {
	Everything: {
		title: "No activity matches this search",
		description:
			"Try different words or choose a wider time range. Tabot searches your sites, pages, and notes together.",
		icon: SearchX,
	},
	Sites: {
		title: "No sites match this search",
		description:
			"Try another site name, or widen the time range to look further back.",
		icon: Globe2,
	},
	Pages: {
		title: "No pages match this search",
		description:
			"Search with part of a page title or address, or choose a wider time range.",
		icon: NotebookPen,
	},
	Notes: {
		title: "No notes match this search",
		description:
			"Try different words, or search Everything to find pages where you may have saved a note.",
		icon: StickyNote,
	},
};

const EmptyResultsIllustration = () => (
	<svg
		aria-hidden="true"
		viewBox="0 0 240 160"
		className="h-36 w-56"
		fill="none"
		role="presentation"
	>
		<ellipse cx="120" cy="139" rx="79" ry="9" className="fill-work-ink/5" />
		{/* Empty tray: solid floor, rear walls, then front walls. */}
		<g className="stroke-work-line" strokeWidth="1.5" strokeLinejoin="round">
			<path d="m48 96 72-36 72 36-72 36z" className="fill-work-surface" />
			<path d="M48 74 120 38v22L48 96Z" className="fill-work-raised" />
			<path d="m120 38 72 36v22l-72-36z" className="fill-work-line" />
			{/* Continuous folded rim catches light around the opening. */}
			<path
				d="m48 74 72-36 72 36-5 3-67-33-67 33z"
				className="fill-work-canvas"
			/>
			{/* Thumb cutout makes the open document tray recognizable. */}
			<path
				d="m48 74 24 12 5 10 19 10 5-5 19 9v26l-72-36z"
				className="fill-work-raised"
			/>
			<path d="m120 110 72-36v26l-72 36z" className="fill-work-line" />
			<path d="m48 74 24 12m29 15 19 9 72-36" className="stroke-work-canvas" />
			{/* Recessed label holder on the tray's front face. */}
			<path d="m65 100 32 16v8l-32-16z" className="fill-work-canvas" />
		</g>
		{/* Magnifier: shaded rim, opaque lens, and a clear no-match mark. */}
		<path
			d="m188 76 23 23"
			className="stroke-work-muted"
			strokeWidth="11"
			strokeLinecap="round"
		/>
		<path
			d="m192 78 20 20"
			className="stroke-work-ink"
			strokeWidth="7"
			strokeLinecap="round"
		/>
		<circle cx="171" cy="59" r="29" className="fill-work-muted" />
		<circle
			cx="171"
			cy="55"
			r="29"
			className="fill-work-line stroke-work-muted"
			strokeWidth="1.5"
		/>
		<circle
			cx="171"
			cy="55"
			r="23"
			className="fill-work-canvas stroke-work-muted"
			strokeWidth="1.5"
		/>
		<path
			d="M155 49a17 17 0 0 1 16-11"
			className="stroke-work-raised"
			strokeWidth="3"
			strokeLinecap="round"
		/>
		<path
			d="m165 49 12 12m0-12-12 12"
			className="stroke-work-muted"
			strokeWidth="2.5"
			strokeLinecap="round"
		/>
	</svg>
);

export const HomeEmptyState = ({
	kind,
	compact = false,
}: {
	kind: SearchResultKind;
	compact?: boolean;
}) => {
	const { title, description, icon: Icon } = copy[kind];
	if (compact)
		return (
			<Empty className="min-h-28 gap-2 rounded-lg border border-dashed border-border bg-work-surface/50 px-3 py-5">
				<EmptyMedia variant="icon" className="mb-0">
					<Icon aria-hidden="true" />
				</EmptyMedia>
				<EmptyHeader className="gap-1">
					<EmptyTitle className="text-foreground">{title}</EmptyTitle>
					<EmptyDescription className="text-xs">{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	return (
		<Empty className="min-h-72 gap-3 rounded-2xl border border-dashed border-border bg-work-surface/40 px-6 py-7 sm:py-9">
			<EmptyMedia className="mb-0">
				<EmptyResultsIllustration />
			</EmptyMedia>
			<EmptyHeader className="gap-2">
				<EmptyTitle className="text-base text-foreground sm:text-lg">
					{title}
				</EmptyTitle>
				<EmptyDescription className="max-w-md">{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
};
