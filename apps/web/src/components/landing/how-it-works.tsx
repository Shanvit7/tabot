const steps = [
	{
		title: "Tabot records the websites you visit.",
		body: "Browse as usual in Chrome. Tabot keeps track of sites, tab changes, clicks, and scrolling on your computer. It does not save page contents or what you type.",
	},
	{
		title: "Look back at your activity.",
		body: "Open the dashboard to see sites you visited and follow the connections between them.",
	},
] as const;

export const HowItWorks = () => (
	<section
		id="how-it-works"
		className="border-b-2 border-black bg-white px-5 py-12 sm:px-10 sm:py-16 lg:px-14"
	>
		<div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
			<div>
				<h2 className="max-w-lg text-[clamp(2rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.02em]">
					A record of your day.
				</h2>
				<p className="mt-4 max-w-sm text-lg leading-8 text-landing-muted">
					Follow the sites you visited, in the order you moved between them.
				</p>
			</div>
			<ol className="list-decimal divide-y divide-black border-y border-black pl-5 marker:text-base marker:font-medium marker:text-landing-muted">
				{steps.map(({ title, body }) => (
					<li key={title} className="py-5 pl-3">
						<h3 className="text-lg font-semibold leading-7">{title}</h3>
						<p className="mt-2 max-w-xl text-lg leading-8 text-landing-muted">
							{body}
						</p>
					</li>
				))}
			</ol>
		</div>
	</section>
);
