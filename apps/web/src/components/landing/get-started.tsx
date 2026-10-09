import { ArrowUpRight } from "lucide-react";
import { Button } from "~/components/ui/button";

const chromeWebStoreUrl = import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim();

export const GetStarted = () => (
	<section
		id="get-started"
		className="border-b-2 border-black bg-lime px-5 py-12 sm:px-10 sm:py-16 lg:px-14"
	>
		<div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[1fr_0.8fr] lg:gap-20">
			<div>
				<h2 className="max-w-xl text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-[1.2] tracking-[-0.02em]">
					Start with Chrome.
				</h2>
				<p className="mt-4 max-w-lg text-base leading-7">
					Tabot records the sites you visit and shows how you move between them.
				</p>
			</div>
			<div className="border-2 border-black bg-white p-6 shadow-hard sm:p-7">
				<h3 className="text-lg font-semibold tracking-tight">
					Add Tabot to Chrome
				</h3>
				<Button
					asChild
					variant="secondary"
					className="mt-6 w-full px-4 text-sm font-semibold normal-case tracking-normal"
				>
					<a
						href={
							chromeWebStoreUrl || "https://github.com/Shanvit7/tabot#readme"
						}
						rel="noopener noreferrer"
						target="_blank"
					>
						{chromeWebStoreUrl ? "Add to Chrome" : "View setup on GitHub"}
						<ArrowUpRight aria-hidden="true" className="size-5 shrink-0" />
						<span className="sr-only"> (opens in a new tab)</span>
					</a>
				</Button>
				{!chromeWebStoreUrl && (
					<p className="mt-4 text-sm leading-6 text-landing-muted">
						Setup instructions are available in the project repository.
					</p>
				)}
			</div>
		</div>
	</section>
);
