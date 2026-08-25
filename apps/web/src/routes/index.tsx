import "lenis/dist/lenis.css";
import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "~/components/landing/footer";
import { Header } from "~/components/landing/header";
import { Hero } from "~/components/landing/hero";
import { InterestingPart } from "~/components/landing/interesting-part";
import { StartYourWay } from "~/components/landing/start-your-way";
import { useSmoothScroll } from "~/components/landing/useSmoothScroll";
import { WorkMemory } from "~/components/landing/work-memory";

const Landing = () => {
	useSmoothScroll();
	return (
		<div className="min-h-screen bg-[#07100c]">
			<Header />
			<main>
				<div className="space-y-8 bg-white p-6 md:space-y-12 md:p-12">
					<Hero />
					<WorkMemory />
					<InterestingPart />
				</div>
				<StartYourWay />
			</main>
			<Footer />
		</div>
	);
};

export const Route = createFileRoute("/")({
	component: Landing,
});
