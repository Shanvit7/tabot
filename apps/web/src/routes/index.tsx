import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Footer } from "~/components/landing/footer";
import { GetStarted } from "~/components/landing/get-started";
import { Header } from "~/components/landing/header";
import { Hero } from "~/components/landing/hero";
import { HowItWorks } from "~/components/landing/how-it-works";
import { PrivacyFirst } from "~/components/landing/privacy-first";
import { ChatGPTIntegration } from "~/components/landing/use-cases";
import { useIsMobile } from "~/hooks/use-is-mobile";
import { fetchStats } from "~/lib/home-data";
import { SITE_DESCRIPTION, siteUrl } from "~/lib/site";

const Landing = () => {
	const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(
		null,
	);
	const { isMobileDevice, isLoading: isMobileLoading } = useIsMobile();
	const showDesktopPrompt = !isMobileLoading && isMobileDevice;

	useEffect(() => {
		let active = true;
		void fetchStats(1200).then((stats) => {
			if (active) setExtensionInstalled(stats !== null);
		});
		return () => {
			active = false;
		};
	}, []);

	return (
		<div className="landing-page min-h-screen bg-landing-paper text-black">
			<a
				href="#main-content"
				className="sr-only z-50 border-2 border-black bg-lime p-4 font-semibold focus:not-sr-only focus:absolute focus:left-5 focus:top-5"
			>
				Skip to content
			</a>
			<Header
				extensionInstalled={extensionInstalled}
				isMobileDevice={showDesktopPrompt}
			/>
			<main id="main-content">
				<Hero
					extensionInstalled={extensionInstalled}
					isMobileDevice={showDesktopPrompt}
				/>
				<HowItWorks />
				<ChatGPTIntegration
					extensionInstalled={extensionInstalled}
					isMobileDevice={showDesktopPrompt}
				/>
				<PrivacyFirst />
				{extensionInstalled === false && !showDesktopPrompt && <GetStarted />}
			</main>
			<Footer extensionInstalled={extensionInstalled === true} />
		</div>
	);
};

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Tabot — Your browsing, in one place" },
			{ name: "description", content: SITE_DESCRIPTION },
			{ property: "og:url", content: siteUrl() },
		],
		links: [{ rel: "canonical", href: siteUrl() }],
	}),
	component: Landing,
});
