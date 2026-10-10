// Single-hue ramp: empty → rare → repeated → routine. No inline styles.
export const cellClass = (count: number) =>
	count === 0
		? "bg-[#e9eee8]"
		: count === 1
			? "bg-[#b7d1be]"
			: count === 2
				? "bg-[#7fa98d]"
				: "bg-[#3f6b50]";
