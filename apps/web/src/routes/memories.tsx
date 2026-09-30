import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HomeShell } from "~/components/home-shell";
import { SearchablePicker } from "~/components/ui/searchable-picker";
import { Loading } from "~/components/ui/work-panels";
import { useHomeData } from "~/hooks/use-home-data";

type Charts = typeof import("~/lib/work-charts");
// A local-time stamp, built in the body rather than inside the markup.
const lastSeenLabel = (ms: number) => new Date(ms).toLocaleString();

const Memories = () => {
	const { derived, initialized, hasExtension } = useHomeData();
	const [charts, setCharts] = useState<Charts | null>(null);
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
	if (!initialized) return <Loading />;
	const memories = (derived?.memories ?? []).filter(
		(memory) => memory.kind === "recurrent",
	);
	const selected =
		memories.find((memory) => memory.id === selectedId) ?? memories[0];
	const lastSeen = selected ? lastSeenLabel(selected.lastSeen) : "";
	return (
		<HomeShell>
			<header className="mb-8">
				<h1 className="text-[32px] font-semibold tracking-tight sm:text-[40px]">
					Recurring patterns
				</h1>
				<p className="mt-2 max-w-xl text-sm text-[#476151]">
					Separate observed periods with similar browsing behavior. Not a claim
					about intent.
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
			{memories.length ? (
				<>
					{charts && (
						<div className="rounded-xl bg-[#f5f8f4] p-3 sm:p-6">
							<charts.MemoryChart memories={memories} />
						</div>
					)}
					<section className="mt-9 max-w-2xl" aria-labelledby="pattern-heading">
						<h2 id="pattern-heading" className="text-xl font-semibold">
							Inspect evidence
						</h2>
						<SearchablePicker
							label="Choose pattern"
							value={selected?.id ?? ""}
							options={memories.map((memory, index) => ({
								value: memory.id,
								label: `${index + 1}. ${memory.fingerprint.domains[0]?.domain ?? "Observed pattern"}`,
								keywords: [
									memory.id,
									...memory.fingerprint.domains.map((site) => site.domain),
								],
							}))}
							onChange={setSelectedId}
						/>
						{selected && (
							<div className="mt-5 border-t pt-5 work-rule">
								<p className="whitespace-pre-line break-words text-sm leading-6">
									{selected.observation
										.split("\n")
										.filter((line) => !line.startsWith("Confidence:"))
										.join("\n")}
								</p>
								<p className="mt-4 text-sm text-[#476151]">
									{selected.occurrences.length} separate periods ·{" "}
									{selected.contextCount} contexts · last seen {lastSeen}
								</p>
								<Link
									to="/home"
									search={{ context: selected.lastContextId }}
									className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline"
								>
									View supporting context on Home
								</Link>
							</div>
						)}
					</section>
				</>
			) : (
				<p className="rounded-xl bg-[#f5f8f4] p-10 text-sm text-[#476151]">
					No recurring patterns yet. Browse normally; patterns appear after
					separate periods of similar activity.
				</p>
			)}
		</HomeShell>
	);
};
export const Route = createFileRoute("/memories")({
	head: () => ({
		meta: [
			{ title: "Memories | Tabot" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: Memories,
});
