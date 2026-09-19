import SiGithub from "@icons-pack/react-simple-icons/icons/SiGithub";

const links = [
	{ href: "#privacy-first", label: "Privacy-first" },
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#get-started", label: "Get started" },
	{ href: `${import.meta.env.BASE_URL}privacy`, label: "Privacy" },
	{ href: "https://github.com/Shanvit7/tabot", label: "GitHub" },
] as const;

export const Footer = () => (
	<footer className="border-t border-[#405b4d] bg-[#07100c] px-6 pt-10 text-[#eff5e7] sm:px-10 sm:pt-14 lg:px-14">
		<div className="mx-auto max-w-7xl">
			<div className="border-b border-[#405b4d] pb-10 sm:pb-14">
				<p className="text-sm font-semibold text-[#bfff00]">TABOT</p>
				<h2 className="mt-6 max-w-5xl text-balance text-[clamp(4.5rem,12vw,12rem)] font-semibold leading-[0.8] tracking-[-0.04em]">
					Thinking
					<br />
					across tabs.
				</h2>
				<p className="mt-10 max-w-md text-base leading-7 text-[#c2d1c7] sm:text-lg">
					Close the tab. Keep the context.
				</p>
			</div>

			<div className="grid gap-10 py-8 sm:grid-cols-[1fr_auto] sm:items-end">
				<p className="max-w-xs text-sm leading-6 text-[#8ca493]">
					Privacy-first browser context. Your activity stays on your device.
				</p>
				<nav
					aria-label="Footer navigation"
					className="grid grid-cols-2 gap-x-12 gap-y-4 text-sm font-semibold sm:text-right"
				>
					{links.map((link) => (
						<a
							className="underline decoration-[#bfff00] decoration-2 underline-offset-4 hover:text-[#bfff00]"
							href={link.href}
							key={link.href}
						>
							{link.label}
						</a>
					))}
				</nav>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#405b4d] py-5 text-xs font-medium text-[#8ca493]">
				<span>Tabot v0.1 · shipping fast</span>
				<a
					className="flex items-center gap-2 hover:text-[#bfff00]"
					href="https://github.com/Shanvit7/tabot"
				>
					<SiGithub
						aria-hidden="true"
						className="h-4 w-4"
						color="currentColor"
					/>
					Open source on GitHub
				</a>
			</div>
		</div>
	</footer>
);
