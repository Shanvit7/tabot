import { Button } from "~/components/ui/button";

export const NotFound = () => (
	<main className="flex min-h-svh flex-col bg-work-canvas px-6 text-work-ink sm:px-10">
		<header className="mx-auto flex w-full max-w-5xl items-center gap-2 py-6">
			<img
				src={`${import.meta.env.BASE_URL}logo.png`}
				alt=""
				width={26}
				height={26}
				className="size-[26px] object-contain"
			/>
			<span className="font-display text-lg font-semibold tracking-tight">
				tabot
			</span>
		</header>

		<section className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-8 py-16 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-16">
			<p
				aria-hidden="true"
				className="font-display text-[clamp(8rem,22vw,15rem)] font-semibold leading-[0.72] tracking-[-0.1em] text-work-ink"
			>
				404
			</p>
			<div className="max-w-xl border-l-4 border-lime pl-6 sm:pl-8">
				<p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-work-muted">
					Page not found
				</p>
				<h1 className="mt-3 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl">
					That address doesn’t exist.
				</h1>
				<Button
					asChild
					className="mt-8 min-h-12 rounded-md border border-work-ink bg-lime px-5 text-base font-semibold tracking-tight text-work-ink shadow-[3px_3px_0_0_#15251b] transition-[transform,box-shadow] duration-150 motion-reduce:transition-none hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_#15251b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-work-ink active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
				>
					<a href={import.meta.env.BASE_URL}>Back to Tabot</a>
				</Button>
			</div>
		</section>
	</main>
);
