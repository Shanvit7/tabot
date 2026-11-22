import { FileText, Globe2, StickyNote, TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { HomeEmptyState } from "~/components/features/home/components/empty-state";
import { HomeListSkeleton } from "~/components/features/home/components/list-skeleton";

const kinds = {
	Sites: {
		icon: Globe2,
		description: "Visited pages, grouped by website",
		skeleton: "sites",
	},
	Pages: {
		icon: FileText,
		description: "Individual pages you visited",
		skeleton: "pages",
	},
	Notes: {
		icon: StickyNote,
		description: "Notes you wrote and saved",
		skeleton: "notes",
	},
} as const;

const ResultError = ({
	kind,
	error,
	hasPrevious,
	onRetry,
}: {
	kind: string;
	error: string;
	hasPrevious: boolean;
	onRetry?: () => void;
}) => (
	<div
		role="alert"
		className="mb-3 rounded-xl border border-destructive/30 bg-background p-4"
	>
		<TriangleAlert
			aria-hidden="true"
			className="mb-3 size-5 text-destructive"
		/>
		<h3 className="text-sm font-medium">Couldn’t load {kind.toLowerCase()}</h3>
		<p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p>
		{hasPrevious && (
			<p className="mt-2 text-xs text-muted-foreground">
				Previous results remain below.
			</p>
		)}
		{onRetry && (
			<button
				type="button"
				onClick={onRetry}
				className="mt-2 min-h-11 cursor-pointer text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
			>
				Retry {kind.toLowerCase()}
			</button>
		)}
	</div>
);

const ResultHeader = ({
	id,
	kind,
	count,
	hasMore,
	showCount,
	compactHeading,
}: {
	id: string;
	kind: keyof typeof kinds;
	count: number;
	hasMore: boolean;
	showCount: boolean;
	compactHeading: boolean;
}) => {
	const { icon: Icon, description } = kinds[kind];
	const icon = (
		<Icon
			aria-hidden="true"
			className={
				compactHeading
					? "size-4 shrink-0 text-muted-foreground"
					: "size-4 text-muted-foreground"
			}
		/>
	);
	return (
		<header
			className={
				compactHeading
					? "mb-3 flex items-center gap-2"
					: "mb-4 border-b border-border pb-3"
			}
		>
			<h2
				id={id}
				className={
					compactHeading
						? "sr-only"
						: "flex items-center gap-2 text-base font-semibold"
				}
			>
				{!compactHeading && icon}
				{kind}
				{showCount && (
					<span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
						{count}
						{hasMore ? "+" : ""}
					</span>
				)}
			</h2>
			{compactHeading && icon}
			<p
				className={
					compactHeading
						? "text-xs leading-5 text-muted-foreground"
						: "mt-1 text-xs leading-5 text-muted-foreground"
				}
			>
				{description}
			</p>
		</header>
	);
};

export const HomeResultColumn = ({
	kind,
	count,
	hasMore = false,
	loading = false,
	error = "",
	onRetry,
	children,
	compactHeading = false,
}: {
	kind: keyof typeof kinds;
	count: number;
	hasMore?: boolean;
	loading?: boolean;
	error?: string;
	onRetry?: () => void;
	children?: ReactNode;
	compactHeading?: boolean;
}) => {
	const id = useId();
	const hasRows = count > 0 || (hasMore && !error);
	return (
		<section aria-labelledby={id} aria-busy={loading} className="min-w-0">
			<ResultHeader
				id={id}
				kind={kind}
				count={count}
				hasMore={hasMore}
				showCount={!compactHeading && !loading && !error}
				compactHeading={compactHeading}
			/>
			{loading ? (
				<HomeListSkeleton kind={kinds[kind].skeleton} count={3} />
			) : (
				<>
					{error && (
						<ResultError
							kind={kind}
							error={error}
							hasPrevious={count > 0}
							onRetry={onRetry}
						/>
					)}
					{hasRows
						? children
						: !error && (
								<HomeEmptyState kind={kind} compact={!compactHeading} />
							)}
				</>
			)}
		</section>
	);
};
