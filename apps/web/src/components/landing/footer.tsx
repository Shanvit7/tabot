import SiGithub from "@icons-pack/react-simple-icons/icons/SiGithub";
import { ArrowUpRight } from "lucide-react";

export const Footer = ({
	extensionInstalled,
}: {
	extensionInstalled: boolean | null;
}) => (
	<footer className="bg-landing-paper px-5 py-10 sm:px-10 lg:px-14">
		<div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 md:flex-row md:items-end">
			<div>
				<a
					href={import.meta.env.BASE_URL}
					className="inline-flex min-h-11 items-center text-xl font-semibold tracking-tight"
				>
					TABOT
				</a>
				<p className="mt-2 max-w-sm text-base leading-7 text-landing-muted">
					Thinking across Tabs · Version 0.2.0
				</p>
			</div>
			<nav
				aria-label="Footer navigation"
				className="flex flex-wrap gap-x-6 gap-y-2 text-base font-medium"
			>
				<a
					href={`${import.meta.env.BASE_URL}privacy`}
					className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
				>
					Privacy policy
				</a>
				{extensionInstalled && (
					<a
						href={`${import.meta.env.BASE_URL}home`}
						className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline"
					>
						Open activity <ArrowUpRight aria-hidden="true" className="size-4" />
					</a>
				)}
				<a
					href="https://github.com/Shanvit7/tabot"
					rel="noopener noreferrer"
					target="_blank"
					className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
				>
					<SiGithub aria-hidden="true" className="size-4" />
					GitHub<span className="sr-only"> (opens in a new tab)</span>
				</a>
			</nav>
		</div>
	</footer>
);
