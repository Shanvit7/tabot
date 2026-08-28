import { Button } from "~/components/ui/button";

export const NotFound = () => (
	<main className="grid min-h-screen place-items-center overflow-hidden bg-[#f5f6f0] px-6 text-[#12221d] sm:px-10">
		<div className="relative w-full max-w-3xl border-2 border-black bg-lime p-7 shadow-hard-xl sm:p-12">
			<div
				aria-hidden="true"
				className="absolute -left-4 -top-11 text-[clamp(7rem,22vw,16rem)] font-bold leading-none -tracking-widest text-black/10"
			>
				404
			</div>
			<div className="relative">
				<p className="font-mono text-xs font-bold uppercase tracking-[0.16em]">
					Wrong turn
				</p>
				<h1 className="mt-5 max-w-xl text-[clamp(3.5rem,9vw,7rem)] font-semibold leading-[0.84] tracking-[-0.04em] text-balance">
					Nothing to find here.
				</h1>
				<p className="mt-7 max-w-lg text-lg leading-8 text-[#244d39] sm:text-xl">
					This page moved, never existed, or is still taking shape. Tabot home
					is a better place to start.
				</p>
				<Button asChild className="mt-9" size="lg" variant="secondary">
					<a href={import.meta.env.BASE_URL}>Back to Tabot</a>
				</Button>
			</div>
		</div>
	</main>
);
