import { TABOT_VERSION } from "@tabot/shared/version";
import { Link } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { BASE_URL, GITHUB_REPOSITORY_URL, LOGO_URL } from "~/lib/constants";

export const LandingFooter = () => (
	<footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-8 text-sm text-work-muted sm:px-8">
		<div className="flex items-center gap-2">
			<a
				href={BASE_URL}
				className="flex min-h-11 cursor-pointer items-center gap-2 font-display text-lg text-work-ink"
			>
				<img src={LOGO_URL} alt="" width="28" height="28" />
				Tabot
			</a>
			<Badge variant="outline">v{TABOT_VERSION}</Badge>
		</div>
		<nav className="flex flex-wrap items-center gap-5" aria-label="Footer">
			<Link
				to="/privacy"
				className="inline-flex min-h-11 cursor-pointer items-center hover:text-work-ink"
			>
				Privacy
			</Link>
			<a
				href={GITHUB_REPOSITORY_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 hover:text-work-ink"
			>
				<Github className="size-3.5" aria-hidden="true" />
				GitHub
			</a>
		</nav>
	</footer>
);
