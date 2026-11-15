import { useEffect, useState } from "react";
import { InstallLink } from "~/components/features/landing/install/install-link";
import { CHROME_WEB_STORE_URL } from "~/lib/constants";

const storeUrl = CHROME_WEB_STORE_URL;
type InstallLinkProps = { connected: boolean; mobile: boolean };

export const MobileInstallBar = ({ connected, mobile }: InstallLinkProps) => {
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const target = document.getElementById("hero-install");
		if (!target) return;
		const observer = new IntersectionObserver(([entry]) => {
			setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
		});
		observer.observe(target);
		return () => observer.disconnect();
	}, []);
	return visible && (connected || storeUrl) ? (
		<aside
			aria-label="Install Tabot"
			className="fixed inset-x-0 bottom-0 z-30 border-t border-work-line bg-white px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden [&>button]:w-full"
		>
			<InstallLink connected={connected} mobile={mobile} />
		</aside>
	) : null;
};
