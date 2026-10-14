# Plan: simpler capture, TanStack Pacer, durable local events

**Status: batching + bounded serial writer selected for the plan. No runtime migration implemented; tuning values remain provisional.**

## 1. Decision and scope

Keep production capture and persistence inside the existing MV3 extension service worker. Remove production SharedArrayBuffer (SAB), Atomics, numeric encoding/decoding, and drain polling. Do not substitute `postMessage`, create a dedicated Web Worker, or introduce an offscreen document.

Use the already-installed **`@tanstack/pacer` 0.22.0** for bounded batching and serial write scheduling inside that service worker. Use the existing Dexie database as the durable event log. Dashboard and MCP remain independent readers of committed local data; neither becomes a history-upload pipeline.

Do not default to one Dexie transaction per selected event. Frequent events and bursts can incur repeated transaction/commit overhead and accumulate pending writes. Batching reduces transaction count; the serial queue controls application-level write concurrency and backlog. A queue alone does not reduce transaction count, and batching does not reduce the number of stored rows or index updates. IndexedDB already serializes overlapping read/write transactions on the same object store; explicit scheduling makes ownership, capacity, and failures visible rather than relying on an implicit storage backlog.

This is still **service worker → Dexie → IndexedDB**, with Pacer scheduling those same local writes—not a second worker or storage layer. Existing 150 ms scroll/key throttling reduces source traffic but does not eliminate bursts. Actual savings depend on arrival spacing; benchmark them rather than assuming every batch fills.

The contract is **commit-before-acknowledgment**, not “queued means safe.” Pacer schedules work; IndexedDB stores it. No scheduler, timer, or in-memory queue survives service-worker termination.

### What “durable” means here

- A `persisted` response means the IndexedDB transaction has committed, or an identical event already exists there.
- Committed events survive ordinary service-worker restarts and browser restarts, subject to browser storage guarantees.
- Lost acknowledgment can cause retry; stable IDs prevent a second stored event.
- Uncommitted events can still be lost. Chrome-native events have no general replay API. A content script can retry only while its originating document/context still exists.
- Browser storage deletion, extension uninstall, quota exhaustion, storage corruption, and abrupt power loss are not solved by Pacer. Transaction commit is not a promise of hardware-level fsync on every platform.

**Not promised:** zero loss from physical interaction onward, exactly-once delivery, durable in-memory retries, global causal ordering, or identical CPU/storage cost to best-effort capture. Stronger ingestion requires more actual writes; measure that cost rather than disguising it.

## 2. Current implementation: what changes and why

| Current behavior | Proposed correction |
| --- | --- |
| `background.ts` writes and drains SAB on the same JavaScript thread | Ordinary event objects; no inter-thread transport |
| 10,000 numeric slots; inline batches of 512 | Explicitly bounded admission plus small transactional batches |
| Read index and processed counters advance before async persistence | Completion and persisted counters advance only after transaction commit |
| `bulkInsertEvents()` swallows `BulkError` | Atomic transaction; any failed row aborts the batch and remains observable |
| Content script ignores messaging failure; no persisted ACK | Stable event ID, explicit response, bounded retry of ambiguous/transient failures |
| IDs contain a service-worker-local logical index | Source-generated identity independent of queue position or worker restart |
| URL/favicon enrichment happens during drain | Snapshot metadata before asynchronous queueing; retry does not re-enrich old events |
| Background ignores content message timestamp | Preserve validated capture time rather than substituting delayed handling time |
| Global foreground checks can reorder asynchronous callbacks | State clearly where FIFO begins; preserve timestamps and per-document sequence |
| Failed DB open can remain cached in background's extra `dbPromise` | Remove redundant promise cache or reset it on rejection; shared DB module already resets its cache |
| DB read failure is returned as empty history/zero count | Return explicit unavailable/error result; readers keep last successful snapshot |
| 200 ms idle poll and 50 ms follow-up | Event-driven scheduling; no polling to discover queued writes |

Historical events, retired event-type names, existing privacy rules, tracking controls, foreground semantics, and MCP authorization remain intact.

## 3. Target flow and ownership

```text
Chrome lifecycle / navigation / focus / foreground samples
                         │ direct function calls
Content script           │
  throttle noisy signals │
  assign stable ID/time  │
  retain until response  │
         │ chrome.runtime.sendMessage
         └───────────────┤
                         ▼
Existing extension service worker
  validate sender + payload; apply capture policy
  freeze complete event metadata
  reserve bounded capacity / reject explicitly
                         ▼
Pacer Batcher: up to 128 rows / 25 ms first-item window
  flush earlier on semantic boundaries
                         ▼
Pacer AsyncQueuer: FIFO batches, concurrency 1
  bounded retry of transient transaction failures
                         ▼
Dexie transaction: deduplicate + insert missing events atomically
                         ▼ COMMIT — durability boundary
  resolve persisted ACKs; release admission reservations
                         │
          ┌──────────────┴───────────────────┐
          ▼                                  ▼
Dashboard / popup                    Authorized MCP query
local runtime reads                  local reads → sanitize → relay
```

There are two pacing stages with distinct jobs: synchronous grouping and asynchronous write serialization. They share one global admission budget; they are not two independent unbounded backlogs. Batch callbacks transfer ownership synchronously to the writer. No application-wide event bus, scheduler abstraction, or second durable database.

The existing `events` table is both history and recovery source. Sessions, contexts, and patterns already rebuild on reads. Therefore **no durable job table, checkpoint, lease, or persisted Pacer state is needed** in this migration. Add those only if a future side-effecting background processor cannot rebuild from events.

## 4. Choose pacing by semantics

| Work | Utility / policy | May discard or delay? |
| --- | --- | --- |
| Scroll and key-activity presence | Existing Pacer `Throttler`, explicit 150 ms leading/trailing policy | Intermediate samples may be coalesced intentionally; no typed content captured |
| Clicks, visibility boundaries, tab lifecycle, navigation, focus changes | No debounce or rate-limit rejection for normal traffic | Preserve selected events; flush the collector promptly on boundaries |
| Database write grouping | Pacer `Batcher`, `maxSize: 128`, fixed 25 ms first-item collection window initially | Preserve admitted events; flush on size, deadline, or semantic boundary; still not durable before commit |
| Database concurrency / ordering | Pacer `AsyncQueuer`, FIFO, `concurrency: 1`, `wait: 0` | Pending batches wait; no expiration, priority reordering, or silent eviction |
| Transient DB failure | Queue's `asyncRetryerOptions` | Retry same immutable batch and IDs; do not retry permanent failures indefinitely |
| Content transport failure / unknown ACK | Pacer `AsyncRetryer`, bounded per-message retry | Retry identical event; delivery remains best effort across document destruction |
| UI-only updates / replaceable derived refresh | Debounce only if profiling shows useful savings | May coalesce recomputation, never the durable source events |
| Flood/abuse boundary | Explicit input/admission limits; Pacer rate limiter only if later justified | Reject visibly; never describe rejected events as persisted |

Do not adopt every Pacer utility just because it exists. No React Pacer adapter in content scripts or service worker. Keep current dashboard React hooks unless a concrete UI pacing change needs an adapter; do not replace existing polling merely to add hooks.

### Bounded collection window

Start with a **25 ms collection window from the first admitted item**, up to **128 rows per batch**. These are provisional tuning values, not measured throughput claims. Flush a partial batch when its window ends; do not wait indefinitely for it to fill. Sparse traffic may still produce single-row transactions.

- Record a monotonic deadline when an empty collector receives its first item. Later items must not extend it.
- Use the installed `Batcher` function-valued `wait` to return remaining time until that fixed deadline, clamped to zero. Use `getShouldExecute` to flush immediately on an admission at or beyond the deadline. Reset the deadline when the collector transfers its batch; the next nonempty batch starts a new window. No second timer or generic scheduler is needed.
- When an admitted visibility, navigation, tab lifecycle, or focus boundary arrives, include it after earlier admitted items and flush the collector immediately. Clicks remain selected events and may use the short collection window. Never bypass older writer batches or call the writer queue's `flush()`.
- Transfer each batch synchronously to `AsyncQueuer`; its normal FIFO scheduler starts at most one Dexie transaction at a time. Events arriving during an active write collect into the next bounded batch rather than starting another write themselves.
- Keep no collection timer running when empty. A short live-worker timer is not an alarm, persisted job, or keepalive mechanism. Timer throttling, a blocked event loop, sleep, or worker termination can delay/prevent execution; 25 ms is a scheduling target, not a wall-clock durability guarantee.

Collection time is only one part of capture→ACK latency: eligibility checks, writer backlog, database open/commit, and retries add more. The window deliberately increases time spent uncommitted in exchange for fewer transactions when events arrive close together. Keep ACK-after-commit and the termination/replay limits unchanged.

### Installed-version API constraints

The supplied Pacer skill is useful for concepts but has stale examples. Validate implementation against installed source:

- Queue class is `AsyncQueuer`, not `Queue`; insertion is `addItem()`, not `add()`.
- `AsyncQueuer.addItem()` returns admission **boolean**, not a persistence promise. Attach per-event completion handlers in the pipeline; do not ACK from that boolean.
- `maxSize` on the queue counts **pending batches**, not active batches or total rows. Apply the global row/byte budget separately.
- `Batcher.addItem()` and `flush()` are synchronous grouping operations. A flushed batch is not a committed batch.
- `AsyncBatcher` clears collected items before work and permits overlapping executions. Do not use it alone as a serial durable writer; the smaller synchronous `Batcher` plus serial writer makes ownership explicit.
- Queue `flush()` can execute pending items concurrently despite automatic `concurrency: 1`; do not use it for persistence. Flush the **collector**, then let normal writer scheduling drain.
- Pacer batcher timers are reset on new items; a constant `wait: 25` would act as an inactivity window, not an oldest-item deadline. Function-valued `wait` must use the fixed first-item deadline described above. Test continuous arrivals below `maxSize`, not just idle or full-batch flushing.
- Do not assume the skill's `Debouncer.maxWait`, getter methods, or queue methods exist in 0.22.0. No package upgrade required for this plan.

## 5. Ingress, identity, metadata, and acknowledgment

### Shared admission contract

Provide one `ingest` path for all production producers. Its completion means one of:

- `persisted`: committed or already present with identical identity/payload.
- `ignored`: paused, background/idle policy, or otherwise intentionally outside capture scope.
- `retryable`: temporary transport/storage pressure; not a persistence acknowledgment.
- `rejected`: invalid input, unsupported protocol, or permanent failure; no silent success.

Keep Chrome message handlers registered synchronously at module evaluation. For asynchronous content responses, retain the existing `sendResponse` pattern and return literal `true`. A response channel is not a durability guarantee or an unlimited keepalive.

### Stable identity and validation

1. Content script generates a random document-instance ID and monotonic sequence. Create event ID once before its first send; preserve ID, capture timestamp, sequence, and numeric metadata on retries.
2. Native Chrome callbacks generate a UUID once per observed event; storage retries reuse it. Never derive identity from SAB index, `Date.now()` alone, or a fresh UUID per attempt.
3. Derive tab/window/document identity from Chrome's `sender`, not message-supplied tab IDs. Validate event type allowlist, finite timestamp with a documented skew/age bound, finite per-type numeric metadata, ID format/length, and message size. Revalidate on the service-worker boundary even when the content script is trusted code.
4. Cache the normalized pending event by ID only within the bounded admission set. Duplicate in-flight sends share its completion, with bounded response waiters. Committed duplicates are checked against IndexedDB, including after restart; do not depend on an ever-growing in-memory ID set.
5. Reject same-ID/different-payload reuse rather than overwriting history. Compare source identity and immutable capture fields; optional enrichment must not mutate a stored duplicate during replay.

Snapshot URL/favicon before queueing. Native handlers should use the event's own `tab`/navigation payload where available; do not wait until a later tab state to enrich. For document messages, use validated sender/document context, not an arbitrary payload URL. An old retry must not acquire a newer navigation URL. Missing historical metadata stays missing rather than being guessed from a new page.

Do not reapply *current* focus state to a known retry and discard a previously admitted event. New, late messages that never reached admission may lack historical foreground proof: apply an explicit conservative policy and return `ignored`, not `persisted`. This remains a telemetry coverage limit, not deduplication.

### Source-side retry limits

Keep a small bounded set of unacknowledged selected page events (initial ceiling: 256 events plus a byte cap). Limit concurrent sends; do not create an unbounded retryer per DOM event. Remove an item only after `persisted`, intentional `ignored`, or a surfaced terminal failure.

Retry transport rejection, missing response, or explicit transient response with the same event. Unknown ACK can mean “commit succeeded”; deduplication must handle that. Worker owns DB retries; source owns transport retry, not a second independent DB retry loop. Coalesce duplicate in-flight IDs.

On `PAGE_HIDDEN`, flush pending trailing scroll/key samples before the visibility boundary and attempt delivery. Page unload, navigation, BFCache, extension update, and invalidated content contexts do not guarantee completion. Do not promise a page-memory outbox survives those events, and do not put private activity in the website's localStorage/IndexedDB.

## 6. Transactional persistence and replay safety

Reuse `tabot_events`, table `events`, schema `id, timestamp, type, tabId`. Keep historical IDs and rows untouched. New IDs are strings compatible with the existing primary key; no schema version bump or extra index is required merely to change ID format.

The shared DB write helper owns this boundary:

1. Validate/normalize input and deduplicate IDs inside the batch before opening the transaction.
2. In one `db.transaction('rw', db.events, ...)`, read existing IDs, detect conflicting reuse, and bulk-insert only missing events. Avoid blind replay upserts that can rewrite metadata.
3. Let all write errors escape the transaction. Do **not** swallow `BulkError` inside the transaction. Promise resolution after the transaction commits is the success condition.
4. Return inserted/duplicate counts explicitly. Resolve event ACKs and release pending capacity only after commit. Duplicate delivery does not increment persisted-event totals again.
5. Make no Chrome API calls, network requests, or backoff waits inside the Dexie transaction. Retry opens a new transaction around the same frozen rows.

Audit **all** callers of `bulkInsertEvents()` before changing its contract, including the transport benchmark worker. Either make its semantics atomic consistently or add one narrowly named atomic ingest helper while preserving benchmark behavior explicitly. Do not patch only `background.ts` and leave a helper that still lies about partial failure.

Ordering: writer starts and completes batches serially in admitted FIFO order. Capture time is not commit time. Async eligibility checks and independent Chrome sources prevent a claim of global causal order. Preserve per-document sequence and test same-millisecond visibility/navigation ties against shared derivation; never use random UUID lexical order as proof of causality. Do not rewrite all historical session IDs to introduce a new global sequence.

## 7. Capacity, retries, aborts, and service-worker lifetime

### Bounded memory and backpressure

Initial tuning values, not measured performance claims:

| Limit | Initial value |
| --- | --- |
| Rows per transaction | 128 |
| First-item collection window | 25 ms target; earlier size/boundary flush; later arrivals do not extend it |
| Concurrent writer transactions | 1 |
| Total outstanding rows, including collector, pending, active, and held failure | 2,048 |
| Total outstanding normalized payload bytes | 4 MiB, conservatively accounted |
| Capacity reserved for semantic boundary/native events | 128 rows within the total, with corresponding byte reserve |
| Transient DB attempts | 3 total; exponential base 100 ms, cap 1 s, jitter 0.2 |
| Transport attempts per retry cycle | 3 total; bounded backoff; no infinite hot loop |

Enforce row, byte, and payload-size limits **before** adding to Pacer. Reserve capacity until commit or explicit failure disposition, not until removal from Pacer's pending list. Bound callback/waiter count too. Choose queue pending-batch cap so global row admission cannot overflow it; still handle `addItem() === false` as an error without losing ownership.

At soft pressure, stop admitting additional low-value interaction samples first. At hard pressure, respond `retryable/busy` for page events. Native events cannot be paused or replayed by Chrome: use reserved capacity, then record explicit rejection if exhausted. Existing admitted events are never evicted just to make room. A bounded system cannot promise losslessness under unlimited input.

### Retry and blocked state

- Retry only classified transient database/open/transaction failures. Validation, conflicting ID, serialization, and quota/permission failures should not spin.
- Installed `AsyncRetryer` retries thrown errors without a `shouldRetry` option. One workable boundary is a typed nonretryable result for permanent failures, throwing only transient errors. ACK logic must check an explicit `committed` result: Pacer `onSuccess`, resolved `undefined`, or a settled promise alone is insufficient.
- On exhausted storage retries, **stop** writer starts, retain the failed immutable batch in one bounded held-failure slot, and expose `blocked` plus an error code. Pending work remains bounded. Do not let Pacer discard the last reference to the failed batch.
- Resume the held batch ahead of pending work on an explicit retry, a suitable new event, or a named recovery alarm; prevent repeated immediate retry cycles. Keep its original admission reservation and IDs. New calls receive backpressure while blocked. Permanent bad input must be rejected before grouping so one malformed event cannot poison unrelated events indefinitely.
- A recovery alarm is a best-effort wakeup, not persisted work. Create/recheck it as needed, clear it when healthy, and do not rely on subsecond alarm precision. Retained memory disappears on termination; an originating live content script may resend, native uncommitted events cannot be reconstructed.

### Cancellation rules

- `stop()` prevents new queue starts; it does not cancel active work. `clear()` discards pending work and is not a normal error-recovery operation.
- Do not call `abort()` on an in-flight ingestion transaction because a popup closes, a sender times out, or tracking is paused. Finish already-admitted writes; reject new capture after pause. History deletion/reset, if introduced, needs a separate explicit coordination contract.
- Pacer AbortSignal is cooperative. `chrome.runtime.sendMessage` and Dexie writes do not automatically obey it. Aborting an await does not undo a possible commit.
- Do not race IndexedDB persistence against a timeout and start another writer while the original transaction is unresolved. A watchdog may mark degraded status; it is not permission to violate single-writer ownership.
- For genuinely abortable future reads/fetches, pass `getAbortSignal()` into `fetch`, suppress stale results, and never retry deliberate cancellation. Do not retrofit unrelated MCP socket/reconnect behavior in this migration.

### Restart behavior

Reopen the same database on each worker activation. Committed history is immediately available; derived views rebuild from it. No Pacer timers, active jobs, in-memory completion callbacks, or held batches are restored. Replayed content events deduplicate through the primary key. Refresh transient metadata from actual new evidence, not invented historical state.

`onSuspend` flushing, promises returned from Chrome tab listeners, and keepalive hacks are not reliability mechanisms. No shutdown hook is necessary to make already-committed history safe.

## 8. Observable state and readers

Read Pacer `store.state` / subscribe only where needed; do not persist scheduler internals or stream event payloads into UI state. Expose a small local `GET_STATS` pipeline snapshot:

- health: `healthy`, `retrying`, `blocked`, or `unavailable`;
- collector, pending, active/held row counts; pending bytes and oldest pending age;
- committed insert count, duplicate count, intentional coalescing/policy ignores, admission rejections, write failures, and retry count;
- last successful commit time and sanitized last error code;
- measured batch size and queue/commit latency in a bounded sample window.

Counters must distinguish **observed / selected / queued / persisted / duplicate / rejected**. Pacer execution count is not persisted row count. Runtime counters reset on worker restart; durable history count comes from IndexedDB. Never present reset counters as lifetime loss totals, and never log URLs or raw payloads for diagnostics.

Migrate `StatsSnapshot`, popup loss/status display, dashboard transport, and their checks together. Remove or temporarily map `bufferCapacity`, `bufferOccupancy`, and `peakBufferOccupancy` to explicitly documented queue aliases for old dashboard compatibility; do not keep SAB language in new UI. Avoid forcing a full history count/derivation every second just to expose pacing state.

Read failures must remain distinguishable from empty results. Update internal and external event/count handlers and their clients consistently; preserve last good UI data and show degraded state. A different-origin dashboard still reads through Chrome messaging, not direct Dexie access. No `liveQuery` bridge or React adapter is needed here. MCP retains authorization and fail-closed sanitization; it reads only committed rows and does not await all pending ingestion before every request.

## 9. Implementation sequence and removal map

1. **Baseline and contract:** capture current normalized fixtures and real commit throughput/latency. Add one runnable ingest check covering the commit/ACK boundary before replacing transport.
2. **Atomic DB writes:** update `packages/shared/src/events/db.ts` and every caller; test rollback, retry identity, open-failure recovery, and existing-history reads. Preserve the v1 schema.
3. **Single-worker pipeline:** add one focused `apps/extension/event-pipeline.ts` module for admission, fixed first-item collection deadline, the two Pacer stages, completion ownership, and stats. Verify size/deadline/boundary flushing and serial writes before wiring producers. Reuse existing event types and DB helpers; no generic pipeline framework.
4. **Wire all producers:** replace `push()`/SAB drain in `apps/extension/background.ts`; snapshot metadata at the callers; preserve tracking, idle, and foreground behavior. Update `apps/extension/contents/tabot.ts` with versioned ACK/retry protocol. Keep Chrome messaging only where contexts differ.
5. **Reader compatibility:** update `packages/shared/src/lib/protocol.ts`, shared exports, `apps/web/src/lib/home-data.ts`, `apps/web/src/hooks/use-home-data.ts`, popup handlers/views, and checks for new stats/error semantics. No backend/API relay redesign.
6. **Delete obsolete production code:** remove `createBuffer`/`pushEvent` imports, slot constants, numeric type-name decoder, read/write-index logic, `processBatch`, `scheduleDrain`, fallback interval, and SAB-dependent production stats.
7. **Clean remaining SAB consumers deliberately:** `packages/shared/src/events/buffer.ts` also serves `apps/web/src/components/dev-benchmark.tsx`, `apps/web/src/workers/transport-benchmark.worker.ts`, and `buffer-roundtrip`, `sw-validation`, `sw-cost` checks. Port semantic fixtures to the new ingest path, then delete unused transport code/exports/checks. Prefer retiring the SAB-vs-postMessage demo in favor of real capture→commit measurements; if retained as historical experiment, isolate it from production bundles and label it clearly. No parallel “legacy production” implementation.
8. **Isolation and documentation:** audit extension COOP/COEP and dashboard headers before removing SAB-only isolation settings; benchmark use may still depend on them. Update `AGENTS.md`, `README.md`, `docs/tech.md`, `docs/system.md`, and `docs/data-flow.md` to describe actual single-worker flow and guarantees. Coordinate with concurrent edits; do not overwrite unrelated assistant/OAuth work.

Ship one coordinated extension build, not two live ingestion pipelines. Define a protocol version: an old content script without stable IDs cannot receive new replay guarantees. Prefer explicit reload-required/unsupported response over inventing IDs on each retry; test already-open tabs during extension update. Existing persisted rows require no destructive migration. Rollback can read new string IDs, but an old writer reinstates old reliability limits.

## 10. Failure matrix and acceptance checks

| Failure | Required behavior |
| --- | --- |
| Worker killed before commit | No persisted ACK; transaction is either committed or absent; live sender can retry same ID |
| Worker killed after commit, before ACK | Replay returns persisted without another row or double-counted insert |
| Page closes before commit | May lose uncommitted selected events; no unload-delivery guarantee |
| Message timeout / transport rejection | Bounded retry with same identity; no concurrent duplicate ingestion work |
| Partial bulk failure / transaction abort | Entire new batch rolls back; no success ACK or capacity release as if committed |
| DB open fails then recovers | Cached rejection clears; bounded retry can reopen |
| Quota / permission / invalid payload | Explicit blocked/rejected state; no infinite retries or fake empty history |
| Input outruns writer | Memory and waiters remain bounded; reserve boundary capacity; reject visibly |
| Continuous arrivals below batch size | Later items do not extend first-item deadline; partial batch flushes when timer executes |
| Boundary arrives during collection/write | Flush collector including boundary in admitted order; do not overlap or bypass active/older writes |
| Collection timer runs late or worker stops | No premature ACK; report actual pending age; termination can lose uncommitted work |
| Tracking paused during write | Stop new capture; finish already-admitted transaction |
| Popup/dashboard closes | Does not cancel capture persistence |
| Browser sleeps / alarm arrives late | Read committed history; do not invent intervening foreground activity |
| Metadata changes during backlog | Earlier event retains its own snapshot, not latest tab URL |
| Duplicate ID with different payload | Reject conflict; preserve original record |
| Repeated replay after restart | One stored row; foreground changes do not invalidate an existing committed duplicate |
| Read fails | Unavailable/stale indication, not empty dataset |
| MCP disconnected | Local ingest continues; no raw history upload or telemetry replay through relay |

Use existing `node:assert` check style. One focused `check:ingest` command should exercise actual pipeline and DB helper boundaries, not a copied decoder. Inject the commit function for deterministic scheduler/failure checks; use real browser IndexedDB for transaction rollback and restart validation. Do not call an in-memory map test proof of browser crash durability.

Required cases: continuous arrivals below 128 rows do not postpone the 25 ms first-item deadline; sparse single-item deadline flush; 128-row size flush; boundary flush includes prior items and boundary; no stale timer/deadline affecting the next batch; late timer does not imply commit or ACK; delayed commit means no ACK; duplicate before/after commit and after reopen; conflicting replay; forced row failure rolls back all rows; transient recovery; retry exhaustion preserves bounded held work; permanent failure does not hot-loop; queue saturation includes active/held work and bytes; FIFO with a slow first transaction; same-time boundary ordering; stale metadata; pause/resume; bounded abort behavior; old protocol rejection; explicit read errors. Include zero-valued coordinates/scroll and fractional numbers so removing Int32 transport does not silently change event semantics.

Browser check: capture events, terminate service worker at both sides of commit, reopen dashboard, retry known IDs, and compare actual stored rows. Repeat with simulated offline MCP, page navigation, and injected IndexedDB failure. Test production Plasmo build, not only development hot reload. Run existing foreground, pipeline, sessions, contexts, memories, activity-metrics, privacy, popup, and MCP checks; report unrelated baseline failures separately.

## 11. Performance and completion gates

Benchmark **capture→transaction commit**, not queue insertion or read-index advancement. Compare old and new on the same event trace, Chrome build, hardware, metadata, DB indexes, and durability boundary.

Measure warmed and cold DB open, sparse traffic, typical browsing after the existing 150 ms sampling, sustained frequent arrivals, 10,000-event burst, deliberately slow storage, and failed/retried transactions. Record p50/p95 commit and ACK latency, actual collection age, transactions/second, rows/transaction, CPU time, heap/pending-byte peak, oldest pending age, rejected rows, and post-restart row count. Include deduplication read cost and metadata allocation, not just Pacer execution time.

For benchmarks only, compare the selected 25 ms batch window against zero-window grouping and direct per-event writes using the same atomic helper, event trace, validation, and ACK boundary. Record transaction savings and added latency separately; do not ship competing live capture pipelines. A 25 ms window cannot combine samples that arrive 150 ms apart unless other events arrive nearby, and the queue cannot make sustained input above storage throughput disappear.

Initial targets: first-item collection window targets 25 ms without extension by new arrivals; one active transaction; no polling or collection timers while idle; normal-load p95 capture→ACK under 100 ms, including collection time, on a recorded reference machine; pending memory stays within configured bounds under overload. Latency target is provisional, not a guaranteed SLO. Burst test may reject when configured capacity is exceeded; every rejection must be accounted for. Compare accepted-event throughput separately from observed input rate.

Tune the window and batch size only from measured transaction savings, capture→ACK latency, and overload behavior. Reduce the window if savings are negligible or latency is excessive; increase it only if the measured benefit justifies more time uncommitted. Do not trade truthful durability for an impressive enqueue benchmark.

Done when production capture has no SAB/Atomics/transport worker dependency, every persisted ACK follows commit, replays are idempotent, failures stay visible, memory is bounded, committed data survives tested worker restarts, existing derivation/privacy checks pass, and actual measured performance is recorded. No new runtime dependency or framework adapter is required.

## Plan verification performed

- Local Markdown file links resolve; code fences are balanced; `git diff --check` passed.
- Runnable smoke check against installed Pacer 0.22.0 confirmed `Batcher` grouping, `AsyncQueuer.addItem()` boolean admission, pending capacity rejection, FIFO automatic execution with concurrency 1, and success callback after async completion.
- Plan update smoke check against installed Pacer 0.22.0 used a controlled clock to verify function-valued `wait` keeps a fixed 25 ms first-item deadline across new arrivals, sparse/128-row/boundary flushing, late-admission flushing, next-batch deadline reset, and idle timer cleanup. This checks scheduler behavior only, not real browser timing.
- These checks verify API/scheduler assumptions only. No capture migration, IndexedDB durability experiment, production build, or performance benchmark has been performed for the proposed pipeline yet. Those are implementation acceptance gates above.

## Sources inspected

Repository implementation:

- [Background capture and handlers](apps/extension/background.ts), [content script](apps/extension/contents/tabot.ts), [foreground tracking](apps/extension/foreground.ts).
- [Dexie helper/schema](packages/shared/src/events/db.ts), [event types](packages/shared/src/events/events.ts), [metadata sidecar](packages/shared/src/events/metadata.ts), [protocol/stats](packages/shared/src/lib/protocol.ts).
- [Dashboard transport](apps/web/src/lib/home-data.ts), [polling hook](apps/web/src/hooks/use-home-data.ts), [current flow audit](docs/data-flow.md).
- [Installed Pacer declaration](apps/extension/package.json); verified installed 0.22.0 source under `apps/extension/node_modules/@tanstack/pacer/src/`: `batcher.ts`, `async-batcher.ts`, `async-queuer.ts`, `async-retryer.ts`, `throttler.ts`, and `debouncer.ts`.
- [Supplied Pacer skill](.agents/skills/tanstack-pacer/SKILL.md), with API differences noted above.

Primary references (latest docs may differ from installed 0.22.0; installed source wins):

- [Pacer vanilla async queuing](https://tanstack.com/pacer/latest/docs/framework/vanilla/guides/async-queuing): admission boolean, pending-only capacity, FIFO/concurrency, failure ownership, and flush caveats.
- [Pacer vanilla async batching](https://tanstack.com/pacer/latest/docs/framework/vanilla/guides/async-batching): batching versus async execution ownership.
- [Pacer vanilla async retrying](https://tanstack.com/pacer/latest/docs/framework/vanilla/guides/async-retrying): idempotency, attempts, cancellation, and transient-error policy.
- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): termination, lost globals, persistent storage, and avoiding artificial keepalive.
- [Chrome runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime): message handling and shutdown limitations.
- [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()): commit promise, rollback, and transaction async boundaries.
