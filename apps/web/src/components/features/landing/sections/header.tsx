import { ArrowUpRight, Github } from "lucide-react";
import { BASE_URL, GITHUB_REPOSITORY_URL, LOGO_URL } from "~/lib/constants";

export const LandingHeader = ({ hidden }: { hidden: boolean }) => (
	<div
		className={`fixed inset-x-0 top-0 z-20 px-4 pt-4 transition-transform duration-300 ease-out motion-reduce:transition-none sm:px-6 sm:pt-7 ${hidden ? "translate-y-[-140%]" : "translate-y-0"}`}
	>
		<header className="liquid-header relative isolate mx-auto max-w-5xl @container">
			<div className="liquid-header-content relative flex min-h-18 items-center justify-between gap-4 px-5 sm:px-7">
				<a
					href={BASE_URL}
					aria-label="Tabot home"
					className="liquid-header-link absolute left-5 top-1/2 z-10 flex min-h-11 shrink-0 items-center gap-2 rounded-full font-display text-xl font-semibold tracking-[-0.035em] whitespace-nowrap [--brand-inset:1.25rem] transform-[translateY(-50%)] animate-[liquid-brand-arrive_1400ms_cubic-bezier(0.4,0,0.2,1)_both] motion-reduce:animate-none sm:[--brand-inset:1.75rem] cursor-pointer focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-[5px]"
				>
					<img
						src={LOGO_URL}
						alt=""
						width="36"
						height="36"
						className="size-9 rounded-full"
					/>
					Tabot
				</a>
				<nav
					aria-label="Main navigation"
					className="ml-auto flex items-center gap-5 animate-[liquid-reveal_500ms_1100ms_both] motion-reduce:animate-none sm:gap-7"
				>
					<a
						href={GITHUB_REPOSITORY_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="liquid-header-link flex min-h-11 items-center gap-2 rounded-full bg-lime px-4 cursor-pointer text-sm font-medium transition-colors hover:bg-[#ace600] focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-[5px]"
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
	</div>
);
