import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Copy, RotateCw } from "lucide-react";
import { useState } from "react";
import { readHistoryCounts } from "~/lib/history";

const ExtensionNotConnected = () => {
	const navigate = useNavigate();
	const isDevelopment = import.meta.env.DEV;
	const extensionId = import.meta.env.VITE_TABOT_EXTENSION_ID;
	const [checking, setChecking] = useState(false);
	const [checkFailed, setCheckFailed] = useState(false);
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
		"idle",
	);

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
		setCheckFailed(false);
		try {
			await readHistoryCounts();
			await navigate({ to: "/home", replace: true });
		} catch {
			setCheckFailed(true);
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

			<section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-16">
				<div className="grid gap-8 border-b border-work-line pb-10 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-12 sm:pb-12">
					<div>
						<h1 className="max-w-3xl font-display text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-balance sm:text-7xl">
							Extension not detected.
						</h1>
						<p className="mt-5 max-w-md text-base leading-7 text-work-muted">
							Enable Tabot in Chrome, then try again.
						</p>
					</div>

					<button
						type="button"
						onClick={() => void checkAgain()}
						disabled={checking}
						className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-work-ink bg-lime px-5 text-base font-semibold tracking-tight text-work-ink shadow-[3px_3px_0_0_#15251b] transition-[transform,box-shadow] duration-150 motion-reduce:transition-none hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_#15251b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-work-ink active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-40"
					>
						<RotateCw
							aria-hidden="true"
							className={`size-[18px] ${checking ? "animate-spin motion-reduce:animate-none" : ""}`}
						/>
						{checking ? "Checking…" : "Try again"}
					</button>
				</div>

				<div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
					<p className="flex flex-wrap items-center gap-x-2 text-sm text-work-muted">
						Open{" "}
						<code className="font-mono text-work-ink">chrome://extensions</code>
						<button
							type="button"
							onClick={() => void copyExtensionsUrl()}
							aria-label="Copy chrome://extensions"
							className="inline-flex min-h-9 items-center gap-1.5 px-2 font-medium text-work-muted underline decoration-work-line underline-offset-4 hover:text-work-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work-ink"
						>
							{copyState === "copied" ? (
								<Check aria-hidden="true" className="size-3.5" />
							) : (
								<Copy aria-hidden="true" className="size-3.5" />
							)}
							<span aria-live="polite">
								{copyState === "copied" ? "Copied" : "Copy"}
							</span>
						</button>
						and switch Tabot on.
					</p>
					{(checkFailed || copyState === "failed") && (
						<p role="alert" className="text-sm font-medium text-destructive">
							{copyState === "failed"
								? "Copy failed. Select the URL and copy it."
								: "Still unavailable. Check Tabot is enabled in this profile."}
						</p>
					)}
				</div>

				{isDevelopment && (
					<p className="border-t border-work-line py-4 font-mono text-xs leading-6 text-work-muted">
						Dev build · expected extension ID: {extensionId || "not configured"}
					</p>
				)}
			</section>
		</main>
	);
};

export const Route = createFileRoute("/extension-not-connected")({
	head: () => ({ meta: [{ title: "Connect Tabot · Tabot" }] }),
	component: ExtensionNotConnected,
});
