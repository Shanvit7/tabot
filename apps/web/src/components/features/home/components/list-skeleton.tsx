import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import { Skeleton } from "~/components/ui/skeleton";
import "~/components/features/home/components/list-skeleton.css";

type Kind = "sites" | "pages" | "notes";

export const HomeListSkeleton = ({
	kind,
	count = 3,
	className,
}: {
	kind: Kind;
	count?: number;
	className?: string;
}) => {
	const fallback = (
		<div aria-hidden="true" className="flex flex-col gap-3">
			{["first", "second", "third"].slice(0, count).map((key) =>
				kind === "sites" ? (
					<div
						key={key}
						className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-work-surface px-4 py-3"
					>
						<Skeleton className="size-10 shrink-0 rounded-full" />
						<div className="flex-1">
							<Skeleton className="mb-2 h-4 w-2/5" />
							<Skeleton className="h-3 w-1/3" />
						</div>
						<Skeleton className="hidden h-3 w-16 sm:block" />
					</div>
				) : kind === "pages" ? (
					<div
						key={key}
						className="flex min-h-28 flex-col gap-2 rounded-lg border border-border bg-work-surface p-3"
					>
						<div className="flex items-center gap-2">
							<Skeleton className="size-5 rounded-full" />
							<Skeleton className="h-3 w-1/3" />
						</div>
						<Skeleton className="h-4 w-4/5" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-2/3" />
					</div>
				) : (
					<div key={key} className="rounded-xl border border-border p-4">
						<div className="mb-3 flex items-center justify-between">
							<Skeleton className="h-3 w-1/4" />
							<Skeleton className="h-3 w-16" />
						</div>
						<Skeleton className="mb-2 h-4 w-full" />
						<Skeleton className="h-4 w-3/5" />
					</div>
				),
			)}
		</div>
	);

	return (
		<div
			role="status"
			aria-label={`Loading ${kind}`}
			className="home-list-skeleton"
		>
			<BoneyardSkeleton
				name={`home-${kind}-list`}
				loading
				animate="shimmer"
				boneClass="home-list-skeleton-bone"
				className={className}
				fallback={fallback}
				fixture={fallback}
			>
				<div aria-hidden="true" />
			</BoneyardSkeleton>
		</div>
	);
};
