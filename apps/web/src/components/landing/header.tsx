import SiGithub from "@icons-pack/react-simple-icons/icons/SiGithub";
import { Button } from "~/components/ui/button";

const links = [
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#privacy-first", label: "Privacy-first" },
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
			<div className="hidden items-center gap-7 pl-16 font-mono text-xs font-medium uppercase tracking-wider md:flex lg:pl-40">
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
			<div className="flex items-center gap-3">
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center gap-1.5"
						href="https://github.com/Shanvit7/tabot"
						rel="noopener"
						target="_blank"
					>
						<SiGithub size={14} />
						Star on GitHub
					</a>
				</Button>
				<Button asChild size="sm" variant="secondary">
					<a href="#get-started">Get started</a>
				</Button>
			</div>
		</nav>
	</header>
);
