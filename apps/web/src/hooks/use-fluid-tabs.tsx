import type { ReactNode } from "react";
import { use, useMemo } from "react";
import {
	FluidTabSlotContext,
	FluidTabsContext,
} from "~/hooks/fluid-tabs-context";

export const useFluidTabs = () => {
	const context = use(FluidTabsContext);
	if (!context)
		throw new Error("FluidTabs primitives must be used within <FluidTabs>.");
	return context;
};

export const useFluidTabSlot = () => {
	const context = use(FluidTabSlotContext);
	if (!context)
		throw new Error(
			"FluidTabs.Tab must be a direct child of <FluidTabs.List>.",
		);
	return context;
};

export const FluidTabSlot = ({
	index,
	children,
}: {
	index: number;
	children: ReactNode;
}) => {
	const value = useMemo(() => ({ index }), [index]);
	return (
		<FluidTabSlotContext.Provider value={value}>
			{children}
		</FluidTabSlotContext.Provider>
	);
};
