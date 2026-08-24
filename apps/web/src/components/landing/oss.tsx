import { Section } from "~/components/landing/section";

export const OSS = () => (
	<Section
		label="07 / bring your own AI"
		title="Tabot isn't tied to one model, provider, or agent."
	>
		<p className="text-muted-foreground max-w-2xl leading-relaxed">Use:</p>
		<div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
			{[
				"Claude",
				"GPT",
				"Gemini",
				"Local models",
				"Your own agent",
				"Or don't use AI at all",
			].map((m) => (
				<div
					key={m}
					className="border-hard bg-white px-4 py-3 font-mono text-sm shadow-hard-sm"
				>
					{m}
				</div>
			))}
		</div>
		<p className="mt-6 text-muted-foreground leading-relaxed">
			Tabot is useful simply as a structured record of your browser activity and
			context.
		</p>
	</Section>
);
