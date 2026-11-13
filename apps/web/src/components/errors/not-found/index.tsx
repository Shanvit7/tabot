import { NotFoundArt } from "~/components/errors/not-found/art";
import { Button } from "~/components/ui/button";

export const NotFound = () => (
	<main className="flex min-h-svh flex-col bg-work-canvas px-6 text-work-ink sm:px-10">
		<header className="mx-auto flex w-full max-w-6xl items-center gap-2 py-6">
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

		<section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 py-12 sm:gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
			<div className="order-2 lg:order-1">
				<h1 className="max-w-xl text-balance font-display text-5xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
					404. Looks like we took a wrong turn.
				</h1>
				<p className="mt-5 max-w-md text-lg leading-relaxed text-work-muted">
					This page isn’t here. Let’s get you back somewhere familiar.
				</p>
				<Button
					asChild
					className="mt-8 min-h-12 rounded-lg bg-lime px-6 text-base font-semibold text-work-ink transition-colors hover:bg-lime/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-work-ink"
				>
					<a href={import.meta.env.BASE_URL}>Back to Tabot</a>
				</Button>
			</div>

			<div className="order-1 lg:order-2">
				<NotFoundArt />
			</div>
		</section>
	</main>
);
