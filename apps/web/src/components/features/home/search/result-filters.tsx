import {
	type SearchResultKind,
	searchResultKinds,
} from "~/components/features/home/search/result-kinds";
import FluidTabs from "~/components/ui/motion/tabs/fluid-tabs";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export const SearchResultFilters = ({
	kind,
	onKindChange,
	period,
	periods,
	counts,
	onPeriodChange,
}: {
	kind: SearchResultKind;
	onKindChange: (kind: SearchResultKind) => void;
	period: string;
	periods: readonly { id: string; label: string }[];
	counts: Record<SearchResultKind, number>;
	onPeriodChange: (value: string) => void;
}) => (
	<div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
		<FluidTabs
			activeIndex={searchResultKinds.indexOf(kind)}
			onActiveIndexChange={(index) => {
				const nextKind = searchResultKinds[index];
				if (nextKind) onKindChange(nextKind);
			}}
			className="mx-0 w-fit max-w-none justify-start"
		>
			<FluidTabs.List
				aria-label="Search result type"
				className="bg-work-raised"
			>
				{searchResultKinds.map((value) => {
					const count = counts[value];
					return (
						<FluidTabs.Tab
							key={value}
							label={count > 0 ? `${value} ${count}` : value}
							id={`search-tab-${value.toLowerCase()}`}
							aria-controls={`search-panel-${value.toLowerCase()}`}
							aria-label={count > 0 ? `${value}, ${count} results` : value}
							className="cursor-pointer text-work-ink"
						>
							{value}
							{count > 0 && (
								<span
									aria-hidden="true"
									className="ml-1 text-xs tabular-nums opacity-70"
								>
									{count}
								</span>
							)}
						</FluidTabs.Tab>
					);
				})}
			</FluidTabs.List>
		</FluidTabs>
		<div className="flex flex-wrap items-end gap-2">
			<Select value={period} onValueChange={onPeriodChange}>
				<SelectTrigger
					aria-label="Filter by time"
					className="h-10 w-36 border-input bg-background px-3 text-sm font-medium shadow-none"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="p-1.5">
					<SelectGroup>
						{periods.map((filter) => (
							<SelectItem
								key={filter.id}
								value={filter.id}
								className="py-2 text-sm"
							>
								{filter.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	</div>
);
