import { useEffect, useRef } from "react";
import { trackLandingAction } from "~/lib/telemetry";

export const useLandingPageEndTracking = () => {
	const sentinel = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const target = sentinel.current;
		if (!target) return;
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry?.isIntersecting) return;
			trackLandingAction({ name: "landing_page_end_reached" });
			observer.disconnect();
		});
		observer.observe(target);
		return () => observer.disconnect();
	}, []);
	return sentinel;
};
