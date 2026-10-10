import type { ReactNode } from "react";

export const Panel = ({
	kicker,
	title,
	onClose,
	children,
}: {
	kicker: string;
	title: string;
	onClose: () => void;
	children: ReactNode;
}) => (
	<div className="min-w-0 rounded-lg border border-[#2f4738] bg-[#101d15] p-5 [overflow-wrap:anywhere]">
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#bfff00]">
					{kicker}
				</p>
				<h3 className="mt-1 break-words text-xl font-semibold text-[#f2f8f2]">
					{title}
				</h3>
			</div>
			<button
				type="button"
				onClick={onClose}
				className="grid size-11 shrink-0 place-items-center rounded text-lg leading-none text-[#8fae95] hover:text-[#e8f3e8] focus-visible:outline-2 focus-visible:outline-[#bfff00]"
				aria-label="Close details"
			>
				×
			</button>
		</div>
		{children}
	</div>
);
