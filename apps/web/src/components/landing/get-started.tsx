import { Button } from "~/components/ui/button";

export const GetStarted = () => (
	<section
		className="border-y-2 border-black bg-lime px-6 py-20 text-black sm:px-10 sm:py-28 lg:px-14"
		id="get-started"
	>
		<div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-20">
			<div className="max-w-3xl">
				<h2 className="text-[clamp(3.4rem,7vw,7rem)] font-semibold leading-[0.84] tracking-[-0.04em] [text-wrap:balance]">
					Putting final pieces in place.
				</h2>
				<p className="mt-8 max-w-xl text-lg leading-8 text-[#244d39] sm:text-xl">
					Tabot is almost ready to ship. Telemetry already works locally; next,
					we&apos;re tightening its path from browser signals to useful context.
				</p>
			</div>
			<div className="max-w-sm border-2 border-black bg-[#f5f6f0] p-6 shadow-hard-lg sm:p-7">
				<p className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
					Shipping soon
				</p>
				<p className="mt-4 text-xl font-semibold leading-tight tracking-[-0.03em]">
					No waitlist theatre. Run it locally today.
				</p>
				<Button asChild className="mt-7 w-full" variant="secondary">
					<a
						href="https://github.com/Shanvit7/tabot#get-started"
						rel="noopener"
						target="_blank"
					>
						Start local dev
					</a>
				</Button>
			</div>
		</div>
	</section>
);
