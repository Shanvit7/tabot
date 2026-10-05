import { cellClass } from "~/lib/recurrence-cell";

export const Legend = ({ busiest }: { busiest: number }) => (
	<span className="flex items-center gap-1">
		{[...new Set([0, 1, 2, busiest])].map((count) => (
			<span
				key={count}
				className={`inline-block size-3 rounded-[3px] ${cellClass(count)}`}
			/>
		))}
		<span className="mr-1">few → many,</span>
	</span>
);
