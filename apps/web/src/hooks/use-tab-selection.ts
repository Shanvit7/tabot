import { useCallback, useState } from "react";

export const useTabSelection = ({
	defaultActiveIndex = 0,
	activeIndex: activeIndexProp,
	onActiveIndexChange,
}: {
	defaultActiveIndex?: number;
	activeIndex?: number;
	onActiveIndexChange?: (index: number) => void;
}) => {
	const [uncontrolledIndex, setUncontrolledIndex] =
		useState(defaultActiveIndex);
	const [keyboardFocusIndex, setKeyboardFocusIndex] = useState<number | null>(
		null,
	);
	const activeIndex = activeIndexProp ?? uncontrolledIndex;
	const focusedIndex =
		keyboardFocusIndex ?? (activeIndex >= 0 ? activeIndex : 0);

	const setActiveIndex = useCallback(
		(index: number) => {
			onActiveIndexChange?.(index);
			if (activeIndexProp === undefined) setUncontrolledIndex(index);
			setKeyboardFocusIndex(null);
		},
		[activeIndexProp, onActiveIndexChange],
	);

	const setFocusedIndex = useCallback((index: number) => {
		setKeyboardFocusIndex(index);
	}, []);

	return { activeIndex, setActiveIndex, focusedIndex, setFocusedIndex };
};
