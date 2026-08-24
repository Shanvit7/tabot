import { Section } from "~/components/landing/section";

export const NotAnotherWorkflowBuilder = () => (
	<Section
		label="05 / not another workflow builder"
		title="You don't have to know what to automate yet."
	>
		<p className="text-muted-foreground leading-relaxed">
			Most automation tools start with:
		</p>
		<blockquote className="mt-3 border-l-4 border-black pl-4 font-mono text-sm">
			"Tell me the workflow."
		</blockquote>
		<p className="mt-4 text-muted-foreground leading-relaxed">
			Tabot starts earlier:
		</p>
		<blockquote className="mt-3 border-l-4 border-lime pl-4 font-mono text-sm font-bold bg-lime/10 py-2">
			"Let me understand the context of what you're already doing."
		</blockquote>
		<div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
			{[
				"Maybe you'll discover a repetitive process.",
				"Maybe you'll discover a better way to work.",
				"Maybe you just need to remember what you were doing three days ago.",
			].map((q) => (
				<div
					key={q}
					className="border-hard bg-white p-4 shadow-hard-sm text-sm"
				>
					{q}
				</div>
			))}
		</div>
		<p className="mt-6 font-mono text-sm font-bold">
			The data is yours either way.
		</p>
	</Section>
);
