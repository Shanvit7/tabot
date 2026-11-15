import { createContext } from "react";

export type FluidTabsContextValue = {
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	focusedIndex: number;
	setFocusedIndex: (index: number) => void;
	indicatorLayoutId: string;
};

export const FluidTabsContext = createContext<FluidTabsContextValue | null>(
	null,
);

export type FluidTabSlotContextValue = {
	index: number;
};

export const FluidTabSlotContext =
	createContext<FluidTabSlotContextValue | null>(null);
