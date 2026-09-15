import "lenis/dist/lenis.css";
import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "~/components/landing/footer";
import { GetStarted } from "~/components/landing/get-started";
import { Header } from "~/components/landing/header";
import { Hero } from "~/components/landing/hero";
import { HowItWorks } from "~/components/landing/how-it-works";
import { PrivacyFirst } from "~/components/landing/privacy-first";
import { UseCases } from "~/components/landing/use-cases";
import { useSmoothScroll } from "~/components/landing/useSmoothScroll";

const Landing = () => {
	useSmoothScroll();
	return (
		<div className="min-h-screen bg-[#07100c]">
			<Header />
			<main>
				<Hero />
				<HowItWorks />
				<PrivacyFirst />
				<UseCases />
				<GetStarted />
			</main>
			<Footer />
		</div>
	);
};

export const Route = createFileRoute("/")({
	component: Landing,
});
