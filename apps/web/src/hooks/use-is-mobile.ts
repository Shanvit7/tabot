import { useEffect, useState } from "react";

export const useIsMobile = () => {
	const [isMobile, setIsMobile] = useState(false);
	const [isMobileDevice, setIsMobileDevice] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 768px)");
		const mobileDevice =
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|Mobile/i.test(
				navigator.userAgent,
			) ||
			(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
		const update = () => {
			setIsMobileDevice(mobileDevice);
			setIsMobile(mediaQuery.matches || mobileDevice);
			setIsLoading(false);
		};

		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return { isMobile, isMobileDevice, isLoading };
};
