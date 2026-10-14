# Worker transport benchmark: SharedArrayBuffer vs postMessage

## Scope

Five benchmark samples compared Tabot's `SharedArrayBuffer` (SAB) and `postMessage` worker-consumer paths using **1,691–1,757 persisted local events**. In every sample, both consumers replayed the same events, wrote to separate temporary IndexedDB databases, read them back, and ran the same Tabot derivation. Checksums matched; temporary databases were deleted and original extension data was unchanged.

Each displayed result is the median of three runs, with transport order alternated. Extension database fetch is excluded. Worker setup and sidecar transfer are included in end-to-end time. These are replayed consumer-pipeline tests—not live capture or service-worker scheduling—and one sample per event count is not evidence for every workload.

## What the five samples show

| Events | End-to-end (SAB → postMessage) | postMessage time saved | Throughput (SAB → postMessage) | Consumer pipeline (SAB → postMessage) | JS-time proxy (SAB → postMessage) | Page-thread time (SAB → postMessage) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,691 | 140.4 → 127.2 ms | 13.2 ms (10.4% vs postMessage) | 12,042 → 13,296 events/s (+9.4%) | 91.7 → 89.1 ms (2.6 ms lower) | 25.9 → 24.9 ms (1.0 ms lower) | 0.2 → 0.3 ms (SAB winner; 14.0%) |
| 1,708 | 131.6 → 130.9 ms | 0.7 ms (0.5%) | 12,980 → 13,050 events/s (+0.5%) | 90.8 → 86.9 ms (3.9 ms lower) | 26.3 → 25.1 ms (1.2 ms lower) | 0.3 → 0.3 ms (SAB winner; 10.9%) |
| 1,723 | 131.2 → 127.3 ms | 3.9 ms (3.1%) | 13,129 → 13,533 events/s (+3.0%) | 92.9 → 89.7 ms (3.2 ms lower) | 26.5 → 25.5 ms (1.0 ms lower) | 0.3 → 0.3 ms (SAB winner; 3.4%) |
| 1,737 | 142.5 → 128.9 ms | 13.6 ms (10.5%) | 12,193 → 13,479 events/s (+9.5%) | 95.2 → 90.3 ms (4.9 ms lower) | 26.7 → 25.3 ms (1.4 ms lower) | 0.3 → 0.3 ms (SAB winner; 8.6%) |
| 1,757 | 145.3 → 132.1 ms | 13.2 ms (10.0%) | 12,096 → 13,302 events/s (+9.1%) | 99.4 → 91.5 ms (7.9 ms lower) | 26.7 → 25.5 ms (1.2 ms lower) | 0.3 → 0.3 ms (SAB winner; 16.9%) |

Main-thread blocking time was **0.0 ms for both transports in all five samples**. No winner was observed for that metric.

## Metric meanings and trade-offs

- **Throughput — postMessage won 5/5.** Events per second, derived from end-to-end time; higher is better. Its advantage ranged from 0.5% to 9.5%. Since it is derived from end-to-end time, it is another view of the same overall result, not independent confirmation.
- **End-to-end time — postMessage won 5/5.** Wall-clock time from preparing input until the worker replies, including worker setup, replay, persistence, readback, and derivation. postMessage saved **0.7–13.6 ms** per sample (0.5–10.5% relative to its own time). These are small absolute durations for a roughly 1.7k-event replay; the larger gaps are measurable, but the 0.7 ms result is especially slight.
- **Page-thread time — SAB won 5/5 as reported.** Time spent encoding/writing or structured-cloning and publishing batches, including deliberate yields. This stage is only about **0.2–0.3 ms**. The UI rounds to one decimal place, so several displayed values look tied even though the unrounded values produced a winner and percentage. Treat these relative percentages cautiously: the absolute differences are tiny and sensitive to timer precision/rounding.
- **CPU demand (JS-time proxy) — postMessage won 5/5.** Instrumented synchronous JavaScript execution in the page producer and worker consumer was **1.0–1.4 ms lower** for postMessage. This estimates JS execution only; it is not process CPU usage and excludes browser internals and asynchronous IndexedDB waiting. The measured gap is small.
- **Main-thread blocking — tie in all five.** Long Tasks API duration beyond 50 ms was zero for both. This means the benchmark observed no qualifying long task; it does not establish equal responsiveness for live use or workloads that trigger long tasks.
- **Consumer pipeline time — postMessage won 5/5.** Time from consumer startup/input through event handling, temporary persistence, readback, and derivation was **2.6–7.9 ms lower** for postMessage. That is a consistent measured stage advantage in these samples, though still based on three-run medians and a single event sample per size.

## Interpretation

For these five replay samples, **postMessage was the overall winner**: it had lower end-to-end time and higher derived throughput each time. It also had lower measured consumer-pipeline time and JS-time proxy in every sample. SAB's consistent win was the page-thread publishing stage, but that stage took less than a millisecond and its rounded display obscures the absolute differences. Main-thread blocking measurements tied at zero.

Plain-language recommendation: these results do **not** show a meaningful overall advantage for SAB at this workload size; postMessage was as fast or faster end to end in every sample and its consumer stage was consistently faster. Keep this as evidence for the tested replay path, not proof that postMessage is universally better. Differences vary substantially between samples, and three runs at one event sample per size cannot establish statistical significance or predict live capture, other browsers, larger batches, or service-worker behavior. If transport choice has production impact, compare repeated raw runs and representative live workloads before changing the architecture.
