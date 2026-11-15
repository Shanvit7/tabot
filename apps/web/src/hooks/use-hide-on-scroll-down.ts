import { useEffect, useState } from "react";

export const useHideOnScrollDown = () => {
	const [hidden, setHidden] = useState(false);
	useEffect(() => {
		let last = window.scrollY;
		let frame = 0;
		const read = () => {
			frame = 0;
			const y = window.scrollY;
			// Ignore jitter so a paused scroll does not flicker the bar.
			if (Math.abs(y - last) < 8) return;
			setHidden(y > last && y > 80);
			last = y;
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(read);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);
	return hidden;
};
