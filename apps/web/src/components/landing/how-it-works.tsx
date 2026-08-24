import { Section } from "~/components/landing/section";

export const HowItWorks = () => (
	<Section
		label="02 / how it works"
		title="From browser activity to something useful."
	>
		<p className="text-muted-foreground max-w-2xl leading-relaxed">
			Tabot doesn't try to understand everything you say or read. It starts with
			simple browser signals and builds them into progressively more useful
			context.
		</p>
		<div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
			{[
				{ step: "Events", desc: "What happened in the browser." },
				{ step: "Sessions", desc: "Periods of related activity." },
				{
					step: "Contexts",
					desc: "Groups of browsing activity that appear to belong together.",
				},
				{
					step: "Memories",
					desc: "Useful representations of what you've been doing over time.",
				},
			].map(({ step, desc }) => (
				<div
					key={step}
					className="border-hard bg-white p-5 shadow-hard-sm flex flex-col"
				>
					<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
						{step}
					</div>
					<p className="text-sm leading-relaxed">{desc}</p>
				</div>
			))}
		</div>
		<p className="mt-6 font-mono text-xs text-muted-foreground">
			No giant history dump. No black-box interpretation of everything you do.
		</p>
	</Section>
);
