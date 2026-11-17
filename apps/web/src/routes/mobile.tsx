import { createFileRoute } from "@tanstack/react-router";
import { MobileGateFigure } from "~/components/features/mobile/mobile-gate-figure";
import { Button } from "~/components/ui/button";
import {
	CHROME_LOGO_URL,
	CHROME_WEB_STORE_URL,
	LOGO_URL,
} from "~/lib/constants";

const MobilePage = () => {
	return (
		<main className="min-h-svh bg-work-canvas px-5 text-work-ink sm:px-8">
			<header className="mx-auto flex w-full max-w-5xl items-center gap-2 py-5 sm:py-6">
				<img
					src={LOGO_URL}
					alt=""
					width={26}
					height={26}
					className="size-6.5 object-contain"
				/>
				<span className="font-display text-lg font-semibold tracking-tight">
					Tabot
				</span>
			</header>

			<section className="mx-auto grid w-full max-w-5xl items-center gap-8 pb-12 pt-3 sm:gap-10 sm:pb-16 md:grid-cols-[1fr_1fr] md:gap-12 md:pt-10">
				<MobileGateFigure />
				<div className="mx-auto w-full max-w-lg">
					<h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl">
						Tabot is for your computer.
					</h1>
					<p className="mt-4 max-w-md text-base leading-7 text-work-muted">
						Tabot needs desktop Chrome to show your browsing activity. Your
						activity stays on that computer.
					</p>
					<div className="mt-6 rounded-xl border border-work-line bg-work-surface p-4 sm:p-5">
						<p className="text-sm font-semibold">Continue on your computer</p>
						<p className="mt-1 text-sm leading-6 text-work-muted">
							Open the Chrome Web Store to add Tabot to Chrome on your computer.
						</p>
						<Button
							className="mt-4 w-full sm:w-fit"
							disabled={!CHROME_WEB_STORE_URL}
							onClick={() =>
								CHROME_WEB_STORE_URL &&
								window.open(
									CHROME_WEB_STORE_URL,
									"_blank",
									"noopener,noreferrer",
								)
							}
						>
							<img src={CHROME_LOGO_URL} width="22" height="22" alt="" />
							{CHROME_WEB_STORE_URL
								? "Add to Chrome"
								: "Chrome Store link unavailable"}
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
};

export const Route = createFileRoute("/mobile")({
	head: () => ({
		meta: [
			{ title: "Use Tabot on your computer" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: MobilePage,
});
