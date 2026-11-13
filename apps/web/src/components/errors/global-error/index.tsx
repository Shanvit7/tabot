import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { GlobalErrorArt } from "~/components/errors/global-error/art";
import { Button } from "~/components/ui/button";
import { trackDashboardError } from "~/lib/telemetry";

export const GlobalError = ({ error, reset }: ErrorComponentProps) => {
	useEffect(() => trackDashboardError(error, "route_boundary", true), [error]);
	return (
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
			<section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-10 sm:gap-14 lg:grid-cols-[1fr_1fr]">
				<div className="order-2 lg:order-1">
					<p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-work-muted">
						Something went off track
					</p>
					<h1 className="mt-4 max-w-xl text-balance font-display text-5xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
						We hit a snag.
					</h1>
					<p className="mt-5 max-w-md text-lg leading-relaxed text-work-muted">
						Your local data is still yours. Try loading this view again.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Button
							onClick={reset}
							className="min-h-12 rounded-lg bg-lime px-6 text-base font-semibold text-work-ink hover:bg-lime/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-work-ink"
						>
							Try again
						</Button>
						<Button
							asChild
							variant="outline"
							className="min-h-12 rounded-lg px-6 text-base font-semibold"
						>
							<a href={import.meta.env.BASE_URL}>Back to Tabot</a>
						</Button>
					</div>
				</div>
				<div className="order-1 lg:order-2">
					<GlobalErrorArt />
				</div>
			</section>
		</main>
	);
};
