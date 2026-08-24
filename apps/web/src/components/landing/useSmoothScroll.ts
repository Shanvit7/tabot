import Lenis from "lenis";
import { useEffect } from "react";

export const useSmoothScroll = () => {
	useEffect(() => {
		const lenis = new Lenis({ autoRaf: true });
		return () => lenis.destroy();
	}, []);
};
