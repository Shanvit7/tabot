const useCases = [
	"Personal AI",
	"Browser activity",
	"Activity analysis",
	"Research tools",
	"Custom agents",
	"Workflow discovery",
	"Local AI",
	"Personal analytics",
	"Experiments with context",
] as const;

export const UseCases = () => (
	<section
		className="bg-[#f5f6f0] px-6 py-20 text-[#12221d] sm:px-10 sm:py-28 lg:px-14"
		id="oss"
	>
		<div className="mx-auto max-w-7xl">
			<h2 className="max-w-2xl text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
				A browser context layer you can build on.
			</h2>
			<p className="mt-7 max-w-2xl text-lg leading-8 text-[#4a5a52]">
				Tabot is an open foundation for applications that need private browser
				context.
			</p>
			<div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
				{useCases.map((use) => (
					<div
						className="rounded-xl border border-[#d9ddd0] bg-lime/10 px-4 py-3 font-mono text-sm shadow-hard-sm"
						key={use}
					>
						{use}
					</div>
				))}
			</div>
			<p className="mt-8 font-mono text-sm text-[#244d39]">
				Tabot doesn&apos;t decide what your data is for.{" "}
				<span className="font-bold">You do.</span>
			</p>
		</div>
	</section>
);
