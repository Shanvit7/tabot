import { buildActivityMetrics, type Derived } from "@tabot/shared";
import { LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
	buildExportJsonl,
	downloadFile,
	exportFilename,
	filterDerived,
	formatDuration,
	rangeStart,
	sanitizeDerived,
} from "~/lib/home-data";

const periods = [
	{ id: "all", label: "All time" },
	{ id: "today", label: "Today" },
	{ id: "7d", label: "7 days" },
	{ id: "30d", label: "30 days" },
	{ id: "custom", label: "Pick dates" },
] as const;
type Period = (typeof periods)[number]["id"];

export const ExportDisclosure = ({ derived }: { derived: Derived | null }) => {
	const [period, setPeriod] = useState<Period>("all");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [busy, setBusy] = useState(false);
	const [, setMessage] = useState("");
	const [error, setError] = useState("");
	const invalid = period === "custom" && (!from || !to || from > to);
	const data = useMemo(() => {
		if (!derived || invalid) return null;
		if (period === "all") return derived;
		return period === "custom"
			? filterDerived(
					derived,
					new Date(`${from}T00:00:00`).getTime(),
					new Date(`${to}T23:59:59.999`).getTime(),
				)
			: filterDerived(derived, rangeStart(period), Date.now());
	}, [derived, period, from, to, invalid]);
	const metrics = useMemo(() => {
		if (!data) return null;
		const lastAt = data.events.reduce(
			(latest, event) => Math.max(latest, event.timestamp),
			0,
		);
		return buildActivityMetrics(data.events, 0, lastAt + 1);
	}, [data]);
	const stats = [
		{
			label: "Browsing time",
			value: metrics ? formatDuration(metrics.totalMs) : "—",
		},
		{
			label: "Days you browsed",
			value: metrics?.stats.activeDays.toLocaleString() ?? "—",
		},
		{
			label: "Websites visited",
			value: metrics?.stats.distinctSites.toLocaleString() ?? "—",
		},
		{
			label: "Repeated activity",
			value:
				data?.memories
					.filter((memory) => memory.kind === "recurrent")
					.length.toLocaleString() ?? "—",
		},
	];
	const empty = !invalid && !!data && data.events.length === 0;
	const download = async () => {
		if (!data?.events.length || busy) return;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			// Allow the loading state to paint before export work occupies the main thread.
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
			downloadFile(
				exportFilename(data.events, "jsonl"),
				buildExportJsonl(await sanitizeDerived(data)),
				"application/x-ndjson",
			);
			setMessage("Your download has started.");
		} catch {
			setError(
				"Couldn't prepare your file. Nothing was downloaded. Try again.",
			);
		} finally {
			setBusy(false);
		}
	};
	return (
		<details id="export" className="group mt-14 border-t pt-6 work-rule">
			<summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-6 py-1 [&::-webkit-details-marker]:hidden">
				<span>
					<span className="block text-lg font-semibold">
						Download your data
					</span>
					<span className="mt-1 block max-w-2xl text-sm leading-6 text-(--work-muted)">
						Save a copy of your browsing activity to your computer.
					</span>
				</span>
				<svg
					viewBox="0 0 20 20"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.75"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="mt-2 size-5 shrink-0 text-(--work-muted) group-open:rotate-180"
				>
					<path d="M5 8l5 5 5-5" />
				</svg>
			</summary>
			<div className="mt-4 rounded-xl border border-(--work-line) p-5 sm:p-6">
				<fieldset disabled={busy}>
					<legend className="text-sm font-semibold">Choose dates</legend>
					<div className="mt-3 inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-(--work-surface) p-1">
						{periods.map((option) => (
							<button
								key={option.id}
								type="button"
								aria-pressed={period === option.id}
								onClick={() => {
									setPeriod(option.id);
									setMessage("");
									setError("");
								}}
								className={`min-h-11 rounded-md px-3 text-sm ${period === option.id ? "bg-(--work-ink) font-semibold text-white" : "text-(--work-muted) hover:bg-(--work-raised)"}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</fieldset>
				{period === "custom" && (
					<div className="mt-4 flex flex-wrap gap-4">
						<label className="flex flex-col gap-1 text-sm">
							From
							<input
								type="date"
								className="work-field"
								disabled={busy}
								value={from}
								max={to || undefined}
								onChange={(event) => {
									setFrom(event.target.value);
									setMessage("");
									setError("");
								}}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							To
							<input
								type="date"
								className="work-field"
								disabled={busy}
								value={to}
								min={from || undefined}
								onChange={(event) => {
									setTo(event.target.value);
									setMessage("");
									setError("");
								}}
							/>
						</label>
					</div>
				)}
				{invalid && (from || to) && (
					<p role="alert" className="mt-3 text-sm text-[#a02d2d]">
						Choose both dates. The end date can't be before the start date.
					</p>
				)}
				<div className="mt-6 border-t border-(--work-line) pt-5">
					<h3 className="text-sm font-semibold">Your browsing</h3>
					<p className="mt-1 text-sm leading-6 text-(--work-muted)">
						{invalid
							? "Choose a start and end date."
							: !derived
								? "Loading your activity…"
								: "For the dates you chose."}
					</p>
					<dl
						aria-live="polite"
						className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4"
					>
						{stats.map((stat) => (
							<div
								key={stat.label}
								className="min-w-0 border-l border-(--work-line) pl-4"
							>
								<dt className="text-sm text-(--work-muted)">{stat.label}</dt>
								<dd className="mt-1">
									<span className="block text-2xl font-semibold tracking-tight tabular-nums">
										{stat.value}
									</span>
								</dd>
							</div>
						))}
					</dl>
					<p className="mt-5 max-w-3xl text-xs leading-5 text-(--work-muted)">
						Time is approximate. Repeated activity means similar browsing at
						different times.
					</p>
				</div>
				{empty && (
					<p role="status" className="mt-4 text-sm text-(--work-muted)">
						No browsing activity for these dates. Try choosing more days.
					</p>
				)}
				<div className="mt-6 flex justify-end border-t border-(--work-line) pt-5">
					<button
						className="cursor-pointer work-button min-w-36 w-full gap-2 sm:w-auto"
						type="button"
						onClick={download}
						aria-busy={busy}
						disabled={!data?.events.length || busy}
					>
						{busy && (
							<LoaderCircle
								aria-hidden="true"
								className="size-4 motion-safe:animate-spin"
							/>
						)}
						<span>{busy ? "Preparing…" : "Download"}</span>
					</button>
				</div>
				{error && (
					<p role="alert" className="mt-3 text-sm text-[#a02d2d]">
						{error}
					</p>
				)}
			</div>
		</details>
	);
};
