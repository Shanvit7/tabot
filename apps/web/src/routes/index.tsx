import "lenis/dist/lenis.css";
import { createFileRoute } from "@tanstack/react-router";
import { ClosingCTA } from "~/components/landing/closing-cta";
import { Footer } from "~/components/landing/footer";
import { ForDevs } from "~/components/landing/for-devs";
import { Header } from "~/components/landing/header";
import { Hero } from "~/components/landing/hero";
import { HowItWorks } from "~/components/landing/how-it-works";
import { InterestingPart } from "~/components/landing/interesting-part";
import { NotAnotherWorkflowBuilder } from "~/components/landing/not-another-workflow-builder";
import { OSS } from "~/components/landing/oss";
import { Privacy } from "~/components/landing/privacy";
import { Problem } from "~/components/landing/problem";
import { useSmoothScroll } from "~/components/landing/useSmoothScroll";

const Landing = () => {
	useSmoothScroll();
	return (
		<div className="min-h-screen bg-white">
			<Header />
			<main className="space-y-8 md:space-y-12 p-6 md:p-12">
				<Hero />
				<div id="problem">
					<Problem />
				</div>
				<div id="how">
					<HowItWorks />
				</div>
				<InterestingPart />
				<div id="privacy">
					<Privacy />
				</div>
				<NotAnotherWorkflowBuilder />
				<div id="builders">
					<ForDevs />
				</div>
				<div id="oss">
					<OSS />
				</div>
				<ClosingCTA />
			</main>
			<Footer />
		</div>
	);
};

export const Route = createFileRoute("/")({
	component: Landing,
});
