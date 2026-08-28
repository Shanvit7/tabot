const steps = [
	{
		step: "Events",
		desc: "Tab changes, navigation, interaction, visibility, and other browser activity signals.",
	},
	{
		step: "Sessions",
		desc: "Related activity is organized into periods of browsing.",
	},
	{
		step: "Activity",
		desc: "A temporal relationship graph helps connect browser activity into coherent activity episodes.",
	},
	{
		step: "Context",
		desc: "Episodes become structured context describing the relationships and sequence of your activity.",
	},
	{
		step: "Patterns",
		desc: "Repeated behavioral patterns can become recurring signals.",
	},
] as const;

export const HowItWorks = () => (
	<section
		className="bg-[#f5f6f0] px-6 py-20 text-[#12221d] sm:px-10 sm:py-28 lg:px-14"
		id="how-it-works"
	>
		<div className="mx-auto max-w-7xl">
			<p className="font-mono text-xs uppercase tracking-[0.2em] text-[#4a5a52]">
				How it works
			</p>
			<h2 className="mt-4 max-w-2xl text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
				From browser activity to useful context.
			</h2>
			<p className="mt-7 max-w-2xl text-lg leading-8 text-[#4a5a52]">
				Tabot doesn&apos;t try to read everything you see. It starts with
				browser activity signals and progressively turns them into a structured
				representation of what happened.
			</p>
			<div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				{steps.map(({ step, desc }) => (
					<div
						className="rounded-2xl border border-[#d9ddd0] bg-white p-5"
						key={step}
					>
						<p className="font-mono text-xs uppercase tracking-wider text-[#4a5a52]">
							{step}
						</p>
						<p className="mt-3 text-sm leading-6 text-[#4a5a52]">{desc}</p>
					</div>
				))}
			</div>
			<p className="mt-8 font-mono text-sm text-[#244d39]">
				The result isn&apos;t a history dump. It&apos;s a structured record of
				how your browsing unfolded.
			</p>
		</div>
	</section>
);
