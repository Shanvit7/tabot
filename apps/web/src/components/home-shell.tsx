import { Link, useRouterState } from "@tanstack/react-router";
import { List, Map as MapIcon, Repeat2 } from "lucide-react";
import { EMAIL } from "~/lib/constants";

export const HomeShell = ({
	children,
	degraded = false,
}: {
	children: React.ReactNode;
	degraded?: boolean;
}) => {
	const path = useRouterState({ select: (state) => state.location.pathname });
	return (
		<div className="min-h-screen bg-work-canvas text-work-ink selection:bg-work-accent selection:text-work-ink [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-work-ink [&_a:focus-visible]:outline-offset-[3px] [&_a:focus-visible]:shadow-[0_0_0_5px_var(--work-accent)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-work-ink [&_button:focus-visible]:outline-offset-[3px] [&_button:focus-visible]:shadow-[0_0_0_5px_var(--work-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-work-ink [&_input:focus-visible]:outline-offset-[3px] [&_input:focus-visible]:shadow-[0_0_0_5px_var(--work-accent)] [&_summary:focus-visible]:outline-2 [&_summary:focus-visible]:outline-work-ink [&_summary:focus-visible]:outline-offset-[3px] [&_summary:focus-visible]:shadow-[0_0_0_5px_var(--work-accent)] [&_a]:[text-underline-offset:3px]">
			<a
				href="#work-content"
				className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-80 focus:bg-white focus:p-3"
			>
				Skip to content
			</a>
			<header className="border-b border-work-line">
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
								{ to: "/home", label: "Trail map", icon: MapIcon },
								{ to: "/activities", label: "Timeline", icon: List },
								{
									to: "/recurring-patterns",
									label: "Recurring patterns",
									icon: Repeat2,
								},
							] as const
						).map(({ to, label, icon: Icon }) => (
							<Link
								key={to}
								to={to}
								aria-current={path === to ? "page" : undefined}
								className={`inline-flex min-h-11 items-center gap-2 border-b-2 transition-colors ${path === to ? "border-work-ink text-work-ink" : "border-transparent text-work-muted hover:text-work-ink"}`}
							>
								<Icon aria-hidden="true" className="size-4" />
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
				{degraded && (
					<p role="status" className="mb-4 text-sm text-muted">
						Activity storage unavailable or catching up. Showing last successful
						snapshot, if available.
					</p>
				)}
				{children}
			</main>
			<footer className="border-t border-work-line px-4 py-6 text-center text-xs text-work-muted">
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
						className="inline-flex min-h-11 items-center rounded-sm px-2 underline hover:text-work-ink"
					>
						Privacy
					</Link>
					<span>Version 0.2.2</span>
					<p>
						Any feedback or complaints? Reach out to{" "}
						<a
							href={`mailto:${EMAIL}?subject=Hey%20Tabot%2C%20let%27s%20talk`}
							className="inline-flex min-h-11 select-all items-center rounded-sm underline hover:text-work-ink"
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
