import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Copy, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { DingToaster, toast } from "~/components/alerts/ding-toaster";
import { ExtensionBridgeArt } from "~/components/features/extension-not-connected/system-art";
import { readHistoryCounts } from "~/lib/history";

const ExtensionNotConnected = () => {
	const navigate = useNavigate();
	const isDevelopment = import.meta.env.DEV;
	const extensionId = import.meta.env.VITE_TABOT_EXTENSION_ID;
	const [checking, setChecking] = useState(false);
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
		"idle",
	);

	useEffect(() => {
		let active = true;
		void readHistoryCounts().then(
			() => {
				if (active) void navigate({ to: "/home", replace: true });
			},
			() => {},
		);
		return () => {
			active = false;
		};
	}, [navigate]);

	const copyExtensionsUrl = async () => {
		try {
			await navigator.clipboard.writeText("chrome://extensions");
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
	};

	const checkAgain = async () => {
		if (checking) return;
		setChecking(true);
		try {
			await readHistoryCounts();
			await navigate({ to: "/home", replace: true });
		} catch (error) {
			toast.error("Tabot isn’t connected", {
				description:
					error instanceof Error
						? error.message
						: "Enable the Tabot extension in this Chrome profile, then try again.",
			});
		} finally {
			setChecking(false);
		}
	};

	return (
		<main className="flex min-h-svh flex-col bg-work-canvas px-6 text-work-ink sm:px-10">
			<header className="mx-auto flex w-full max-w-5xl items-center gap-2 py-6">
				<img
					src={`${import.meta.env.BASE_URL}logo.png`}
					alt=""
					width={26}
					height={26}
					className="size-[26px] object-contain"
				/>
				<span className="font-display text-lg font-semibold tracking-tight">
					tabot
				</span>
			</header>

			<section className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-12 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
				<div>
					<h1 className="max-w-lg text-balance font-display text-4xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-5xl">
						Tabot isn’t connected.
					</h1>
					<p className="mt-5 max-w-md text-pretty text-base leading-7 text-work-muted">
						Enable the Tabot extension in this Chrome profile, then check again.
					</p>

					<ol className="mt-8 space-y-5 text-base leading-6">
						<li className="flex gap-3">
							<span
								aria-hidden="true"
								className="pt-0.5 text-sm tabular-nums text-work-muted"
							>
								1.
							</span>
							<div className="min-w-0 flex-1">
								<p>Open Chrome’s extensions page.</p>
								<div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-work-line px-3">
									<code className="min-w-0 break-all font-mono text-sm">
										chrome://extensions
									</code>
									<button
										type="button"
										onClick={() => void copyExtensionsUrl()}
										aria-label="Copy chrome://extensions"
										className="-mr-2 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-work-muted transition-colors hover:text-work-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work-ink"
									>
										{copyState === "copied" ? (
											<Check aria-hidden="true" className="size-4" />
										) : (
											<Copy aria-hidden="true" className="size-4" />
										)}
										<span aria-live="polite">
											{copyState === "copied" ? "Copied" : "Copy"}
										</span>
									</button>
								</div>
								{copyState === "failed" && (
									<p role="alert" className="mt-2 text-sm text-destructive">
										Couldn’t copy. Select the address and copy it manually.
									</p>
								)}
							</div>
						</li>
						<li className="flex gap-3">
							<span
								aria-hidden="true"
								className="pt-0.5 text-sm tabular-nums text-work-muted"
							>
								2.
							</span>
							<p>
								Find <strong className="font-semibold">Tabot</strong> and switch
								it on.
							</p>
						</li>
					</ol>

					<button
						type="button"
						onClick={() => void checkAgain()}
						disabled={checking}
						aria-busy={checking}
						className="mt-8 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-work-ink disabled:cursor-wait disabled:opacity-60 sm:w-auto"
					>
						<RotateCw
							aria-hidden="true"
							className={`size-4 ${checking ? "animate-spin motion-reduce:animate-none" : ""}`}
						/>
						{checking ? "Checking…" : "Check connection"}
					</button>

					{isDevelopment && (
						<details className="mt-8 border-t border-work-line pt-4 text-sm text-work-muted">
							<summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-work-ink">
								Developer details
							</summary>
							<p className="mt-3 leading-6">
								Expected extension ID:{" "}
								<code className="break-all font-mono text-xs">
									{extensionId || "not configured"}
								</code>
							</p>
						</details>
					)}
				</div>
				<ExtensionBridgeArt />
			</section>
			<DingToaster position="bottom-right" theme="light" />
		</main>
	);
};

export const Route = createFileRoute("/extension-not-connected")({
	head: () => ({
		meta: [
			{ title: "Connect Tabot · Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: ExtensionNotConnected,
});
