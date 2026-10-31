import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Github } from "lucide-react";

const repository = "https://github.com/Shanvit7/tabot";

const LandingPage = () => (
	<div className="min-h-svh bg-white px-4 pt-4 text-black selection:bg-lime sm:px-6 sm:pt-7">
		<header className="liquid-header relative isolate mx-auto max-w-5xl">
			<div className="liquid-header-content relative flex min-h-18 items-center justify-between gap-4 px-5 sm:px-7">
				<a
					href={import.meta.env.BASE_URL}
					aria-label="Tabot home"
					className="liquid-header-link flex min-h-11 shrink-0 items-center gap-2 rounded-full font-display text-xl font-semibold tracking-[-0.035em]"
				>
					<img
						src={`${import.meta.env.BASE_URL}logo.png`}
						alt=""
						width="36"
						height="36"
						className="size-9 rounded-full"
					/>
					Tabot
				</a>

				<p className="hidden text-sm text-neutral-600 md:block">
					Thinking across tabs.
				</p>

				<nav
					aria-label="Main navigation"
					className="flex items-center gap-5 sm:gap-7"
				>
					<a
						href={`${repository}#readme`}
						className="liquid-header-link hidden min-h-11 items-center rounded-full text-sm text-neutral-600 transition-colors hover:text-black sm:flex"
					>
						How it works
					</a>
					<a
						href={repository}
						className="liquid-header-link flex min-h-11 items-center gap-2 rounded-full bg-lime px-4 text-sm font-medium transition-colors hover:bg-[#ace600]"
					>
						<Github aria-hidden="true" className="size-4" strokeWidth={1.75} />
						GitHub
						<ArrowUpRight
							aria-hidden="true"
							className="size-3.5"
							strokeWidth={1.75}
						/>
					</a>
				</nav>
			</div>
		</header>
		<main>
			<h1 className="sr-only">
				Tabot — Private, local browser activity timeline. Thinking across tabs.
			</h1>
		</main>
	</div>
);

export const Route = createFileRoute("/")({
	component: LandingPage,
});
