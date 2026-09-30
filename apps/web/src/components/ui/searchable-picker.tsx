import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "~/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";

type Option = { value: string; label: string; keywords?: string[] };

type SearchablePickerProps = {
	label: string;
	value: string;
	options: Option[];
	onChange: (value: string) => void;
};

export const SearchablePicker = ({
	label,
	value,
	options,
	onChange,
}: SearchablePickerProps) => {
	const [open, setOpen] = useState(false);
	const id = useId();
	const listId = `${id}-list`;
	const current = options.find((option) => option.value === value);
	return (
		<div className="mt-4 max-w-md">
			<span id={id} className="block text-sm font-medium">
				{label}
			</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						role="combobox"
						aria-expanded={open}
						aria-controls={open ? listId : undefined}
						aria-labelledby={id}
						className="work-field mt-2 flex w-full items-center justify-between gap-2 text-left"
					>
						<span className="min-w-0 truncate">
							{current?.label ?? "Unavailable"}
						</span>
						<ChevronsUpDown
							aria-hidden="true"
							className="size-4 shrink-0 text-[#476151]"
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent
					id={listId}
					role="listbox"
					align="start"
					className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] border-[#d2ddd2] bg-white p-0 text-[#15251b]"
				>
					<Command className="bg-white text-[#15251b]">
						<CommandInput
							aria-label={`Search ${label.toLowerCase()}`}
							placeholder={`Search ${label.toLowerCase()}…`}
							className="placeholder:text-[#476151]"
						/>
						<CommandList>
							<CommandEmpty>No matches found.</CommandEmpty>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									value={option.value}
									keywords={[option.label, ...(option.keywords ?? [])]}
									onSelect={() => {
										onChange(option.value);
										setOpen(false);
									}}
									className="min-h-11 gap-2 break-all data-[selected=true]:bg-[#e9eee8] data-[selected=true]:text-[#15251b]"
								>
									<Check
										aria-hidden="true"
										className={`size-4 shrink-0 ${value === option.value ? "opacity-100" : "opacity-0"}`}
									/>
									{option.label}
								</CommandItem>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
};
