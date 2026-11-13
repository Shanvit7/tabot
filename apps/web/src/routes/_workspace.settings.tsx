import { TABOT_VERSION } from "@tabot/shared/version";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, Mail, Share2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DingToaster, toast } from "~/components/alerts/ding-toaster";
import { PurgeDataConfirm } from "~/components/dialogs/purge-data-confirm";
import GaugeChart from "~/components/ui/charts/gauge-chart";
import { EMAIL, SHARE_URL } from "~/lib/constants";
import { purgeStoredData, readStorageEstimate } from "~/lib/history";

const integerFormatter = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
});

const formatBytes = (bytes: number) => {
	const units = ["bytes", "KB", "MB", "GB", "TB"];
	const unitIndex = Math.min(
		Math.floor(Math.log10(Math.max(bytes, 1)) / 3),
		units.length - 1,
	);
	const amount = bytes / 1000 ** unitIndex;
	const formatter = unitIndex === 0 ? integerFormatter : decimalFormatter;
	return `${formatter.format(amount)} ${units[unitIndex]}`;
};

const Settings = () => {
	const [storage, setStorage] = useState<{
		usageBytes: number;
		quotaBytes: number;
	} | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [shareStatus, setShareStatus] = useState("");
	const [purging, setPurging] = useState(false);
	const loadStorage = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			setStorage(await readStorageEstimate());
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Storage details could not be loaded.",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadStorage();
	}, [loadStorage]);

	const usedPercent = storage
		? Math.min(100, (storage.usageBytes / storage.quotaBytes) * 100)
		: 0;
	const availableBytes = storage
		? Math.max(0, storage.quotaBytes - storage.usageBytes)
		: 0;

	const purgeData = async () => {
		if (!(await PurgeDataConfirm.call({}))) return;
		setPurging(true);
		try {
			await toast.promise(purgeStoredData(), {
				loading: "Deleting stored data…",
				success: "Stored data deleted",
				error: (reason) =>
					reason instanceof Error
						? reason.message
						: "Stored data could not be deleted. Try again.",
			});
			await loadStorage();
		} catch {
			// toast.promise already reports purge failures.
		} finally {
			setPurging(false);
		}
	};

	const shareTabot = async () => {
		const url = SHARE_URL;
		setShareStatus("");
		try {
			if (navigator.share) {
				await navigator.share({
					title: "Tabot",
					text: "Make your browser part of your AI workflow with Tabot.",
					url,
				});
			} else {
				await navigator.clipboard.writeText(url);
				setShareStatus("Tabot link copied.");
			}
		} catch (reason) {
			if (reason instanceof Error && reason.name === "AbortError") return;
			setShareStatus(
				"Couldn’t share. Copy the page address and send it instead.",
			);
		}
	};

	return (
		<main className="min-h-svh bg-background px-6 py-6 text-foreground sm:px-10">
			<div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col">
				<header>
					<Link
						to="/home"
						className="group inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
					>
						<ArrowLeft
							aria-hidden="true"
							className="size-4 transition-transform duration-200 group-hover:-translate-x-1 motion-reduce:transition-none"
						/>
						Back
					</Link>
				</header>
				<section
					aria-labelledby="storage-title"
					aria-busy={loading}
					className="flex flex-col items-center pb-8 pt-4"
				>
					<div className="flex flex-col items-center">
						<img
							src={`${import.meta.env.BASE_URL}logo.png`}
							alt="Tabot"
							width={64}
							height={64}
							className="size-16 object-contain"
						/>
						<p className="mt-2 text-xs tabular-nums text-muted-foreground">
							v{TABOT_VERSION}
						</p>
					</div>
					<div className="mt-8 w-full max-w-2xl py-4 sm:py-6">
						{loading ? (
							<p
								role="status"
								className="py-8 text-center text-sm text-muted-foreground"
							>
								Checking storage…
							</p>
						) : error ? (
							<div className="py-3 text-center">
								<h1 id="storage-title" className="text-xl font-semibold">
									Storage
								</h1>
								<p
									role="alert"
									className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground"
								>
									{error}
								</p>
								<button
									type="button"
									onClick={() => void loadStorage()}
									className="mt-3 inline-flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								>
									Try again
								</button>
							</div>
						) : storage ? (
							<div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4 sm:gap-8">
								<div
									role="img"
									aria-label={`${usedPercent.toFixed(1)} percent of storage used`}
								>
									<GaugeChart
										size={120}
										gap={16}
										progress={usedPercent}
										circleWidth={12}
										progressWidth={12}
										progressClassName="text-primary"
										trackClassName="text-muted"
									>
										<div className="absolute inset-0 flex flex-col items-center justify-center">
											<span className="text-2xl font-semibold tabular-nums">
												{usedPercent.toFixed(1)}%
											</span>
											<span className="mt-1 text-xs text-muted-foreground">
												used
											</span>
										</div>
									</GaugeChart>
								</div>
								<div className="min-w-0 text-left">
									<h1 id="storage-title" className="text-xl font-semibold">
										Storage
									</h1>
									<p className="mt-2 text-lg font-medium tabular-nums">
										{formatBytes(storage.usageBytes)} used
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										of {formatBytes(storage.quotaBytes)} total
									</p>
									<div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
										<span className="text-muted-foreground">Available</span>
										<span className="font-medium tabular-nums">
											{formatBytes(availableBytes)}
										</span>
									</div>
								</div>
							</div>
						) : null}
					</div>
				</section>
				<section
					aria-labelledby="purge-title"
					className="mx-auto w-full max-w-2xl"
				>
					<div className="overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/[0.035]">
						<div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
							<div className="flex min-w-0 items-start gap-4">
								<div className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
									<Trash2 aria-hidden="true" className="size-5" />
								</div>
								<div>
									<p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-destructive">
										Your local copy
									</p>
									<h2 id="purge-title" className="mt-1 text-base font-semibold">
										Purge stored data
									</h2>
									<p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
										Permanently remove activity, page captures, and saved notes
										from this device.
									</p>
								</div>
							</div>
							<button
								type="button"
								disabled={purging}
								onClick={() => void purgeData()}
								className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground shadow-sm transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-destructive/90 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								{purging ? (
									<LoaderCircle
										aria-hidden="true"
										className="size-4 animate-spin"
									/>
								) : (
									<Trash2 aria-hidden="true" className="size-4" />
								)}
								Purge data
							</button>
						</div>
					</div>
				</section>
				<footer className="mx-auto mt-auto w-full max-w-3xl pb-2 pt-8">
					<section aria-labelledby="privacy-title">
						<h2 id="privacy-title" className="text-base font-semibold">
							Your privacy
						</h2>
						<p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
							Tabot stores visited page addresses, activity signals, and short
							excerpts of visible text from eligible pages on this device. It
							does not capture typed text, form entries, passwords, or full-page
							copies. Captured page titles and excerpts are filtered for
							selected sensitive patterns before they are saved. Saved notes
							stay as written on-device; when you request note results through a
							connected AI assistant, selected patterns are filtered before
							sharing. Filtering covers selected patterns only. Page excerpts
							stay on-device.
						</p>
						<Link
							to="/privacy"
							className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							Read full privacy policy
						</Link>
					</section>
					<div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<button
								type="button"
								onClick={() => void shareTabot()}
								className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								<Share2 aria-hidden="true" className="size-4" />
								Share Tabot
							</button>
							<p
								role="status"
								className="mt-1 min-h-5 text-xs text-muted-foreground"
							>
								{shareStatus}
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">
								Feedback, suggestions, or trouble?
							</p>
							<a
								href={`mailto:${EMAIL}?subject=Tabot%20feedback`}
								className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								<Mail aria-hidden="true" className="size-4" />
								{EMAIL}
							</a>
						</div>
					</div>
				</footer>
			</div>
			<DingToaster position="top-center" theme="light" />
			<PurgeDataConfirm />
		</main>
	);
};

export const Route = createFileRoute("/_workspace/settings")({
	ssr: false,
	head: () => ({ meta: [{ title: "Settings · Tabot" }] }),
	component: Settings,
});
