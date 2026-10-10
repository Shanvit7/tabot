import { ArrowUpRight } from "lucide-react";
import { Button } from "~/components/ui/button";

export const Header = ({
	extensionInstalled,
	isMobileDevice,
}: {
	extensionInstalled: boolean | null;
	isMobileDevice: boolean;
}) => (
	<header className="sticky top-0 z-40 border-b-2 border-black bg-lime px-5 sm:px-10 lg:px-14">
		<nav
			aria-label="Main navigation"
			className="mx-auto flex max-w-6xl items-center justify-between gap-4 py-3"
		>
			<a
				href={import.meta.env.BASE_URL}
				aria-label="Tabot home"
				className="flex min-h-11 items-center gap-2.5 text-xl font-semibold tracking-tight"
			>
				<img
					src={`${import.meta.env.BASE_URL}logo.png`}
					alt=""
					width={32}
					height={32}
					className="size-8"
				/>
				TABOT
			</a>
			{extensionInstalled !== null && !isMobileDevice && (
				<Button
					asChild
					variant="secondary"
					className="px-4 text-base font-semibold normal-case tracking-normal"
				>
					<a
						href={
							extensionInstalled
								? `${import.meta.env.BASE_URL}home`
								: "#get-started"
						}
					>
						{extensionInstalled ? "Open activity" : "Get Tabot"}{" "}
						<ArrowUpRight aria-hidden="true" className="size-4" />
					</a>
				</Button>
			)}
		</nav>
	</header>
);
