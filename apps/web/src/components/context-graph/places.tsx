export const Places = ({
	items,
}: {
	items: Array<{ key: string; name: string; note: string }>;
}) => (
	<>
		<p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f8f78]">
			Where you went
		</p>
		<ul className="mt-2 space-y-1.5">
			{items.map((item) => (
				<li
					key={item.key}
					className="flex items-baseline justify-between gap-3 text-sm"
				>
					<span className="truncate text-[#e8f3e8]">{item.name}</span>
					<span className="shrink-0 text-xs text-[#7d9c86]">{item.note}</span>
				</li>
			))}
		</ul>
	</>
);
