import { Section } from "~/components/landing/section";

export const ForDevs = () => (
	<Section
		label="06 / for developers"
		title="A browser context layer you can build on."
	>
		<p className="text-muted-foreground max-w-2xl leading-relaxed">
			Tabot is designed as an open foundation for applications that need browser
			context. Use the data for:
		</p>
		<div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
			{[
				"personal AI",
				"browser memory",
				"workflow analysis",
				"automation research",
				"custom agents",
				"experiments with personal context",
			].map((use) => (
				<div
					key={use}
					className="border-hard bg-lime/10 px-4 py-3 font-mono text-sm shadow-hard-sm"
				>
					{use}
				</div>
			))}
		</div>
		<p className="mt-6 font-mono text-sm">
			The project doesn't decide what the data is <em>for</em>.{" "}
			<span className="font-bold">You do.</span>
		</p>
	</Section>
);
