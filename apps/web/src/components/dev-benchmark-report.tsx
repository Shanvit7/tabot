import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import {
	formatMetric,
	getWinner,
	type Mode,
	metricRows,
	type Result,
} from "~/components/dev-benchmark-model";

type BenchmarkReportProps = {
	results: Partial<Record<Mode, Result>>;
	eventCount: number | null;
	prompt: string;
	promptStatus: string;
	endToEndWinner: Mode | "tie" | null;
	onCopyPrompt: () => void;
};

export const BenchmarkReport = ({
	results,
	eventCount,
	prompt,
	promptStatus,
	endToEndWinner,
	onCopyPrompt,
}: BenchmarkReportProps) => {
	const throughputRows = useMemo(
		() =>
			(["sab", "message"] as const).flatMap((mode) => {
				const result = results[mode];
				if (!result || eventCount === null || result.elapsedMs <= 0) return [];
				return [
					{
						transport: mode === "sab" ? "SharedArrayBuffer" : "postMessage",
						eventsPerSecond: eventCount / (result.elapsedMs / 1000),
						color: mode === "sab" ? "#9acb24" : "#377b68",
					},
				];
			}),
		[results, eventCount],
	);
	const throughputChart = useMemo(
		() =>
			throughputRows.length
				? defineChart({
						marks: [
							barY(throughputRows, {
								x: "transport",
								y: "eventsPerSecond",
								fill: (row) => row.color,
								maxThickness: 88,
							}),
						],
						theme: {
							foreground: "#15251b",
							muted: "#476151",
							grid: "#d2ddd2",
							background: "#ffffff",
							palette: ["#9acb24", "#377b68"],
						},
						scales: {
							x: {
								scale: () => scaleBand<string>().padding(0.32),
								axis: { tickLabels: { opacity: 1 } },
							},
							y: {
								scale: scaleLinear,
								nice: true,
								grid: true,
								axis: {
									label: "Events / second",
									tickLabels: { opacity: 1 },
									ticks: {
										format: (value) =>
											Math.round(Number(value)).toLocaleString(),
									},
								},
							},
						},
					})
				: null,
		[throughputRows],
	);

	return (
		<>
			{results && (
				<section
					className="mx-auto mt-7 w-full max-w-6xl border border-preview-line bg-white p-5 sm:p-6"
					aria-live="polite"
				>
					<h2 className="text-xl font-semibold">Full-pipeline comparison</h2>
					{endToEndWinner && (
						<p className="mt-2 text-sm leading-relaxed text-preview-muted">
							<strong className="text-preview-ink">Best overall:</strong>{" "}
							{endToEndWinner === "tie"
								? "Both transports have the same end-to-end time."
								: `${endToEndWinner === "sab" ? "SharedArrayBuffer" : "postMessage"} completed the full task faster. Compare per-metric winners below for the trade-offs.`}
						</p>
					)}
					<div className="mt-5 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
						<div className="min-w-0">
							<h3 className="text-base font-semibold">Throughput</h3>
							<p className="mt-1 text-sm text-preview-muted">
								Events handled per second; higher is faster.
							</p>
							{throughputChart && (
								<Chart
									definition={throughputChart}
									ariaLabel="SharedArrayBuffer and postMessage throughput comparison"
									initialWidth={680}
									height={320}
									className="mt-3 w-full"
								/>
							)}
						</div>
						<div className="min-w-0">
							<h3 className="text-base font-semibold">Results by metric</h3>
							<p className="mt-1 text-sm leading-relaxed text-preview-muted">
								Each value is the median of three runs. Winner labels mark the
								better result for that metric: higher throughput or lower time.
							</p>
							<div className="mt-3 overflow-x-auto">
								<table className="w-full min-w-140 border-collapse text-left text-sm">
									<thead>
										<tr className="border-b border-[#aebdaf]">
											<th
												scope="col"
												className="w-[34%] px-2 py-3 font-semibold"
											>
												Metric
											</th>
											<th
												scope="col"
												className="px-2 py-3 font-semibold text-[#4b702d]"
											>
												SharedArrayBuffer
											</th>
											<th
												scope="col"
												className="px-2 py-3 font-semibold text-[#286556]"
											>
												postMessage
											</th>
										</tr>
									</thead>
									<tbody>
										{metricRows.map(({ label, description, metric }) => {
											const winner = getWinner(results, metric, eventCount);
											return (
												<tr
													key={metric}
													className="border-b border-preview-line last:border-0"
												>
													<th
														scope="row"
														className="px-2 py-3 align-top font-medium"
													>
														{label}
														<p className="mt-1 whitespace-normal text-sm font-normal leading-relaxed text-preview-muted">
															{description}
														</p>
													</th>
													{(["sab", "message"] as const).map((mode) => (
														<td key={mode} className="px-2 py-3 align-top">
															<div className="font-mono tabular-nums">
																{formatMetric(
																	results[mode],
																	metric,
																	eventCount,
																)}
															</div>
															{winner &&
																(winner === "tie" || winner === mode) && (
																	<span className="mt-1 inline-block text-xs font-semibold text-[#365b3a]">
																		{winner === "tie" ? "Tie" : "Winner"}
																	</span>
																)}
														</td>
													))}
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
							{results.sab && results.message ? (
								<p className="mt-4 text-sm font-medium text-[#286556]">
									Output checksums match across transports.
								</p>
							) : (
								<p className="mt-4 text-sm leading-relaxed text-[#59451e]">
									SharedArrayBuffer not measured. Enable cross-origin isolation
									to compare it.
								</p>
							)}
						</div>
					</div>
					<p className="mt-6 border-t border-preview-line pt-4 text-sm leading-relaxed text-preview-muted">
						Three runs are performed per transport, with order alternated to
						reduce order effects. The median is the middle result, limiting the
						influence of unusually fast or slow runs. Worker startup and sidecar
						setup are included in end-to-end time. SharedArrayBuffer uses
						Tabot’s production event encoding; postMessage sends equivalent
						event objects. Both paths persist the replay to separate temporary
						Dexie databases, re-read it, and run the same Tabot derivation.
						Temporary databases are deleted after each run. CPU demand is an
						instrumented JS-time proxy, not actual process CPU usage.
						Main-thread blocking time reports Long Tasks API stalls during
						replay; it is a responsiveness proxy, not real-user interaction
						latency.
					</p>
					<details className="mt-5 border-t border-preview-line pt-4">
						<summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#365b3a]">
							Get an AI interpretation prompt
						</summary>
						<p className="mt-2 text-sm leading-relaxed text-preview-muted">
							Prompt includes benchmark results and methodology, not your
							captured browser events. It asks an AI to explain each metric,
							compare winners, and judge whether differences matter.
						</p>
						<textarea
							className="mt-3 min-h-64 w-full resize-y border border-[#839686] bg-[#f4f7f2] p-3 font-mono text-xs leading-relaxed text-preview-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365b3a]"
							aria-label="Prompt for an AI to interpret benchmark results"
							readOnly
							spellCheck={false}
							value={prompt}
						/>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<button
								className="min-h-11 bg-[#bfff00] px-4 font-semibold text-preview-ink transition-colors hover:bg-[#acd900] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365b3a]"
								type="button"
								onClick={onCopyPrompt}
							>
								Copy AI prompt
							</button>
							<span
								className="text-sm text-preview-muted"
								role="status"
								aria-live="polite"
							>
								{promptStatus}
							</span>
						</div>
					</details>
				</section>
			)}
		</>
	);
};
