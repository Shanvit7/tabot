import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Puzzle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { MobileView } from "~/components/extension-mobile-setup";
import { Button } from "~/components/ui/button";
import { Loading } from "~/components/ui/work-panels";
import { useHomeData } from "~/hooks/use-home-data";
import { useIsMobile } from "~/hooks/use-is-mobile";

const chromeWebStoreUrl =
	import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim() ||
	"https://chromewebstore.google.com/";

const steps = [
	{
		title: "Add Tabot to Chrome",
		body: "Press the blue “Add to Chrome” button on the Chrome Web Store page, then confirm.",
	},
	{
		title: "Make sure it’s on",
		body: "Click the puzzle piece in the top-right of Chrome, then switch Tabot on. Tap the pin to keep it handy.",
	},
	{
		title: "Come back here",
		body: "Press “Check again” and your activity will appear.",
	},
];

const ExtensionNotConnected = () => {
	const navigate = useNavigate();
	const { hasExtension } = useHomeData();
	const { isMobile, isLoading } = useIsMobile();

	// Only supported desktop browsers should return to the dashboard.
	useEffect(() => {
		if (!isLoading && !isMobile && hasExtension) {
			void navigate({ to: "/home", replace: true });
		}
	}, [hasExtension, isLoading, isMobile, navigate]);

	if (isLoading) return <Loading />;
	if (!isMobile && hasExtension) return null;

	return (
		<main className="grid min-h-dvh place-items-center bg-landing-paper px-4 py-6 text-[#12221d] sm:px-8">
			<div className="w-full min-w-0 max-w-4xl border-2 border-black bg-lime p-5 shadow-hard-xl sm:p-8">
				{isMobile ? (
					<MobileView chromeWebStoreUrl={chromeWebStoreUrl} />
				) : (
					<div className="grid gap-6 md:grid-cols-2 md:gap-10">
						<section className="flex flex-col">
							<p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">
								One quick step
							</p>
							<h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-balance sm:text-2xl">
								Add the Tabot extension to Chrome.
							</h1>
							<p className="mt-2 text-sm leading-6 text-[#244d39]">
								Tabot needs its Chrome extension to show your activity. It’s
								free, and everything stays on this computer.
							</p>
							<Button
								asChild
								className="mt-4 w-full sm:w-auto sm:self-start"
								variant="secondary"
							>
								<a
									href={chromeWebStoreUrl}
									rel="noopener noreferrer"
									target="_blank"
								>
									Open Chrome Web Store
								</a>
							</Button>
							<div
								aria-hidden="true"
								className="mt-5 flex items-center gap-3 border-2 border-black bg-white px-3 py-2 shadow-hard-sm"
							>
								<div className="h-6 flex-1 rounded-full bg-[#eef0ea] px-3 text-[11px] leading-6 text-[#5b6b62]">
									Chrome’s address bar
								</div>
								<div className="flex size-8 items-center justify-center rounded-full border-2 border-black bg-lime">
									<Puzzle className="size-4" strokeWidth={2.5} />
								</div>
							</div>
							<p className="mt-2 text-xs leading-5 text-[#244d39]">
								Look for the puzzle piece at the top-right of Chrome — that’s
								where your extensions live.
							</p>
						</section>
						<section className="flex flex-col border-t-2 border-black pt-5 md:border-t-0 md:border-l-2 md:pt-0 md:pl-10">
							<ol className="space-y-3">
								{steps.map((step, index) => (
									<li
										key={step.title}
										className="grid grid-cols-[auto_1fr] gap-3"
									>
										<span className="flex size-6 items-center justify-center rounded-full bg-black font-mono text-xs font-bold text-lime">
											{index + 1}
										</span>
										<div>
											<h2 className="text-sm font-semibold leading-6">
												{step.title}
											</h2>
											<p className="text-xs leading-5 text-[#244d39]">
												{step.body}
											</p>
										</div>
									</li>
								))}
							</ol>
							<Button
								className="mt-5 w-full sm:w-auto sm:self-start"
								type="button"
								variant="default"
								onClick={() => globalThis.location.reload()}
							>
								<RefreshCw
									aria-hidden="true"
									className="size-4"
									strokeWidth={2.5}
								/>
								Check again
							</Button>
						</section>
					</div>
				)}
			</div>
		</main>
	);
};

export const Route = createFileRoute("/extension-not-connected")({
	head: () => ({
		meta: [
			{ title: "Add Tabot to Chrome | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: ExtensionNotConnected,
});
