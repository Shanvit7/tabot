import {
	differenceInCalendarMonths,
	format,
	startOfDay,
	startOfMonth,
} from "date-fns";
import {
	CalendarDays,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { type DateRange, DayPicker } from "react-day-picker";
import { Button, buttonVariants } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export type TimestampRange = { from: number; to: number };

type DatePickerProps = {
	value: TimestampRange | null;
	minTimestamp: number | null;
	maxTimestamp: number | null;
	disabled?: boolean;
	onChange: (range: TimestampRange) => void;
};

const timeValue = (timestamp: number) =>
	format(new Date(timestamp), "HH:mm:ss");
const sameDay = (first: number, second: number) =>
	format(new Date(first), "yyyy-MM-dd") ===
	format(new Date(second), "yyyy-MM-dd");
const withTime = (timestamp: number, value: string, endOfSecond = false) => {
	const [hours, minutes, seconds] = value.split(":").map(Number);
	const date = new Date(timestamp);
	date.setHours(hours, minutes, seconds, endOfSecond ? 999 : 0);
	return date.getTime();
};
const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const DatePicker = ({
	value,
	minTimestamp,
	maxTimestamp,
	disabled = false,
	onChange,
}: DatePickerProps) => {
	const [open, setOpen] = useState(false);
	const [draftRange, setDraftRange] = useState<DateRange>();
	const minimum = minTimestamp === null ? undefined : new Date(minTimestamp);
	const maximum = maxTimestamp === null ? undefined : new Date(maxTimestamp);
	const selected: DateRange | undefined = value
		? { from: new Date(value.from), to: new Date(value.to) }
		: undefined;
	const range = draftRange ?? selected;
	const fromTime = value ? timeValue(value.from) : "00:00:00";
	const toTime = value ? timeValue(value.to) : "23:59:59";
	const fromTimeMin =
		value && minimum && sameDay(value.from, minimum.getTime())
			? timeValue(minimum.getTime())
			: "00:00:00";
	const fromTimeMax =
		value && maximum && sameDay(value.from, maximum.getTime())
			? timeValue(Math.min(value.to, maximum.getTime()))
			: value && sameDay(value.from, value.to)
				? toTime
				: "23:59:59";
	const toTimeMin =
		value && minimum && sameDay(value.to, minimum.getTime())
			? timeValue(Math.max(value.from, minimum.getTime()))
			: value && sameDay(value.from, value.to)
				? fromTime
				: "00:00:00";
	const toTimeMax =
		value && maximum && sameDay(value.to, maximum.getTime())
			? timeValue(maximum.getTime())
			: "23:59:59";
	const updateStartTime = (time: string) => {
		if (!value) return;
		const min =
			minimum && sameDay(value.from, minimum.getTime())
				? minimum.getTime()
				: Number.NEGATIVE_INFINITY;
		const max = Math.min(
			value.to,
			maximum && sameDay(value.from, maximum.getTime())
				? maximum.getTime()
				: Number.POSITIVE_INFINITY,
		);
		onChange({ ...value, from: clamp(withTime(value.from, time), min, max) });
	};
	const updateEndTime = (time: string) => {
		if (!value) return;
		const min = Math.max(
			value.from,
			minimum && sameDay(value.to, minimum.getTime())
				? minimum.getTime()
				: Number.NEGATIVE_INFINITY,
		);
		const max =
			maximum && sameDay(value.to, maximum.getTime())
				? maximum.getTime()
				: Number.POSITIVE_INFINITY;
		onChange({ ...value, to: clamp(withTime(value.to, time, true), min, max) });
	};

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setDraftRange(nextOpen ? selected : undefined);
				setOpen(nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					aria-label={
						value
							? `Date and time range: ${format(new Date(value.from), "MMM d, yyyy h:mm:ss a")} to ${format(new Date(value.to), "MMM d, yyyy h:mm:ss a")}`
							: "Choose date and time range"
					}
					aria-haspopup="dialog"
					className="min-w-64 max-w-full justify-start"
					disabled={disabled}
					variant="outline"
				>
					<CalendarDays aria-hidden="true" data-icon="inline-start" />
					<span className="min-w-0 flex-1 truncate">
						{value
							? `${format(new Date(value.from), "MMM d, yyyy h:mm a")} – ${format(new Date(value.to), "MMM d, yyyy h:mm a")}`
							: "Date and time range"}
					</span>
					<ChevronDown aria-hidden="true" data-icon="inline-end" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="max-h-[80vh] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
			>
				<div className="flex flex-col gap-3 p-3">
					<DayPicker
						mode="range"
						selected={range}
						onSelect={(nextRange) => {
							setDraftRange(nextRange);
							if (!nextRange?.from || !nextRange.to) return;
							const start = startOfDay(nextRange.from).getTime();
							const endDate = new Date(nextRange.to);
							endDate.setHours(23, 59, 59, 999);
							const from = clamp(
								start,
								minTimestamp ?? Number.NEGATIVE_INFINITY,
								maxTimestamp ?? Number.POSITIVE_INFINITY,
							);
							const to = clamp(
								endDate.getTime(),
								minTimestamp ?? Number.NEGATIVE_INFINITY,
								maxTimestamp ?? Number.POSITIVE_INFINITY,
							);
							if (from <= to) onChange({ from, to });
							setOpen(false);
						}}
						disabled={[
							...(minimum ? [{ before: startOfDay(minimum) }] : []),
							...(maximum ? [{ after: startOfDay(maximum) }] : []),
						]}
						startMonth={minimum ? startOfMonth(minimum) : undefined}
						endMonth={maximum ? startOfMonth(maximum) : undefined}
						defaultMonth={range?.from ?? minimum ?? maximum}
						numberOfMonths={
							minimum && maximum
								? Math.min(2, differenceInCalendarMonths(maximum, minimum) + 1)
								: 2
						}
						className="w-fit rounded-lg border [--cell-size:2.25rem]"
						classNames={{
							root: "w-fit p-2",
							months: "relative flex flex-col gap-4 md:flex-row",
							month: "flex w-full flex-col gap-4",
							nav: "absolute inset-x-0 top-0 flex items-center justify-between gap-1",
							button_previous: cn(
								buttonVariants({ variant: "ghost", size: "icon" }),
								"size-9",
							),
							button_next: cn(
								buttonVariants({ variant: "ghost", size: "icon" }),
								"size-9",
							),
							month_caption: "flex h-9 items-center justify-center px-9",
							caption_label: "text-sm font-medium",
							month_grid: "w-full border-collapse",
							weekdays: "flex",
							weekday:
								"flex-1 rounded-md text-center text-xs font-normal text-muted-foreground",
							week: "mt-2 flex w-full",
							day: "relative size-(--cell-size) p-0 text-center",
							range_start: "rounded-l-md bg-muted",
							range_middle: "rounded-none bg-muted",
							range_end: "rounded-r-md bg-muted",
							day_button:
								"size-(--cell-size) rounded-md text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							today: "bg-muted text-foreground",
							outside: "text-muted-foreground",
							disabled: "text-muted-foreground opacity-40",
							hidden: "invisible",
						}}
						components={{
							Chevron: ({ orientation, className, ...props }) => {
								const Icon =
									orientation === "left"
										? ChevronLeft
										: orientation === "right"
											? ChevronRight
											: ChevronDown;
								return <Icon className={className} {...props} />;
							},
							DayButton: ({ className, day, modifiers, ...props }) => (
								<Button
									{...props}
									aria-pressed={modifiers.selected}
									className={cn(
										"size-(--cell-size) p-0 font-normal",
										(modifiers.range_start || modifiers.range_end) &&
											"bg-primary text-primary-foreground",
										modifiers.range_middle && "rounded-none bg-muted",
										modifiers.today && !modifiers.selected && "bg-muted",
										className,
									)}
									data-day={day.date.toLocaleDateString()}
									data-range-end={modifiers.range_end}
									data-range-middle={modifiers.range_middle}
									data-range-start={modifiers.range_start}
									variant="ghost"
								/>
							),
						}}
					/>
					<div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							Start time
							<input
								aria-label="Start time"
								className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
								disabled={!value || disabled}
								max={fromTimeMax}
								min={fromTimeMin}
								onChange={(event) => updateStartTime(event.currentTarget.value)}
								step="1"
								type="time"
								value={fromTime}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							End time
							<input
								aria-label="End time"
								className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
								disabled={!value || disabled}
								max={toTimeMax}
								min={toTimeMin}
								onChange={(event) => updateEndTime(event.currentTarget.value)}
								step="1"
								type="time"
								value={toTime}
							/>
						</label>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};
