import type { StoredTabEvent, TabEvent } from "@tabot/shared";
import { createBuffer, pushEvent } from "@tabot/shared/events/buffer";
import { useReducer } from "react";
import {
	formatMetric,
	getWinner,
	type Mode,
	metricRows,
	metricValue,
	type Result,
} from "~/components/dev-benchmark-model";
import { BenchmarkReport } from "~/components/dev-benchmark-report";
import { fetchBenchmarkEvents } from "~/lib/home-data";

type BenchmarkState = {
	eventLimit: number;
	running: boolean;
	results: Partial<Record<Mode, Result>> | null;
	eventCount: number | null;
	error: string;
	promptStatus: string;
};
type BenchmarkAction =
	| { type: "start" }
	| { type: "eventLimit"; value: number }
	| { type: "eventCount"; value: number }
	| { type: "results"; value: Partial<Record<Mode, Result>> }
	| { type: "error"; value: string }
	| { type: "promptStatus"; value: string }
	| { type: "finish" };
const initialBenchmarkState: BenchmarkState = {
	eventLimit: 2_000,
	running: false,
	results: null,
	eventCount: null,
	error: "",
	promptStatus: "",
};
const benchmarkReducer = (
	state: BenchmarkState,
	action: BenchmarkAction,
): BenchmarkState => {
	switch (action.type) {
		case "start":
			return {
				...state,
				running: true,
				error: "",
				results: null,
				eventCount: null,
				promptStatus: "",
			};
		case "eventLimit":
			return { ...state, eventLimit: action.value };
		case "eventCount":
			return { ...state, eventCount: action.value };
		case "results":
			return { ...state, results: action.value };
		case "error":
			return { ...state, error: action.value };
		case "promptStatus":
			return { ...state, promptStatus: action.value };
		case "finish":
			return { ...state, running: false };
	}
};

export const Benchmark = () => {
	const [state, dispatch] = useReducer(benchmarkReducer, initialBenchmarkState);
	const { eventLimit, running, results, eventCount, error, promptStatus } =
		state;
	const isolated =
		globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";

	const run = async () => {
		dispatch({ type: "start" });
		try {
			const captured = await fetchBenchmarkEvents(eventLimit);
			if (captured === null)
				throw new Error(
					"Could not reach extension. Check extension ID and connection.",
				);
			if (captured.length === 0)
				throw new Error("Extension has no captured events to benchmark.");
			const events = captured.map(toReplayEvent);
			dispatch({ type: "eventCount", value: events.length });
			const runs: Record<Mode, Result[]> = { sab: [], message: [] };
			const sequence: Array<{ round: number; mode: Mode }> = [];
			for (let round = 0; round < 3; round++) {
				const order =
					round % 2
						? (["message", "sab"] as const)
						: (["sab", "message"] as const);
				for (const mode of order)
					if (mode !== "sab" || isolated) sequence.push({ round, mode });
			}
			await sequence.reduce<Promise<void>>(
				(chain, { round, mode }) =>
					chain.then(() =>
						benchmark(mode, events, captured).then((result) => {
							runs[mode].push(result);
							if (
								runs.sab[round] &&
								runs.message[round] &&
								runs.sab[round].checksum !== runs.message[round].checksum
							)
								throw new Error(
									"Checksums differ; transport comparison is invalid.",
								);
						}),
					),
				Promise.resolve(),
			);
			dispatch({
				type: "results",
				value: Object.fromEntries(
					Object.entries(runs).flatMap(([mode, rows]) =>
						rows.length ? [[mode, medianResult(rows)]] : [],
					),
				),
			});
		} catch (cause) {
			dispatch({
				type: "error",
				value: cause instanceof Error ? cause.message : String(cause),
			});
		} finally {
			dispatch({ type: "finish" });
		}
	};

	const endToEndWinner = results && getWinner(results, "elapsedMs", eventCount);
	const prompt = results ? buildAnalysisPrompt(results, eventCount) : "";
	const copyPrompt = async () => {
		try {
			await navigator.clipboard.writeText(prompt);
			dispatch({
				type: "promptStatus",
				value: "Prompt copied. Paste it into your AI assistant.",
			});
		} catch {
			dispatch({
				type: "promptStatus",
				value: "Copy failed. Select the prompt text and copy it manually.",
			});
		}
	};

	return (
		<main className="min-h-screen bg-[#f4f7f2] px-5 py-8 text-preview-ink sm:px-8 sm:py-10">
			<header className="mx-auto mb-7 flex w-full max-w-6xl flex-col gap-5 border-b border-preview-line pb-6 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight text-preview-ink sm:text-4xl">
						SharedArrayBuffer vs postMessage
					</h1>
					<p className="mt-2 max-w-2xl text-base leading-relaxed text-preview-muted">
						Full replay benchmark: compare both transports using the same
						persisted Tabot events. Each worker consumer writes to isolated
						temporary storage, then runs Tabot’s real derivation pipeline.
					</p>
				</div>
				<div
					className={`inline-flex min-h-10 w-fit shrink-0 items-center gap-2 border px-3 text-sm font-medium ${isolated ? "border-[#90a77c] bg-landing-soft text-[#203b25]" : "border-[#b59b61] bg-[#fff3d8] text-[#59451e]"}`}
					role="status"
				>
					<span
						className={`size-2 rounded-full ${isolated ? "bg-[#4b702d]" : "bg-[#916d1d]"}`}
						aria-hidden="true"
					/>
					{isolated ? "Shared memory ready" : "Enable cross-origin isolation"}
				</div>
			</header>

			<section
				className="mx-auto grid w-full max-w-6xl gap-5 border border-preview-line bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6"
				aria-label="Benchmark settings"
			>
				<label className="grid gap-2 text-sm font-medium">
					Captured events to replay (max 10,000)
					<input
						className="min-h-11 rounded-sm border border-[#839686] bg-white px-3 py-2 text-preview-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365b3a]"
						type="number"
						min="100"
						max="10000"
						step="100"
						value={eventLimit}
						onChange={(event) =>
							dispatch({
								type: "eventLimit",
								value: clamp(event.target.value, 100, 10_000),
							})
						}
					/>
				</label>
				<div className="flex items-end">
					<button
						className="min-h-12 w-full bg-[#bfff00] px-4 font-semibold text-preview-ink transition-colors hover:bg-[#acd900] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365b3a] disabled:cursor-wait disabled:opacity-60"
						type="button"
						disabled={running}
						onClick={() => void run()}
					>
						{running ? "Loading events and running…" : "Run benchmark"}
					</button>
				</div>
			</section>

			<p className="mx-auto mt-4 w-full max-w-6xl text-sm leading-relaxed text-preview-muted">
				{eventCount === null
					? "Loads latest persisted events from extension."
					: `Replaying ${eventCount.toLocaleString()} persisted events.`}{" "}
				· Extension database fetch excluded; total time includes worker setup,
				event processing, isolated persistence, and derivation.
			</p>
			{error && (
				<p
					role="alert"
					className="mx-auto mt-4 w-full max-w-6xl border border-[#a74435] bg-[#fff1ed] p-4 text-sm text-[#67291f]"
				>
					Benchmark failed: {error}
				</p>
			)}
			{results && (
				<BenchmarkReport
					results={results}
					eventCount={eventCount}
					prompt={prompt}
					promptStatus={promptStatus}
					endToEndWinner={endToEndWinner}
					onCopyPrompt={() => void copyPrompt()}
				/>
			)}
			{!results && !error && (
				<section
					className="mx-auto mt-7 w-full max-w-6xl border border-preview-line bg-white p-5 sm:p-6"
					aria-live="polite"
				>
					<h2 className="text-lg font-semibold">Results</h2>
					<div className="grid min-h-48 content-center gap-2 border-t border-preview-line mt-4 pt-4">
						<p className="text-lg font-semibold">
							{running
								? "Running comparison…"
								: "Your comparison will appear here."}
						</p>
						<p className="max-w-xl text-sm leading-relaxed text-preview-muted">
							{running
								? "Loading persisted local events, then alternating consumers across three runs."
								: "Run benchmark to compare transport plus isolated Dexie persistence and Tabot derivation. Source data stays on this device."}
						</p>
					</div>
				</section>
			)}
		</main>
	);
};

const clamp = (raw: string, min: number, max: number) =>
	Math.min(
		max,
		Math.max(min, Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : min),
	);
const median = (values: number[]) =>
	values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const medianResult = (rows: Result[]): Result => ({
	elapsedMs: median(rows.map((row) => row.elapsedMs)),
	producerMs: median(rows.map((row) => row.producerMs)),
	jsActiveMs: median(rows.map((row) => row.jsActiveMs)),
	mainThreadBlockingMs: rows.every((row) => row.mainThreadBlockingMs !== null)
		? median(rows.map((row) => row.mainThreadBlockingMs as number))
		: null,
	computeMs: median(rows.map((row) => row.computeMs)),
	checksum: rows[0].checksum,
});

const buildAnalysisPrompt = (
	results: Partial<Record<Mode, Result>>,
	eventCount: number | null,
) => {
	const metricSummary = metricRows.map(({ label, description, metric }) => {
		const winner = getWinner(results, metric, eventCount);
		const sab = results.sab && metricValue(results.sab, metric, eventCount);
		const message =
			results.message && metricValue(results.message, metric, eventCount);
		const difference =
			sab != null && message != null && message !== 0
				? `${(Math.abs((sab - message) / message) * 100).toFixed(1)}% vs postMessage`
				: "not available";
		return [
			`${label}: ${description}`,
			`  SharedArrayBuffer: ${results.sab ? formatMetric(results.sab, metric, eventCount) : "not measured"}`,
			`  postMessage: ${results.message ? formatMetric(results.message, metric, eventCount) : "not measured"}`,
			`  Winner: ${winner === "tie" ? "tie" : winner === "sab" ? "SharedArrayBuffer" : winner === "message" ? "postMessage" : "not comparable"}; difference: ${difference}`,
		].join("\n");
	});
	const checksumsMatch =
		results.sab && results.message
			? results.sab.checksum === results.message.checksum
				? "match"
				: "do not match"
			: "not compared (SharedArrayBuffer unavailable)";

	return `You are interpreting a Tabot development benchmark. Compare SharedArrayBuffer and postMessage; explain what each metric means, why it matters, which transport won each metric, and whether the size of each difference is practically meaningful for this workload. Give a plain-language recommendation without overstating the evidence.

Benchmark details:
- Same ${eventCount?.toLocaleString() ?? "unknown number of"} persisted local Tabot events replayed through both worker consumers.
- Each consumer writes events to its own temporary IndexedDB database, reads them back, then runs the same real Tabot derivation pipeline. Temporary databases are deleted; original extension data is not changed.
- Three runs per transport, order alternated; displayed values are medians. Checksums ${checksumsMatch}.
- Extension database fetch is excluded. Worker setup and sidecar transfer are included in end-to-end time. Elapsed times are wall-clock durations, not CPU time.
- This tests replayed worker-consumer pipelines, not live Chrome capture, service-worker scheduling, or every user's workload. Treat results as evidence for this sample, not a universal production winner.

Metric guidance:
- Throughput = events divided by end-to-end time; higher is better.
- End-to-end time = worker setup plus replay, persistence, readback, and derivation; lower is best overall.
- Page-thread time = elapsed time to encode/write or structured-clone and publish replay batches, including deliberate yields between batches; lower means shorter measured duration.
- CPU demand (JS-time proxy) = instrumented synchronous JavaScript execution in the page producer and worker consumer. It estimates JavaScript CPU demand, not actual process CPU usage; it excludes browser internals and asynchronous IndexedDB waiting.
- Main-thread blocking time = sum of main-thread Long Tasks API durations beyond 50 ms during each replay; lower suggests fewer long responsiveness stalls. It is unavailable when the browser lacks Long Tasks API and is a replay-time proxy, not a measurement of real-user interaction latency.
- Consumer pipeline time = elapsed time from consumer startup/input through event handling, temporary persistence, readback, and derivation; lower is faster for that stage.
- No universal “good” threshold exists. Compare absolute milliseconds saved and relative percentages; explain whether gain matters at this sample size, and note that only three runs and one event sample limit confidence.

Results:
${metricSummary.join("\n\n")}

Please interpret trade-offs, distinguish the overall end-to-end winner from per-metric winners, and identify caveats. Do not invent thresholds or claim this proves one transport is always better.`;
};

const toReplayEvent = (event: StoredTabEvent): TabEvent => ({
	type: event.type,
	tabId: event.tabId,
	windowId: event.windowId,
	timestamp: event.timestamp,
	metadata: event.metadata,
});

const yieldToWorker = () =>
	new Promise<void>((resolve) => setTimeout(resolve, 0));

const observeMainThreadBlocking = () => {
	if (
		typeof PerformanceObserver === "undefined" ||
		!PerformanceObserver.supportedEntryTypes?.includes("longtask")
	)
		return null;
	let blockingMs = 0;
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries())
			blockingMs += Math.max(0, entry.duration - 50);
	});
	observer.observe({ entryTypes: ["longtask"] });
	return () => {
		for (const entry of observer.takeRecords())
			blockingMs += Math.max(0, entry.duration - 50);
		observer.disconnect();
		return blockingMs;
	};
};

const benchmark = (
	mode: Mode,
	events: TabEvent[],
	captured: StoredTabEvent[],
) =>
	new Promise<Result>((resolve, reject) => {
		const stopObserving = observeMainThreadBlocking();
		const count = events.length;
		let sharedBuffer: ReturnType<typeof createBuffer> | null = null;
		const worker = new Worker(
			new URL("../workers/transport-benchmark.worker.ts", import.meta.url),
			{ type: "module" },
		);
		const setupStarted = performance.now();
		let setupMs = 0;
		let started = 0;
		let result: Omit<Result, "elapsedMs" | "mainThreadBlockingMs"> | null =
			null;
		let resultAt = 0;
		worker.onmessage = ({ data }) => {
			if (data.type === "ready") {
				setupMs = performance.now() - setupStarted;
				started = performance.now();
				if (mode === "sab") {
					sharedBuffer = createBuffer(count);
					worker.postMessage({ type: "start", sab: sharedBuffer.sab });
					return;
				}
				void (async () => {
					const producerStart = performance.now();
					let producerJsMs = 0;
					for (let offset = 0; offset < count; offset += 512) {
						const activeStarted = performance.now();
						worker.postMessage({
							type: "batch",
							offset,
							events: events.slice(offset, offset + 512),
						});
						producerJsMs += performance.now() - activeStarted;
						await yieldToWorker();
					}
					worker.postMessage({
						type: "finish",
						producerMs: performance.now() - producerStart,
						producerJsMs,
						count,
					});
				})().catch((cause: unknown) => {
					worker.terminate();
					stopObserving?.();
					reject(cause instanceof Error ? cause : new Error(String(cause)));
				});
				return;
			}
			if (data.type === "consuming" && mode === "sab") {
				void (async () => {
					if (!sharedBuffer)
						throw new Error("Shared buffer was not initialized");
					const producerStart = performance.now();
					let producerJsMs = 0;
					for (let offset = 0; offset < count; offset += 512) {
						const activeStarted = performance.now();
						const end = Math.min(count, offset + 512);
						for (let index = offset; index < end; index++)
							if (
								!pushEvent(
									sharedBuffer.control,
									sharedBuffer.events,
									count,
									events[index],
								)
							)
								throw new Error(
									"Shared buffer filled before replay consumer drained it",
								);
						producerJsMs += performance.now() - activeStarted;
						await yieldToWorker();
					}
					worker.postMessage({
						type: "finish",
						producerMs: performance.now() - producerStart,
						producerJsMs,
						count,
					});
				})().catch((cause: unknown) => {
					worker.terminate();
					stopObserving?.();
					reject(cause instanceof Error ? cause : new Error(String(cause)));
				});
				return;
			}
			if (data.result) {
				result = data.result;
				resultAt = performance.now();
			}
			if (data.error) {
				worker.terminate();
				stopObserving?.();
				reject(new Error(data.error));
			} else if (data.type === "done" && result) {
				worker.terminate();
				resolve({
					...result,
					mainThreadBlockingMs: stopObserving?.() ?? null,
					elapsedMs: setupMs + resultAt - started,
				});
			}
		};
		worker.onerror = (event) => {
			worker.terminate();
			stopObserving?.();
			reject(new Error(event.message));
		};
		worker.onmessageerror = () => {
			worker.terminate();
			stopObserving?.();
			reject(new Error("Worker message could not be cloned"));
		};
		worker.postMessage({
			type: "ready",
			mode,
			count,
			dbName: `tabot_benchmark_${mode}_${crypto.randomUUID()}`,
			sidecars: captured.map(({ id, url, favicon }) => ({ id, url, favicon })),
		});
	});
