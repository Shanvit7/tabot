import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { TabsList, TabsTrigger } from "~/components/ui/tabs";

export const SearchResultFilters = ({
	period,
	periods,
	onPeriodChange,
}: {
	period: string;
	periods: readonly { id: string; label: string }[];
	onPeriodChange: (value: string) => void;
}) => (
	<div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
		<TabsList variant="line" aria-label="Search result type">
			{(["Everything", "Pages", "Notes"] as const).map((value) => (
				<TabsTrigger
					key={value}
					value={value}
					className="focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					{value}
				</TabsTrigger>
			))}
		</TabsList>
		<Select value={period} onValueChange={onPeriodChange}>
			<SelectTrigger
				aria-label="Filter by time"
				className="h-9 w-36 border-0 bg-transparent shadow-none"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{periods.map((filter) => (
						<SelectItem key={filter.id} value={filter.id}>
							{filter.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	</div>
);
