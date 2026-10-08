import type { ReactNode } from "react";

export const Remark = ({ children }: { children: ReactNode }) => (
	<p className="mt-3 rounded-md border-l-2 border-[#bfff00] bg-[#16271c] px-3 py-2 text-sm leading-6 text-[#dff0e2]">
		{children}
	</p>
);
