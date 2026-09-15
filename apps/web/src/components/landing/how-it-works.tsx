import { WEB_TARGETS } from "~/lib/share-targets";

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
			<h2 className="pt-4 max-w-4xl text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[0.92] tracking-[-0.04em]">
				From browser activity to shareable useful context.
			</h2>
			<p className="pt-7 max-w-2xl text-lg leading-8 text-[#4a5a52]">
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
			<div className="mt-10 grid overflow-hidden rounded-2xl border-[3px] border-[#102219] bg-lime shadow-hard-xl lg:grid-cols-[1.05fr_0.95fr]">
				<div className="p-7 sm:p-10">
					<p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#244d39]">
						Share context
					</p>
					<h3 className="mt-4 max-w-xl text-[clamp(2rem,3.2vw,3.1rem)] font-semibold leading-[0.92] tracking-[-0.035em] text-balance">
						Your{" "}
						<span className="inline-block bg-black px-[0.14em] text-lime shadow-hard-sm">
							shareable context
						</span>
						For any AI you choose.
					</h3>
					<p className="mt-5 max-w-md text-base leading-7">
						Not a history dump — a structured record of how your browsing
						unfolded. Export it once, locally and portable, then hand it to
						whichever assistant you trust.
					</p>
					<p className="mt-6 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#244d39]">
						Nothing leaves until you hit send. Your call.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-3 border-t-[3px] border-[#102219] p-6 sm:grid-cols-3 sm:p-8 lg:border-l-[3px] lg:border-t-0">
					{WEB_TARGETS.map(({ icon: Icon, name }) => (
						<div
							className="flex items-center justify-center gap-2 border-2 border-[#102219] bg-[#f5faec] px-2 py-3"
							key={name}
						>
							<Icon size={18} />
							<span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
								{name}
							</span>
						</div>
					))}
					<div className="flex items-center justify-center border-2 border-dashed border-[#102219] px-2 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
						+ Your AI
					</div>
				</div>
			</div>
		</div>
	</section>
);
