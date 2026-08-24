import { Button } from "~/components/ui/button";

export const ClosingCTA = () => (
	<section className="border-hard bg-black text-white p-12 md:p-16 shadow-hard-xl">
		<div className="max-w-3xl mx-auto text-center space-y-6">
			<h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
				Give your browser a memory.
			</h2>
			<p className="font-mono text-sm text-lime/70">
				Build it. Inspect it. Export it.
				<br />
				Use it with whatever comes next.
			</p>
			<div className="flex flex-wrap justify-center gap-4 pt-4">
				<Button asChild size="lg" className="bg-lime text-black shadow-hard">
					<a href="https://github.com/">star on github</a>
				</Button>
				<Button asChild size="lg" variant="secondary">
					<a href="/metrics">get started</a>
				</Button>
			</div>
		</div>
	</section>
);
