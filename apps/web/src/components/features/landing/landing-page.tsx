import { ArrowDown } from "lucide-react";
import { useEffect } from "react";
import { DingToaster } from "~/components/alerts/ding-toaster";
import { AutomationFigure } from "~/components/features/landing/artwork/automation-figure";
import { ProductDemo } from "~/components/features/landing/demo/product-demo";
import { InstallLink } from "~/components/features/landing/install/install-link";
import { MobileInstallBar } from "~/components/features/landing/install/mobile-install-bar";
import { ClosingSection } from "~/components/features/landing/sections/closing-section";
import { FaqSection } from "~/components/features/landing/sections/faq-section";
import { LandingFooter } from "~/components/features/landing/sections/footer";
import { LandingHeader } from "~/components/features/landing/sections/header";
import { HeroScene } from "~/components/features/landing/sections/hero-scene";
import { useExtensionConnected } from "~/hooks/use-extension-connected";
import { useHideOnScrollDown } from "~/hooks/use-hide-on-scroll-down";
import { useIsMobile } from "~/hooks/use-is-mobile";
import { useLandingPageEndTracking } from "~/hooks/use-landing-page-end-tracking";
import { POSTHOG_HOST, POSTHOG_PROJECT_KEY, SHARE_URL } from "~/lib/constants";
import { startLandingWebVitals } from "~/lib/landing-web-vitals";
import "~/components/features/landing/landing.css";

export const LandingPage = () => {
	const headerHidden = useHideOnScrollDown();
	const extensionConnected = useExtensionConnected();
	const { isMobile } = useIsMobile();
	const pageEndSentinel = useLandingPageEndTracking();
	useEffect(() => {
		if (!POSTHOG_PROJECT_KEY) return;
		return startLandingWebVitals(POSTHOG_PROJECT_KEY, POSTHOG_HOST, SHARE_URL);
	}, []);

	return (
		<div className="landing min-h-svh bg-white pb-24 font-sans text-work-ink selection:bg-lime selection:text-work-ink md:pb-0">
			<LandingHeader hidden={headerHidden} />
			<main id="landing-main">
				<section aria-labelledby="landing-title">
					<HeroScene
						actions={
							<div
								id="hero-install"
								className="flex flex-col items-center gap-2"
							>
								<InstallLink connected={extensionConnected} mobile={isMobile} />
								<a
									href="#see-it-work"
									className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium underline decoration-work-line underline-offset-4 hover:decoration-work-ink"
								>
									See demo
									<ArrowDown aria-hidden="true" className="size-4" />
								</a>
							</div>
						}
					>
						<div>
							<h1
								id="landing-title"
								className="max-w-127.5 text-balance font-display text-[44px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[56px] lg:text-[66px]"
							>
								Bring your browser work to ChatGPT.
							</h1>
							<p className="mt-5 max-w-97.5 text-pretty text-[17px] leading-relaxed text-work-muted sm:text-lg">
								Search pages and notes by meaning, review activity by site, and
								request supported results from ChatGPT when you choose.
							</p>
						</div>
					</HeroScene>
				</section>

				<section
					id="see-it-work"
					tabIndex={-1}
					aria-labelledby="demo-heading"
					className="landing-flow-section scroll-mt-10 px-5 py-16 sm:px-8 sm:py-24"
				>
					<div className="mx-auto max-w-5xl">
						<div className="mx-auto max-w-182.5 text-center">
							<h2
								id="demo-heading"
								className="text-balance font-display text-4xl leading-[1.08] tracking-tight sm:text-[52px]"
							>
								The same search, in ChatGPT and Tabot.
							</h2>
							<p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-work-muted">
								ChatGPT can use selected context from your browsing when you
								ask. In Tabot, search that browsing context across saved pages,
								activity, and notes.
							</p>
						</div>
						<ProductDemo />
					</div>
				</section>

				<section
					id="automations"
					aria-labelledby="automations-heading"
					className="automation-section px-5 py-16 sm:px-8 sm:py-24"
				>
					<div className="mx-auto grid max-w-5xl items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
						<div className="max-w-lg">
							<h2
								id="automations-heading"
								className="text-balance font-display text-4xl leading-[1.08] tracking-tight sm:text-[52px]"
							>
								Automations are coming.
							</h2>
							<p className="mt-5 text-lg leading-relaxed text-work-muted">
								We’re building toward user-directed workflows that reuse browser
								context for work you choose—so you can pick up recurring work
								without starting from scratch.
							</p>
						</div>
						<div className="automation-art">
							<AutomationFigure />
						</div>
					</div>
				</section>

				<FaqSection />
				<ClosingSection connected={extensionConnected} mobile={isMobile} />
			</main>
			<LandingFooter />
			<DingToaster position="top-center" theme="light" />
			<span ref={pageEndSentinel} aria-hidden="true" className="block h-px" />
			<MobileInstallBar connected={extensionConnected} mobile={isMobile} />
		</div>
	);
};
