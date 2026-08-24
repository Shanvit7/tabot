import { Button } from "~/components/ui/button";

export const Header = () => (
	<header className="sticky top-0 z-50 bg-lime border-b-2 border-black shadow-hard-sm">
		<nav className="flex items-center justify-between px-6 py-3">
			<a href="/" className="font-bold text-lg tracking-tight">
				TABOT
			</a>
			<div className="hidden md:flex gap-6 font-mono text-xs uppercase tracking-wider pl-40">
				<a href="#problem" className="hover:underline underline-offset-4">
					Problem
				</a>
				<a href="#how" className="hover:underline underline-offset-4">
					How
				</a>
				<a href="#privacy" className="hover:underline underline-offset-4">
					Privacy
				</a>
				<a href="#builders" className="hover:underline underline-offset-4">
					Devs
				</a>
				<a href="#oss" className="hover:underline underline-offset-4">
					OSS
				</a>
			</div>
			<div className="flex items-center gap-2">
				<Button asChild variant="secondary" size="sm">
					<a href="https://github.com/" target="_blank" rel="noopener">
						Star on GitHub
					</a>
				</Button>
				<Button asChild size="sm">
					<a href="/metrics">Try Tabot</a>
				</Button>
			</div>
		</nav>
	</header>
);
