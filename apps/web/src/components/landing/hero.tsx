import { ArrowRight, Check, Share2 } from "lucide-react";
import { useState } from "react";
import { AnimationPreview } from "~/components/landing/animation-preview";
import { Button } from "~/components/ui/button";

export const Hero = ({
	extensionInstalled,
	isMobileDevice,
}: {
	extensionInstalled: boolean | null;
	isMobileDevice: boolean;
}) => {
	const [shareMessage, setShareMessage] = useState("");

	const shareDesktopLink = async () => {
		setShareMessage("");
		const landingUrl = new URL(
			import.meta.env.BASE_URL,
			window.location.origin,
		);

		if (navigator.share) {
			try {
				await navigator.share({
					title: "Tabot — Your browsing, in one place",
					text: "Open Tabot in desktop Chrome to install and explore your activity map.",
					url: landingUrl.href,
				});
				setShareMessage(
					"Link shared. Open it in desktop Chrome to install Tabot.",
				);
				return;
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError")
					return;
			}
		}

		try {
			await navigator.clipboard.writeText(landingUrl.href);
			setShareMessage(
				"Link copied. Open it in desktop Chrome to install Tabot.",
			);
		} catch {
			setShareMessage(
				"Couldn’t share or copy. Bookmark this page and open it in desktop Chrome.",
			);
		}
	};

	return (
		<section className="border-b-2 border-black bg-landing-paper px-5 py-12 sm:px-10 sm:py-16 lg:px-14">
			<div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20">
				<div className="min-w-0">
					<h1 className="max-w-xl text-[clamp(2.25rem,5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.025em]">
						Where did your browsing take you?
					</h1>
					<p className="mt-5 max-w-lg text-lg leading-8 text-landing-muted">
						Tabot records the sites you visit and shows how you move between
						them. Look back at your day in one activity map.
					</p>
					{isMobileDevice ? (
						<div className="mt-6 max-w-lg border-t-2 border-black pt-4">
							<p className="text-lg font-semibold">
								Pick this up on your computer.
							</p>
							<p className="mt-1 text-base leading-7 text-landing-muted">
								Tabot runs in desktop Chrome. Send this page to yourself, then
								open it there to install and explore your activity map.
							</p>
							<Button
								className="mt-4 text-base font-semibold normal-case tracking-normal"
								type="button"
								variant="secondary"
								onClick={() => void shareDesktopLink()}
							>
								{shareMessage ? (
									<Check aria-hidden="true" className="size-4" />
								) : (
									<Share2 aria-hidden="true" className="size-4" />
								)}
								Send link to my computer
							</Button>
							<p role="status" className="mt-2 text-base text-landing-muted">
								{shareMessage}
							</p>
						</div>
					) : (
						<div className="mt-6 flex flex-wrap items-center gap-4">
							<Button
								asChild
								className="text-base font-semibold normal-case tracking-normal"
							>
								<a
									href={
										extensionInstalled === true
											? `${import.meta.env.BASE_URL}home`
											: extensionInstalled === false
												? "#get-started"
												: "#how-it-works"
									}
								>
									{extensionInstalled === true
										? "Open today's activity"
										: extensionInstalled === false
											? "Get Tabot for Chrome"
											: "See how Tabot works"}{" "}
									<ArrowRight aria-hidden="true" className="size-5" />
								</a>
							</Button>
						</div>
					)}
				</div>
				<AnimationPreview />
			</div>
		</section>
	);
};
