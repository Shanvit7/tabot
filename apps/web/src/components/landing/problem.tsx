import { Section } from "~/components/landing/section";

export const Problem = () => (
	<Section
		label="01 / the problem"
		title="Browsing has no memory of how you work."
	>
		<p className="text-muted-foreground max-w-2xl leading-relaxed">
			You jump between Jira, GitHub, Slack, docs, dashboards, searches — and a
			dozen tabs. The browser remembers each page. It doesn't remember the
			context around them.
		</p>
		<div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
			{[
				"What was I working on?",
				"Which tabs were actually related?",
				"Where did I find that thing?",
				"Is this something I keep doing manually?",
			].map((q) => (
				<blockquote
					key={q}
					className="border-hard bg-white p-5 font-mono text-sm shadow-hard"
				>
					<span className="text-lime">?</span> {q}
				</blockquote>
			))}
		</div>
		<p className="mt-6 font-mono text-sm border-l-4 border-black pl-3 text-lime bg-black px-2 py-2">
			Tabot keeps that context.
		</p>
	</Section>
);
