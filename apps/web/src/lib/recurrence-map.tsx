import { type ReactNode, useMemo } from "react";
import { prettySite } from "~/lib/context-graph-data";
import {
	buildMemoryMap,
	type MemoryInput,
	type MemoryRow,
} from "~/lib/memory-map";
import { cellClass } from "~/lib/recurrence-cell";
import { Favicon } from "~/lib/recurrence-favicon";
import { Legend } from "~/lib/recurrence-legend";
import { OriginChip } from "~/lib/recurrence-origin-chip";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const dayLabel = (ms: number) => {
	const date = new Date(ms);
	return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
};

const labelOf = (row: MemoryRow) =>
	prettySite(row.origins[0] ?? "") || "Observed pattern";

export const RecurrenceMap = ({
	memories,
	favicons,
	selectedId,
	onSelect,
	selectedActions,
}: {
	memories: MemoryInput[];
	favicons?: Map<string, string>;
	selectedId: string;
	onSelect: (id: string) => void;
	selectedActions?: ReactNode;
}) => {
	const map = useMemo(() => buildMemoryMap(memories), [memories]);
	const busiest = useMemo(
		() => Math.max(1, ...map.rows.flatMap((row) => row.days)),
		[map],
	);
	return (
		<div className="overflow-x-auto rounded-xl border border-[#d2ddd2] bg-white">
			<div
				className={`p-4 sm:p-6 ${selectedActions ? "min-w-[960px]" : "min-w-[720px]"}`}
			>
				<div className="mb-4 flex items-baseline justify-between gap-4">
					<h2 className="text-xl font-semibold">Recurrence</h2>
					<p className="work-meta text-[#476151]">
						{dayLabel(map.axis[0])} – {dayLabel(map.axis[map.axis.length - 1])}
					</p>
				</div>
				<ul className="m-0 list-none p-0">
					{map.rows.map((row) => (
						<li
							key={row.id}
							className={`flex items-center border-t border-[#e9eee8] ${row.id === selectedId ? "bg-[#f5f8f4]" : ""}`}
						>
							<button
								type="button"
								onClick={() => onSelect(row.id)}
								aria-pressed={row.id === selectedId}
								className={`grid min-w-0 flex-1 grid-cols-[minmax(150px,1fr)_auto_minmax(120px,auto)] items-center gap-4 border-l-2 px-2 py-3 text-left transition-colors ${
									row.id === selectedId
										? "border-[#bfff00] bg-[#f5f8f4]"
										: "border-transparent hover:bg-[#f8faf7]"
								}`}
							>
								<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span className="work-meta text-[#8fae95]">
										{String(row.index + 1).padStart(2, "0")}
									</span>
									<Favicon
										origin={row.origins[0] ?? ""}
										favicons={favicons}
										className="size-5"
									/>
									<span className="text-sm font-semibold">{labelOf(row)}</span>
									<span className="flex flex-wrap items-center gap-2">
										{row.origins.slice(1).map((origin) => (
											<OriginChip
												key={origin}
												origin={origin}
												favicons={favicons}
											/>
										))}
									</span>
								</span>
								<span
									className="grid gap-[3px]"
									style={{
										gridTemplateColumns: `repeat(${map.axis.length}, 10px)`,
									}}
								>
									{row.days.map((count, slot) => (
										<span
											key={map.axis[slot]}
											title={`${dayLabel(map.axis[slot])} · ${
												count === 1 ? "1 period" : `${count} periods`
											}`}
											className={`h-4 rounded-[3px] ${cellClass(count)}`}
										/>
									))}
								</span>
								<span className="work-meta text-right text-[#476151]">
									{row.occurrenceCount}
									{row.occurrenceCount === 1 ? " period" : " periods"}
									<span className="block text-[#8fae95]">
										last {dayLabel(row.lastSeen)}
									</span>
								</span>
							</button>
							{row.id === selectedId && selectedActions && (
								<nav
									aria-label="Selected pattern actions"
									className="flex shrink-0 items-center gap-2 pr-2"
								>
									{selectedActions}
								</nav>
							)}
						</li>
					))}
				</ul>
				<p className="work-meta mt-4 flex items-center gap-2 text-[#8fae95]">
					<Legend busiest={busiest} />
					each square is a day
				</p>
			</div>
		</div>
	);
};
