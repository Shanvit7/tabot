import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Github } from "lucide-react";
import { OG_IMAGE_URL, SHARE_URL } from "~/lib/constants";

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
					Browser context for AI-assisted work.
				</p>

				<nav
					aria-label="Main navigation"
					className="flex items-center gap-5 sm:gap-7"
				>
					<a
						href="#direction"
						className="liquid-header-link hidden min-h-11 items-center rounded-full text-sm text-neutral-600 transition-colors hover:text-black sm:flex"
					>
						The direction
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
		<main className="mx-auto grid max-w-5xl gap-14 px-2 pb-20 pt-16 sm:grid-cols-[1.15fr_0.85fr] sm:items-center sm:px-7 sm:pt-24">
			<section>
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
					Early beta · Chrome meets AI
				</p>
				<h1 className="mt-5 max-w-3xl text-balance font-display text-5xl font-semibold tracking-tighter sm:text-7xl">
					Make your browser part of your AI workflow.
				</h1>
				<p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600 sm:text-xl">
					Tabot is building a context layer between Chrome and your AI
					assistant—so the work you’re already doing can carry forward instead
					of starting from scratch.
				</p>
				<div className="mt-8 flex flex-wrap items-center gap-4">
					<a
						href={repository}
						className="inline-flex min-h-12 items-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
					>
						Explore Tabot on GitHub
						<ArrowUpRight aria-hidden="true" className="size-4" />
					</a>
					<Link
						to="/privacy"
						className="inline-flex min-h-12 items-center rounded-full px-4 text-sm text-neutral-600 underline underline-offset-4 transition-colors hover:text-black"
					>
						How your data works
					</Link>
				</div>
			</section>

			<aside
				id="direction"
				className="rounded-3xl border border-black/10 bg-[#f4f5ef] p-6 sm:p-8"
			>
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
					Early beta
				</p>
				<h2 className="mt-3 text-2xl font-semibold tracking-tight">
					A first step toward useful context.
				</h2>
				<p className="mt-3 leading-7 text-neutral-600">
					Today, Tabot gives ChatGPT limited, read-only access to selected
					browser information. The full context layer is still being built.
				</p>
				<div className="my-6 h-px bg-black/10" />
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
					Building toward
				</p>
				<p className="mt-3 leading-7 text-neutral-600">
					Reusable contexts and user-directed automations that help your
					assistant carry work forward.
				</p>
			</aside>
		</main>
	</div>
);

export const Route = createFileRoute("/")({
	head: () => ({
		links: [{ rel: "canonical", href: SHARE_URL }],
		meta: [
			{ title: "Tabot — Browser context for AI-assisted work" },
			{
				name: "description",
				content:
					"Tabot is building a context layer between Chrome and your AI assistant. Early beta now; reusable contexts and user-directed automations are in development.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Tabot" },
			{
				property: "og:title",
				content: "Tabot — Browser context for AI-assisted work",
			},
			{
				property: "og:description",
				content:
					"A context layer between Chrome and your AI assistant. Early beta now; reusable contexts and user-directed automations are in development.",
			},
			{ property: "og:url", content: SHARE_URL },
			{ property: "og:image", content: OG_IMAGE_URL },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content: "Tabot — browser context for AI-assisted work",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "twitter:title",
				content: "Tabot — Browser context for AI-assisted work",
			},
			{
				name: "twitter:description",
				content:
					"A context layer between Chrome and your AI assistant. Early beta now; reusable contexts and user-directed automations are in development.",
			},
			{ name: "twitter:image", content: OG_IMAGE_URL },
			{
				name: "twitter:image:alt",
				content: "Tabot — browser context for AI-assisted work",
			},
		],
	}),
	component: LandingPage,
});
