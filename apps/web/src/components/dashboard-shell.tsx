import { Link } from "@tanstack/react-router";

export const DashboardShell = ({ children }: { children: React.ReactNode }) => (
	<div className="min-h-screen bg-black p-4 md:p-8">
		<main className="mx-auto max-w-6xl bg-white p-5 md:p-8">
			<header className="mb-8 flex items-center justify-between gap-4 border-b-2 border-black pb-5">
				<Link
					to="/dashboard"
					className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
				>
					<img
						src={`${import.meta.env.BASE_URL}logo.png`}
						alt="Tabot"
						className="size-12 border-hard"
					/>
					<span>
						<span className="block text-2xl font-bold tracking-tight">
							Tabot
						</span>
						<span className="block font-mono text-xs text-muted-foreground">
							Thinking across tabs.
						</span>
					</span>
				</Link>
				<nav
					aria-label="Dashboard"
					className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider"
				>
					<Link to="/activities" className="hidden hover:underline sm:block">
						Activities
					</Link>
					<Link to="/memories" className="hidden hover:underline sm:block">
						Memories
					</Link>
					<span className="inline-flex items-center gap-2 border-hard bg-black px-2 py-1 text-lime">
						<span className="size-2 bg-lime" /> Local only
					</span>
				</nav>
			</header>
			{children}
		</main>
	</div>
);
