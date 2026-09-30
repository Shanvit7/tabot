import type { Derived } from "@tabot/shared";
import { useMemo, useState } from "react";
import {
	buildExportJsonl,
	downloadFile,
	exportFilename,
	filterDerived,
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
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const invalid = period === "custom" && (!from || !to || from > to);
	const data = useMemo(() => {
		if (!derived || invalid) return null;
		return period === "custom"
			? filterDerived(
					derived,
					new Date(`${from}T00:00:00`).getTime(),
					new Date(`${to}T23:59:59.999`).getTime(),
				)
			: filterDerived(derived, rangeStart(period));
	}, [derived, period, from, to, invalid]);
	const places = useMemo(
		() =>
			new Set(
				(data?.contexts ?? []).flatMap((context) =>
					context.domains.map((entry) => entry.domain),
				),
			).size,
		[data],
	);
	const stats = [
		{ label: "Things you did", value: data?.events.length ?? 0 },
		{ label: "Browsing stretches", value: data?.contexts.length ?? 0 },
		{ label: "Places", value: places },
		{ label: "Habits", value: data?.memories.length ?? 0 },
	];
	const empty = !invalid && !!data && data.events.length === 0;
	const download = async () => {
		if (!data?.events.length || busy) return;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			downloadFile(
				exportFilename(data.events, "jsonl"),
				buildExportJsonl(await sanitizeDerived(data)),
				"application/x-ndjson",
			);
			setMessage("Saved to your downloads. Tabot sent nothing anywhere.");
		} catch {
			setError(
				"Couldn't clean the file, so nothing was downloaded. Try again.",
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
					<span className="mt-1 block max-w-2xl text-sm text-[#476151]">
						Everything Tabot noticed lives on this computer. Take a copy as a
						file whenever you like — your private details are stripped out
						first, so it's safe to hand to any assistant you trust.
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
					className="mt-2 size-5 shrink-0 text-[#476151] transition-transform group-open:rotate-180"
				>
					<path d="M5 8l5 5 5-5" />
				</svg>
			</summary>
			<div className="mt-4 rounded-xl bg-[#f5f8f4] p-5 sm:p-6">
				<fieldset>
					<legend className="text-xs font-semibold uppercase tracking-wide text-[#476151]">
						What to include
					</legend>
					<div className="mt-3 inline-flex flex-wrap gap-1 rounded-lg bg-white p-1">
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
								className={`min-h-11 rounded-md px-3 text-sm transition-colors ${period === option.id ? "bg-[#15251b] font-semibold text-white" : "text-[#476151] hover:bg-[#e9eee8]"}`}
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
								value={from}
								max={to || undefined}
								onChange={(event) => {
									setFrom(event.target.value);
									setMessage("");
								}}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							To
							<input
								type="date"
								className="work-field"
								value={to}
								min={from || undefined}
								onChange={(event) => {
									setTo(event.target.value);
									setMessage("");
								}}
							/>
						</label>
					</div>
				)}
				{invalid && (from || to) && (
					<p role="alert" className="mt-3 text-sm text-[#a02d2d]">
						Pick both dates — and make sure From comes before To.
					</p>
				)}
				<p className="mt-5 text-xs text-[#476151]">
					Everything you picked is counted here — the graph above only draws the
					latest few stretches.
				</p>
				<dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{stats.map((stat) => (
						<div key={stat.label} className="rounded-lg bg-white p-3">
							<dt className="text-xs text-[#476151]">{stat.label}</dt>
							<dd className="text-lg font-semibold tabular-nums">
								{stat.value.toLocaleString()}
							</dd>
						</div>
					))}
				</dl>
				{empty && (
					<p className="mt-3 text-sm text-[#476151]">
						Nothing recorded for that stretch of time yet.
					</p>
				)}
				<button
					className="work-button mt-5"
					type="button"
					onClick={download}
					disabled={!data?.events.length || busy}
				>
					{busy ? "Preparing…" : "Download context"}
				</button>
				{error && (
					<p role="alert" className="mt-3 text-sm text-[#a02d2d]">
						{error}
					</p>
				)}
				{message && (
					<p
						role="status"
						className="mt-4 rounded-lg bg-[#e6f2ea] p-3 text-sm text-[#1f503a]"
					>
						{message}{" "}
						<a
							className="font-semibold underline"
							href="https://chatgpt.com/"
							target="_blank"
							rel="noopener noreferrer"
						>
							Open ChatGPT ↗
						</a>
					</p>
				)}
			</div>
		</details>
	);
};
