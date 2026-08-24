import { Section } from "~/components/landing/section";

export const Privacy = () => (
	<Section label="04 / privacy" title="Your activity should belong to you.">
		<p className="text-muted-foreground max-w-2xl leading-relaxed">
			Tabot is designed around local, user-owned data. The initial collection
			layer works from browser interaction signals rather than capturing page
			contents, passwords, input values, or what you type.
		</p>
		<p className="mt-4 text-muted-foreground leading-relaxed">
			Your context can stay on your machine or be exported when{" "}
			<span className="font-bold">you</span> choose.
		</p>
		<div className="mt-6 border-hard bg-black text-lime p-4 font-mono text-sm shadow-hard">
			Open source. Inspectable. Exportable.
		</div>
	</Section>
);
