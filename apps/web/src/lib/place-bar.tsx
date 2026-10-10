// Runtime-computed width: the only reason this uses `style`.
export const Bar = ({
	ratio,
	className,
}: {
	ratio: number;
	className: string;
}) => (
	<span className="block h-1.5 overflow-hidden rounded-full bg-[#16231c]">
		<span
			className={`block h-full rounded-full ${className}`}
			style={{ width: `${Math.max(6, Math.round(ratio * 100))}%` }}
		/>
	</span>
);
