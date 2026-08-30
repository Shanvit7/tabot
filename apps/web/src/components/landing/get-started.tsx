import { Button } from "~/components/ui/button";

const chromeWebStoreUrl = import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim();

export const GetStarted = () => (
	<section
		className="border-y-2 border-black bg-lime px-6 py-20 text-black sm:px-10 sm:py-28 lg:px-14"
		id="get-started"
	>
		<div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-20">
			<div className="max-w-3xl">
				<h2 className="text-[clamp(3.4rem,7vw,7rem)] font-semibold leading-[0.84] tracking-[-0.04em] text-balance">
					Keep context. Lose less momentum.
				</h2>
				<p className="mt-8 max-w-xl text-lg leading-8 text-[#244d39] sm:text-xl">
					Install Tabot, browse normally, then review your own activity from one
					local dashboard.
				</p>
			</div>
			<div className="max-w-sm border-2 border-black bg-[#f5f6f0] p-6 shadow-hard-lg sm:p-7">
				<p className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
					Chrome extension
				</p>
				<p className="mt-4 text-xl font-semibold leading-tight tracking-[-0.03em]">
					Your browser activity stays on your device.
				</p>
				{chromeWebStoreUrl ? (
					<Button asChild className="mt-7 w-full" variant="secondary">
						<a href={chromeWebStoreUrl} rel="noopener" target="_blank">
							Add to Chrome
						</a>
					</Button>
				) : (
					<Button className="mt-7 w-full" disabled variant="secondary">
						Coming soon
					</Button>
				)}
			</div>
		</div>
	</section>
);
