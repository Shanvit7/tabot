import { Link } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUpRight,
	Github,
	Globe2,
	Laptop,
	Play,
	Plus,
	Puzzle,
	RotateCcw,
	StickyNote,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ConnectionFigure } from "~/components/features/landing/connection-figure";
import { HeroScene } from "~/components/features/landing/hero-scene";
import { ProductDemo } from "~/components/features/landing/product-demo";
import { Button } from "~/components/ui/button";
import "~/components/features/landing/landing.css";

const repository = "https://github.com/Shanvit7/tabot";
const storeUrl = import.meta.env.VITE_CHROME_WEB_STORE_URL;

const useHideOnScrollDown = () => {
	const [hidden, setHidden] = useState(false);
	useEffect(() => {
		let last = window.scrollY;
		let frame = 0;
		const read = () => {
			frame = 0;
			const y = window.scrollY;
			// Ignore jitter so a paused scroll does not flicker the bar.
			if (Math.abs(y - last) < 8) return;
			setHidden(y > last && y > 80);
			last = y;
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(read);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);
	return hidden;
};
const installClass =
	"landing-install group inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-lime px-7 text-[15px] font-semibold text-work-ink transition-colors hover:bg-[#ace600] active:translate-y-px";

const InstallLink = () =>
	storeUrl ? (
		<a
			href={storeUrl}
			target="_blank"
			rel="noopener noreferrer"
			className={installClass}
		>
			<img
				src={`${import.meta.env.BASE_URL}chrome.svg`}
				width="22"
				height="22"
				alt=""
			/>
			<span className="hidden sm:inline">Add to Chrome</span>
			<span className="sm:hidden">Get for desktop Chrome</span>
		</a>
	) : (
		<span className="inline-flex min-h-14 items-center rounded-full bg-work-raised px-6 text-sm text-work-muted">
			Chrome Store link unavailable
		</span>
	);

const MobileInstallBar = () => {
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const target = document.getElementById("hero-install");
		if (!target) return;
		const observer = new IntersectionObserver(([entry]) => {
			setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
		});
		observer.observe(target);
		return () => observer.disconnect();
	}, []);
	return visible && storeUrl ? (
		<aside
			aria-label="Install Tabot"
			className="fixed inset-x-0 bottom-0 z-30 border-t border-work-line bg-white px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden [&>a]:w-full"
		>
			<InstallLink />
		</aside>
	) : null;
};

const faqs = [
	[
		"What can ChatGPT request?",
		"Eight read-only tools return supported site and activity details, or notes you request. Activity results omit page titles, paths, and page text.",
	],
	[
		"What stays on my device?",
		"Browser activity, automatic excerpts, notes, and search data stay on your device. Requested note titles or text can be sent to ChatGPT after limited sensitive-pattern filtering. Filtering is not exhaustive; email, phone numbers, and Indian tax PAN are not covered.",
	],
	[
		"Can ChatGPT browse or change pages?",
		"No. Its Tabot tools are read-only. Local search and review work without connecting ChatGPT.",
	],
] as const;

const ConnectionCutaway = () => {
	const [active, setActive] = useState(false);
	useEffect(() => {
		if (!active) return;
		const timer = window.setTimeout(() => setActive(false), 3500);
		return () => window.clearTimeout(timer);
	}, [active]);
	return (
		<div className="mt-10 overflow-hidden rounded-2xl bg-[#eaf0e3] sm:mt-14">
			<div className="grid gap-5 px-5 pt-7 sm:grid-cols-3 sm:gap-10 sm:px-10 sm:pt-10">
				<div>
					<h3 className="flex items-center gap-2 text-sm font-semibold">
						<Laptop aria-hidden="true" className="size-4" />
						On your device
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-work-muted">
						Activity, excerpts, notes, and search indexes are stored on this
						device.
					</p>
				</div>
				<div>
					<h3 className="flex items-center gap-2 text-sm font-semibold">
						<Puzzle aria-hidden="true" className="size-4" />
						The connection
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-work-muted">
						After you authorize it, ChatGPT requests results from the running
						extension.
					</p>
				</div>
				<div>
					<h3 className="flex items-center gap-2 text-sm font-semibold">
						<StickyNote aria-hidden="true" className="size-4" />
						In the conversation
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-work-muted">
						ChatGPT receives only requested results. Requested note text leaves
						your device. Automatic excerpts stay local.
					</p>
				</div>
			</div>
			<div className="mx-auto max-w-[850px] px-2 sm:px-8">
				<ConnectionFigure active={active} />
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-6 sm:px-10 sm:pb-8">
				<p
					className="max-w-md text-xs leading-relaxed text-work-muted"
					aria-live="polite"
				>
					{active
						? "Demo animation · no data sent."
						: "Demo request · no data sent."}
				</p>
				<Button
					variant="outline"
					onClick={() => setActive(true)}
					disabled={active}
					className="min-h-12 gap-2 rounded-full border-work-line bg-white px-5 text-sm"
				>
					{active ? (
						<RotateCcw className="size-4" />
					) : (
						<Play className="size-4" />
					)}
					{active ? "Following the request…" : "Run demo"}
				</Button>
			</div>
		</div>
	);
};

export const LandingPage = () => {
	const headerHidden = useHideOnScrollDown();
	return (
		<div className="landing min-h-svh bg-white pb-24 font-sans text-work-ink selection:bg-lime selection:text-work-ink sm:pb-0">
			<div
				className={`fixed inset-x-0 top-0 z-20 px-4 pt-4 transition-transform duration-300 ease-out motion-reduce:transition-none sm:px-6 sm:pt-7 ${headerHidden ? "-translate-y-[140%]" : "translate-y-0"}`}
			>
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
							Browser activity for AI-assisted work.
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
								target="_blank"
								rel="noopener noreferrer"
								className="liquid-header-link flex min-h-11 items-center gap-2 rounded-full bg-lime px-4 text-sm font-medium transition-colors hover:bg-[#ace600]"
							>
								<Github
									aria-hidden="true"
									className="size-4"
									strokeWidth={1.75}
								/>
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
			</div>
			<main id="landing-main">
				<section aria-labelledby="landing-title">
					<HeroScene
						actions={
							<div
								id="hero-install"
								className="flex flex-col items-center gap-2"
							>
								<InstallLink />
								<a
									href="#see-it-work"
									className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline decoration-work-line underline-offset-4 hover:decoration-work-ink"
								>
									See examples
									<ArrowDown aria-hidden="true" className="size-4" />
								</a>
							</div>
						}
					>
						<div>
							<h1
								id="landing-title"
								className="max-w-[510px] text-balance font-display text-[44px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[56px] lg:text-[66px]"
							>
								There’s more behind your tabs.
							</h1>
							<p className="mt-5 max-w-[390px] text-pretty text-[17px] leading-relaxed text-work-muted sm:text-lg">
								Find pages and notes by meaning. Search your browser activity,
								right on your device.
							</p>
						</div>
					</HeroScene>
				</section>

				<section
					id="see-it-work"
					aria-labelledby="demo-heading"
					className="scroll-mt-10 px-5 py-16 sm:px-8 sm:py-24"
				>
					<div className="mx-auto max-w-5xl">
						<div className="mx-auto max-w-[730px] text-center">
							<h2
								id="demo-heading"
								className="text-balance font-display text-4xl leading-[1.08] tracking-[-0.025em] sm:text-[52px]"
							>
								What Tabot can do today.
							</h2>
							<p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-work-muted">
								Search pages and notes locally, or request supported results in
								ChatGPT.
							</p>
						</div>
						<ProductDemo />
					</div>
				</section>

				<section
					id="how-it-works"
					aria-labelledby="start-heading"
					className="scroll-mt-10 border-y border-work-line bg-[#f8faf5] px-5 py-16 sm:px-8 sm:py-24"
				>
					<div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
						<div>
							<h2
								id="start-heading"
								className="max-w-md text-balance font-display text-4xl leading-[1.08] tracking-[-0.025em] sm:text-[48px]"
							>
								Getting started.
							</h2>
						</div>
						<ol className="divide-y divide-work-line">
							{[
								{
									icon: Globe2,
									title: "Install the extension.",
									text: "Browser activity is recorded while tracking is enabled.",
								},
								{
									icon: StickyNote,
									title: "Search and save notes.",
									text: "Search recorded pages and excerpts. Add notes from the extension or dashboard.",
								},
								{
									icon: Puzzle,
									title: "Connect ChatGPT (optional).",
									text: "Authorize ChatGPT to request supported activity or notes. Tools are read-only.",
								},
							].map((step, index) => (
								<li key={step.title} className="flex gap-5 py-6 first:pt-0">
									<div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e5eddc]">
										<step.icon aria-hidden="true" className="size-5" />
									</div>
									<div>
										<span className="sr-only">Step {index + 1}. </span>
										<h3 className="text-lg font-semibold">{step.title}</h3>
										<p className="mt-2 text-[16px] leading-relaxed text-work-muted">
											{step.text}
										</p>
									</div>
								</li>
							))}
							<li className="py-5">
								<details className="landing-disclosure group">
									<summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm font-medium underline decoration-work-line underline-offset-4">
										Open the ChatGPT setup guide
										<ArrowUpRight
											aria-hidden="true"
											className="size-4 transition-transform group-open:-translate-y-0.5 group-open:translate-x-0.5"
										/>
									</summary>
									<ol className="max-w-xl space-y-3 pb-3 text-sm leading-relaxed text-work-muted">
										<li>
											1. Add Tabot to desktop Chrome and keep the extension
											running in the Chrome profile you use for ChatGPT.
										</li>
										<li>
											2. In ChatGPT, add a custom MCP server. Use{" "}
											<code className="break-all rounded bg-work-surface px-1 py-0.5 font-mono text-xs">
												https://tabot-mcp.shanvit7.workers.dev/mcp
											</code>{" "}
											and choose OAuth.
										</li>
										<li>
											3. Review and authorize the connection. Keep Chrome open
											with Tabot running when you use the tools.
										</li>
									</ol>
									<a
										href="https://chatgpt.com/"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline decoration-work-line underline-offset-4"
									>
										Open ChatGPT
										<ArrowUpRight aria-hidden="true" className="size-4" />
									</a>
									<p className="mt-2 text-xs leading-relaxed text-work-muted">
										Requires a ChatGPT account that supports custom MCP servers.
									</p>
								</details>
							</li>
						</ol>
					</div>
				</section>

				<section
					id="direction"
					aria-labelledby="tech-heading"
					className="px-5 py-16 sm:px-8 sm:py-24"
				>
					<div className="mx-auto max-w-5xl">
						<div className="mx-auto max-w-[730px] text-center">
							<h2
								id="tech-heading"
								className="text-balance font-display text-4xl leading-[1.08] tracking-[-0.025em] sm:text-[50px]"
							>
								What happens when you ask ChatGPT.
								<br />
							</h2>
							<p className="mx-auto mt-5 max-w-[620px] text-lg leading-relaxed text-work-muted">
								Search and review stay on your device. ChatGPT receives
								requested results; automatic page excerpts stay local.
							</p>
						</div>
						<ConnectionCutaway />
						<Link
							to="/privacy"
							className="mt-5 inline-flex min-h-12 items-center gap-2 text-sm font-medium underline decoration-work-line underline-offset-4"
						>
							How Tabot handles your data
							<ArrowUpRight aria-hidden="true" className="size-4" />
						</Link>
					</div>
				</section>

				<section
					id="questions"
					aria-labelledby="questions-heading"
					className="px-5 py-16 sm:px-8 sm:py-24"
				>
					<div className="mx-auto max-w-3xl">
						<h2
							id="questions-heading"
							className="mb-8 text-center font-display text-4xl tracking-[-0.025em] sm:text-[48px]"
						>
							Common questions.
						</h2>
						<div className="divide-y divide-work-line border-y border-work-line">
							{faqs.map(([question, answer]) => (
								<details key={question} className="landing-disclosure group">
									<summary className="flex min-h-[76px] cursor-pointer list-none items-center justify-between gap-5 py-5 text-base font-medium sm:text-lg">
										{question}
										<Plus
											aria-hidden="true"
											className="size-4 shrink-0 transition-transform group-open:rotate-45"
										/>
									</summary>
									<p className="max-w-[65ch] pb-6 pr-5 text-base leading-relaxed text-work-muted">
										{answer}
									</p>
								</details>
							))}
						</div>
					</div>
				</section>

				<section
					className="relative overflow-hidden bg-[#edf3e8] px-5 py-20 text-center sm:px-8 sm:py-24"
					aria-labelledby="close-heading"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 1200 340"
						fill="none"
						className="pointer-events-none absolute inset-0 h-full w-full"
						preserveAspectRatio="xMidYMid slice"
					>
						<path
							d="M-100 270C130 270 40 35 220 50S360 360 580 330 950 40 1120 90s80 160 200 100"
							stroke="#d9e5cb"
							strokeWidth="3"
						/>
					</svg>
					<div className="relative mx-auto max-w-3xl">
						<h2
							id="close-heading"
							className="text-balance font-display text-[40px] leading-[1.08] tracking-[-0.03em] sm:text-[60px]"
						>
							Start with a local search.
						</h2>
						<p className="mx-auto mb-8 mt-5 max-w-lg text-lg leading-relaxed text-work-muted">
							Add Tabot to search retained pages, excerpts, and notes on your
							device.
						</p>
						<InstallLink />
					</div>
				</section>
			</main>
			<footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-8 text-sm text-work-muted sm:px-8">
				<a
					href={import.meta.env.BASE_URL}
					className="flex min-h-11 items-center gap-2 font-display text-lg text-work-ink"
				>
					<img
						src={`${import.meta.env.BASE_URL}logo.png`}
						alt=""
						width="28"
						height="28"
					/>
					Tabot
				</a>
				<nav className="flex flex-wrap items-center gap-5" aria-label="Footer">
					<Link
						to="/privacy"
						className="inline-flex min-h-11 items-center hover:text-work-ink"
					>
						Privacy
					</Link>
					<a
						href="#how-it-works"
						className="inline-flex min-h-11 items-center hover:text-work-ink"
					>
						Setup
					</a>
					<a
						href={repository}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex min-h-11 items-center gap-1.5 hover:text-work-ink"
					>
						<Github className="size-3.5" aria-hidden="true" />
						GitHub
					</a>
				</nav>
			</footer>
			<MobileInstallBar />
		</div>
	);
};
