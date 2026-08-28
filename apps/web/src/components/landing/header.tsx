import { Button } from "~/components/ui/button";

const links = [
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#local-first", label: "Local-first" },
	{ href: "#get-started", label: "Get started" },
] as const;

export const Header = () => (
	<header className="sticky top-0 z-50 border-b-2 border-black bg-lime shadow-hard-sm">
		<nav
			aria-label="Main navigation"
			className="flex items-center justify-between gap-5 px-6 py-3"
		>
			<a
				className="text-lg font-bold tracking-tight"
				href={import.meta.env.BASE_URL}
			>
				TABOT
			</a>
			<div className="hidden items-center gap-7 pl-40 font-mono text-xs font-medium uppercase tracking-wider md:flex">
				{links.map((link) => (
					<a
						className="underline-offset-4 hover:underline"
						href={link.href}
						key={link.href}
					>
						{link.label}
					</a>
				))}
			</div>
			<div className="flex items-center gap-2">
				<Button asChild size="sm" variant="secondary">
					<a
						href="https://github.com/Shanvit7/tabot"
						rel="noopener"
						target="_blank"
					>
						Star on GitHub
					</a>
				</Button>
			</div>
		</nav>
	</header>
);
