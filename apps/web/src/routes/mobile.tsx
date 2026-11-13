import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { DingToaster, toast } from "~/components/alerts/ding-toaster";
import { MobileGateFigure } from "~/components/features/mobile/mobile-gate-figure";
import { Button } from "~/components/ui/button";

const MobilePage = () => {
	const copyPageLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Link copied", {
				description: "Open this page in Chrome on your computer.",
			});
		} catch {
			toast.error("Couldn’t copy link", {
				description: "Copy the page URL from your browser’s address bar.",
			});
		}
	};

	return (
		<main className="min-h-svh bg-work-canvas px-5 text-work-ink sm:px-8">
			<header className="mx-auto flex w-full max-w-5xl items-center gap-2 py-5 sm:py-6">
				<img
					src={`${import.meta.env.BASE_URL}logo.png`}
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
							Copy this page’s link, then open it in Chrome on your laptop or
							desktop.
						</p>
						<Button
							className="mt-4 w-full sm:w-fit"
							onClick={() => void copyPageLink()}
						>
							<Copy aria-hidden="true" className="size-4" />
							Copy page link
						</Button>
					</div>
				</div>
			</section>
			<DingToaster position="top-center" theme="light" />
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
