import { Button } from "~/components/ui/button";

export const Hero = () => (
	<section className="min-h-[85vh] flex flex-col justify-center px-6 bg-black text-white">
		<div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
			<div className="space-y-6">
				<p className="font-mono text-xs uppercase tracking-[0.2em] text-lime">
					An open, local-first context layer for browser activity
				</p>
				<h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.95] [text-wrap:balance]">
					Your browser,
					<br />
					<span className="text-lime underline decoration-4">
						with a memory
					</span>
				</h1>
				<p className="font-mono text-sm text-lime/70 max-w-xl leading-relaxed">
					Tabot turns your browser activity into a private, structured memory of
					what you've been doing across the web.
				</p>
				<div className="flex flex-wrap gap-4">
					<Button asChild size="lg" className="bg-lime text-black shadow-hard">
						<a href="https://github.com/">star on github</a>
					</Button>
					<Button asChild size="lg" variant="secondary">
						<a href="/metrics">try tabot</a>
					</Button>
				</div>
				<p className="font-mono text-xs text-lime/60">
					Local-first. Open source. Yours to keep.
				</p>
			</div>

			<div className="flex flex-col gap-3 items-end">
				{["Jira", "GitHub", "Slack", "docs"].map((label) => (
					<div
						key={label}
						className="border-hard bg-white px-6 py-3 font-mono text-sm font-bold shadow-hard"
					>
						{label}
					</div>
				))}
				<div className="w-2 h-2 bg-lime" />
				<div className="border-hard-lg bg-black text-lime px-10 py-6 text-center font-mono text-lg font-bold uppercase tracking-wider shadow-hard-xl">
					context
				</div>
				<div className="border-hard-lg bg-black text-lime px-10 py-6 text-center font-mono text-lg font-bold uppercase tracking-wider shadow-hard-xl">
					memory
				</div>
			</div>
		</div>
	</section>
);
