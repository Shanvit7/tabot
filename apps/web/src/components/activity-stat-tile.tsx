import type { Flame } from "lucide-react";

export const StatTile = ({
	icon: Icon,
	value,
	label,
	detail,
}: {
	icon: typeof Flame;
	value: string;
	label: string;
	detail: string;
}) => (
	<div className="rounded-lg border border-[#d2ddd2] bg-[#f5f8f4] p-4">
		<div className="flex items-center gap-2 text-[#476151]">
			<Icon aria-hidden="true" className="size-4" />
			<span className="text-xs font-medium uppercase tracking-wide">
				{label}
			</span>
		</div>
		<p className="mt-2 text-2xl font-semibold text-[#15251b]">{value}</p>
		<p className="mt-1 text-xs text-[#476151]">{detail}</p>
	</div>
);
