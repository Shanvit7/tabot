import { Section } from "~/components/landing/section";

export const InterestingPart = () => (
	<Section
		label="03 / the interesting part"
		title="Your browser activity becomes useful to your AI."
	>
		<p className="text-muted-foreground max-w-2xl leading-relaxed">
			Tabot doesn't need to be the AI. That's the point. Export your browser
			context and use it with the tools and models you already trust.
		</p>
		<p className="mt-4 font-bold">Ask your AI:</p>
		<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
			{[
				'"What was I working on yesterday?"',
				'"Have I done this workflow before?"',
				'"What do I repeatedly do across these websites?"',
				'"Which parts of my browser work look automatable?"',
			].map((q) => (
				<div
					key={q}
					className="border-hard bg-lime/10 px-4 py-3 font-mono text-sm shadow-hard"
				>
					{q}
				</div>
			))}
		</div>
		<p className="mt-6 font-mono text-sm">
			Tabot provides the context.{" "}
			<span className="font-bold">You decide what happens with it.</span>
		</p>
	</Section>
);
