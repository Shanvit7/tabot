# Tabot data flow and failure handling

Production capture runs entirely in the existing MV3 service worker. Dashboard and MCP are independent readers, not stages in a browser-history upload chain.

```text
Chrome lifecycle / navigation / focus / foreground samples
  + content script (150 ms scroll/key sampling, stable IDs, bounded retry)
  → service worker: validate sender/payload, capture policy, immutable metadata snapshot
  → bounded admission → Pacer Batcher (128 rows / fixed first-item 25 ms window)
  → Pacer AsyncQueuer (FIFO, concurrency 1)
  → Dexie transaction: deduplicate + insert missing rows atomically
  → COMMIT → persisted ACK, release admission reservation
      ├→ popup / dashboard: local messages → derive → aggregate UI
      └→ authorized MCP: local reads → sanitize/project → relay → assistant
```

## Ownership and identity

- `apps/extension/background.ts` registers Chrome/message listeners synchronously and snapshots native metadata before asynchronous admission. Native IDs are UUIDs generated once per observed callback. Tracking, idle and foreground filtering remain in effect.
- `contents/tabot.ts` intentionally coalesces scroll/key presence at 150 ms, explicitly leading/trailing. It flushes pending trailing samples before hidden visibility boundaries. No typed values, page text or form contents are captured.
- `page-outbox.ts` assigns one UUID document instance plus monotonic sequence. ID, timestamp, sequence and numeric metadata remain identical across retries. Up to 256 unacknowledged events / 512 KiB conservative payload allocation, four active sends, three attempts per event. ACK timeout is 2 s per attempt. Exhaustion/rejection is surfaced as a sanitized console code, then released; no infinite retry loop or website storage outbox.
- `page-ingress.ts` requires protocol version 1, same-extension sender, main frame, non-incognito HTTP(S) document, allowed type, matching ID/instance/sequence, finite metadata, and bounded message size. Time bounds: five-minute replay age, five-second future skew. Previously unseen events delayed over ten seconds are intentionally ignored because historical foreground proof is unavailable.
- Sender supplies tab/window/document identity, not payload claims. New admission requires the frozen capture URL to match Chrome's current top-frame tab URL (falling back to `sender.url`), because `sender.url` can retain the load URL after `pushState`. Unseen retries after same-document navigation are ignored rather than acquiring a newer URL. This capture URL is local-only immutable identity and the entire source descriptor is stripped at sanitized export boundaries. Favicon is an optional sender tab snapshot. Missing historical metadata is not guessed later. Native tab/navigation payloads supply their own snapshots where available.
- Existing pending IDs share completion (four response waiters maximum). A committed replay is checked before current pause/focus policy. Same-ID/different-capture-payload is rejected; replay cannot overwrite URL/favicon enrichment. No unbounded completed-ID cache.
- Historical IDs, retired event types and rows remain readable without migration. `orderEvents()` resolves timestamp ties using sequence within one source; independent sources retain their positions. UUID lexical order is never causality. Async eligibility checks mean admitted FIFO is not global physical-interaction order.

## Collection, writer, admission

`event-pipeline.ts` owns one budget across eligibility, collector, queued, active and held rows:

| Limit | Value |
| --- | ---: |
| Outstanding rows | 2,048 |
| Conservatively accounted payload allocation | 4 MiB |
| Native / semantic-boundary reserve within total | 128 rows / 256 KiB |
| Maximum normalized event | 32 KiB |
| Transaction rows | 128 maximum |
| Collection window | 25 ms from first collected item |
| Writer concurrency | 1 |
| DB attempts | 3, exponential 100 ms base / 1 s cap / 0.2 jitter |

Low-value interaction traffic cannot consume the boundary/native reserve. New arrivals beyond capacity get `retryable/busy`; admitted work is never evicted. Byte accounting is conservative serialized UTF-16 plus object allowance, **not** a claim of exact JavaScript heap size.

Later arrivals do not move the oldest-item deadline. Size, deadline or an admitted visibility/navigation/lifecycle/focus boundary flush the collector, including earlier items. Collector transfer is synchronous; writer uses normal FIFO scheduling. **Never call writer `flush()`**, which can bypass Pacer concurrency. No collection timer remains while idle. Short timers are live-worker scheduling targets, not keepalives or wall-clock durability guarantees.

## Atomic persistence

`packages/shared/src/events/db.ts` retains v1 schema `id, timestamp, type, tabId` in `tabot_events/events`:

1. Normalize/validate rows and deduplicate IDs inside input batch.
2. In one read/write transaction, read existing IDs and reject conflicting capture payloads.
3. `bulkAdd` only missing rows. All errors escape; a failed row rolls back all new rows.
4. Return inserted/duplicate counts **after transaction commit**.

There are no Chrome API calls, external requests, backoff waits or metadata enrichment inside the transaction. Retries reuse the exact rows/IDs in a new transaction. Shared failed-open cache resets; background and relay no longer add rejected-promise caches.

Transient open/transaction failures retry within the writer. Nested bulk failures retain transient/permanent classification. Quota, permission, validation, conflict and serialization failures do not hot-loop. Exhaustion/permanent failure stops new writer starts, retaining one immutable held batch plus bounded pending work. Responses indicate failure, never persisted. Suitable later events or a best-effort recovery alarm may retry transient held work after 30 s; internal `RETRY_INGEST` explicitly retries permanent held work. Held batch goes ahead of pending batches. An active write is never cancelled for pause, sender timeout or closing UI.

## ACK and restart contract

| Outcome | Meaning |
| --- | --- |
| `persisted` | Transaction committed, or identical capture already exists in committed store |
| `ignored` | Intentionally outside capture policy; not persisted |
| `retryable` | Temporary pressure/unconfirmed delivery; not persisted ACK |
| `rejected` | Invalid/unsupported/conflicting input or permanent terminal disposition |

Commit survives ordinary worker/browser restarts subject to browser storage guarantees. Unknown ACK can mean commit succeeded: retry same ID. Worker termination drops collectors, queue state, held batches, callbacks and counters. Live documents may retry; Chrome-native events have no general replay. Page unload/navigation/BFCache/extension updates do not guarantee delivery. Old content scripts receive reload-required when possible; invalidated contexts still require page reload.

**Not promised:** zero loss from physical interaction, exactly-once delivery, durable in-memory retries, global causal ordering, hardware fsync, storage-deletion recovery or cloud backup. No `onSuspend` flush or keepalive hack is a safety boundary.

## Readers, diagnostics and privacy

`GET_EVENTS` returns committed rows only. `GET_COUNTS` returns committed count, not queued/processed totals. Both internal/external read failures return `{ ok: false, code: 'storage-unavailable' }`, never `[]` or zero. Dashboard transport maps failures to unavailable; Home/popup keep last successful snapshots and show degraded state. Stats still poll at 1 s, events at 5 s, popup at 10 s; no per-second history derivation/count was added.

`GET_STATS` exposes health, collector/pending/active/held/outstanding rows, conservative bytes, oldest outstanding age, inserted/duplicate/ignored/coalesced/rejected counts, failures/retries, last commit/error code and last 128 successful batch timing samples. `observed` counts pipeline calls, including replays—not physical DOM actions. `coalesced` counts shared in-flight duplicate sends, not all upstream throttle omissions. Invalid messages rejected before pipeline admission cannot be counted as stored events. Counters reset each worker activation; durable count is separate. Compatibility `buffer*` fields mean queue budget/occupancy/peak, **not SAB slots**; `eventsProcessed/totalEvents` alias committed inserts and `droppedEvents` aliases admission rejections. None is a lifetime loss total.

Dashboard is a different origin and reads through Chrome messaging, not direct extension IndexedDB. Raw rows reach trusted local dashboard JavaScript for derivation; presentational components receive aggregates. MCP remains read-only, authorized, sanitized and fail-closed. It does not wait for pending ingestion on each request. Relay disconnection does not stop local ingest or upload/replay raw telemetry. OAuth, reconnect, grant binding and result limits are unchanged; see [relay README](../apps/mcp-server/README.md) and [technical contract](./tech.md#16-chatgpt-mcpoauth-relay--implemented-contract).

## Verification and remaining limits

Run `pnpm --filter extension check:ingest` for scheduler, ACK, FIFO, capacity, retry, protocol and outbox assertions. Real Chromium IndexedDB rollback, replay, and worker restart behavior were checked during implementation; temporary browser harnesses were removed after verification. The retained in-memory checks are not browser durability proof.

### Recorded browser measurements

Implementation verification used Chrome 150 on macOS with eight reported hardware threads. The following warmed IndexedDB runs used the same event trace, schema and atomic helper. These are local observations, not production SLOs or a comparison with the retired best-effort SAB writer.

| Workload | Transactions: 25 ms / 0 ms / direct | p95 ACK ms: 25 ms / 0 ms / direct |
| --- | --- | --- |
| 20 events, 150 ms apart | 20 / 20 / 20 | 28.4 / 1.7 / 1.9 |
| 100 events, 5 ms apart | 20 / 100 / 100 | 29.2 / 1.0 / 1.2 |
| 1,000-event burst | 8 / 1,000 / 1,000 | 46.2 / 307.4 / 266.9 |

The 1,000-event burst completed in 61.5 / 326.1 / 278.5 ms respectively. Sparse traffic gained no transaction savings; batching added collection latency. A 10,000-event interaction overload persisted 1,920 and explicitly rejected 8,080, preserving the native/boundary reserve. Production-extension messaging at 150 ms spacing measured 31.8 ms p50 / 33.8 ms p95 ACK over 20 messages; headless focus/idle eligibility was pinned active. Worker restart, interrupted transaction, lost-ACK replay, quota recovery and capture with an offline relay passed. This does not establish power-loss durability or universal CPU/heap savings.

Full-history read/derivation costs, retention/pagination, storage deletion, abrupt power loss and live assistant usefulness remain separate limits. Worker timers/alarms are not precise during sleep. No competing live ingestion pipeline, raw-history upload, framework adapter or runtime dependency was added.
