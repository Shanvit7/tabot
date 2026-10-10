import { Link, useRouterState } from "@tanstack/react-router";
import { EMAIL } from "~/lib/constants";
import "~/styles/work.css";

export const HomeShell = ({ children }: { children: React.ReactNode }) => {
	const path = useRouterState({ select: (state) => state.location.pathname });
	return (
		<div className="work-shell">
			<a
				href="#work-content"
				className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-80 focus:bg-white focus:p-3"
			>
				Skip to content
			</a>
			<header className="border-b work-rule">
				<div className="mx-auto flex max-w-290 flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-6 lg:px-8">
					<Link
						to="/home"
						className="flex items-center gap-3 rounded-sm"
						aria-label="Tabot home"
					>
						<img
							src={`${import.meta.env.BASE_URL}logo.png`}
							alt=""
							className="size-9 rounded-md"
						/>
						<span className="text-xl font-semibold tracking-tight">Tabot</span>
					</Link>
					<nav
						aria-label="Main navigation"
						className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium"
					>
						{(
							[
								{ to: "/home", label: "Home" },
								{ to: "/activities", label: "Activities" },
								{ to: "/recurring-patterns", label: "Recurring patterns" },
							] as const
						).map(({ to, label }) => (
							<Link
								key={to}
								to={to}
								aria-current={path === to ? "page" : undefined}
								className={`inline-flex min-h-11 items-center border-b-2 transition-colors ${path === to ? "border-[#15251b] text-[#15251b]" : "border-transparent text-[#476151] hover:text-[#15251b]"}`}
							>
								{label}
							</Link>
						))}
					</nav>
				</div>
			</header>
			<main
				id="work-content"
				className="mx-auto max-w-290 px-4 pb-20 pt-10 sm:px-6 lg:px-8"
			>
				{children}
			</main>
			<footer className="border-t work-rule px-4 py-6 text-center text-xs text-[#476151]">
				<p>
					Browser activity stays local. Connected tools receive selected data
					only when you ask.
				</p>
				<nav
					aria-label="Footer navigation"
					className="mt-2 flex flex-wrap items-center justify-center gap-x-4"
				>
					<Link
						to="/privacy"
						className="inline-flex min-h-11 items-center rounded-sm px-2 underline hover:text-(--work-ink)"
					>
						Privacy
					</Link>
					<span>Version 0.2.0</span>
					<p>
						Any feedback or complaints? Reach out to{" "}
						<a
							href={`mailto:${EMAIL}?subject=Hey%20Tabot%2C%20let%27s%20talk`}
							className="inline-flex min-h-11 select-all items-center rounded-sm underline hover:text-(--work-ink)"
						>
							{EMAIL}
						</a>
						.
					</p>
				</nav>
			</footer>
		</div>
	);
};
