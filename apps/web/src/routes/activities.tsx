import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityList } from "~/components/activity-list";
import { HomeShell } from "~/components/home-shell";
import { SearchablePicker } from "~/components/ui/searchable-picker";
import { Loading } from "~/components/ui/work-panels";
import { useHomeData } from "~/hooks/use-home-data";
import { formatDuration } from "~/lib/home-data";

type Charts = typeof import("~/lib/work-charts");
const periods = ["today", "7d", "30d", "all"] as const;
type Period = (typeof periods)[number];

const stampLabel = (ms: number) => new Date(ms).toLocaleString();

const Activities = () => {
	const { derived, events, initialized, hasExtension } = useHomeData();
	const [charts, setCharts] = useState<Charts | null>(null);
	const [period, setPeriod] = useState<Period>("7d");
	const [selectedId, setSelectedId] = useState("");
	useEffect(() => {
		let alive = true;
		import("~/lib/work-charts")
			.then((module) => {
				if (alive) setCharts(module);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);
	const data = useMemo(
		() => (charts && events ? charts.buildActivityBuckets(events, period) : []),
		[charts, events, period],
	);
	if (!initialized) return <Loading />;
	const contexts = (derived?.contexts ?? []).toSorted(
		(a, b) => b.endTimestamp - a.endTimestamp,
	);
	const selected =
		contexts.find((context) => context.id === selectedId) ?? contexts[0];
	// Labels are built here, not inside the markup: the stamp is local time.
	const options = contexts.map((context) => ({
		value: context.id,
		label: `${context.primaryDomain} · ${stampLabel(context.endTimestamp)}`,
		keywords: [context.id, ...context.domains.map((site) => site.domain)],
	}));
	return (
		<HomeShell>
			<header className="mb-8">
				<h1 className="text-[32px] font-semibold tracking-tight sm:text-[40px]">
					Activity
				</h1>
				<p className="mt-2 text-sm text-[#476151]">
					When browsing happened, not a productivity score.
				</p>
			</header>
			{!hasExtension && (
				<p
					role="alert"
					className="mb-6 rounded-lg bg-[#fff2da] p-4 text-sm text-[#80500f]"
				>
					Extension not detected. Load Tabot in this Chrome profile, then
					reload.
				</p>
			)}
			<fieldset className="flex flex-wrap gap-2">
				<legend className="sr-only">Activity period</legend>
				{periods.map((option) => (
					<button
						key={option}
						type="button"
						aria-pressed={period === option}
						onClick={() => setPeriod(option)}
						className={`min-h-11 rounded-md px-4 text-sm ${period === option ? "bg-[#e9eee8] font-semibold" : "hover:bg-[#f5f8f4]"}`}
					>
						{option === "all"
							? "All time"
							: option === "today"
								? "Today"
								: option === "7d"
									? "7 days"
									: "30 days"}
					</button>
				))}
			</fieldset>
			{events?.length && charts && data.length ? (
				<div className="mt-6 rounded-xl bg-[#f5f8f4] p-3 sm:p-6">
					<charts.ActivityChart data={data} height={300} />
				</div>
			) : (
				<p className="mt-8 text-sm text-[#476151]">
					No activity recorded for this period.
				</p>
			)}
			{contexts.length > 0 ? (
				<section className="mt-10 max-w-2xl" aria-labelledby="context-heading">
					<h2 id="context-heading" className="text-xl font-semibold">
						Observed contexts
					</h2>
					<SearchablePicker
						label="Choose context to inspect"
						value={selected?.id ?? ""}
						options={options}
						onChange={setSelectedId}
					/>
					{selected && (
						<div className="mt-5 border-t pt-5 work-rule">
							<h3 className="break-words font-semibold">
								{selected.primaryDomain}
							</h3>
							<p className="mt-2 break-words text-sm text-[#476151]">
								{selected.domains
									.map((domain) => domain.domain.replace(/^https?:\/\//, ""))
									.join(" · ")}
							</p>
							<p className="mt-2 text-sm text-[#476151]">
								{formatDuration(selected.duration)} · {selected.sessionCount}{" "}
								sessions · {selected.totalEventCount} moments
							</p>
							<Link
								to="/home"
								search={{ context: selected.id }}
								className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline"
							>
								Open context on Home
							</Link>
						</div>
					)}
				</section>
			) : (
				<p className="mt-10 text-sm text-[#476151]">
					Contexts form as browsing stretches connect.
				</p>
			)}
			<details className="mt-12 border-t pt-5 work-rule">
				<summary className="min-h-11 cursor-pointer font-semibold">
					Browsing stretches ({derived?.sessions.length ?? 0})
				</summary>
				<div className="max-w-3xl">
					<ActivityList
						sessions={derived?.sessions.slice().reverse() ?? []}
						contexts={[]}
					/>
				</div>
			</details>
		</HomeShell>
	);
};
export const Route = createFileRoute("/activities")({
	head: () => ({
		meta: [
			{ title: "Activity | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Activities,
});
