# Tabot data flow and failure handling

Production capture runs entirely in the existing MV3 service worker. Committed local activity feeds local review and search; authorized assistant requests use a separate read path with bounded projections. Neither dashboard nor MCP is an ingestion stage.

```text
Chrome lifecycle / navigation / focus / foreground samples
  + content script (150 ms signal sampling; automatic eligible-site visible excerpts; stable IDs; bounded retry)
  → service worker: validate sender/payload, capture policy, immutable metadata snapshot
  → bounded admission → Pacer Batcher (128 rows / fixed first-item 25 ms window)
  → Pacer AsyncQueuer (FIFO, concurrency 1)
  → extension storage RPC → single offscreen TalaDB owner
  → serialize validation + deduplicate, enforce page budgets, insert event/page/search-job records atomically
  → OPFS commit → persisted ACK, release admission reservation
      ├→ popup / dashboard: local messages → derive → aggregate UI
      └→ authorized MCP: local reads → sanitize/project → relay → assistant
```

## Ownership and identity

- `apps/extension/background.ts` registers Chrome/message listeners synchronously and snapshots native metadata before asynchronous admission. Native IDs are UUIDs generated once per observed callback. Tracking, idle and foreground filtering remain in effect.
- `contents/tabot.ts` coalesces scroll/key presence at 150 ms, explicitly leading/trailing. Page excerpts are captured automatically on eligible HTTP(S) pages while tracking is enabled; extraction requires foreground focus and skips editable/form/auth/incognito surfaces. It saves at most four complete visible text fragments after one-second dwell or trusted interaction. No typed values or form contents are captured.
- `page-outbox.ts` uses a UUID document instance plus monotonic sequence for telemetry and immutable UUIDs for excerpts. Payloads remain identical across retries. One bounded outbox holds up to 256 messages / 512 KiB, four active sends, three attempts, and 2 s ACK timeout. Pausing tracking removes queued excerpt payloads; active requests are still checked by the worker. No infinite retry or website storage outbox.
- `page-ingress.ts` validates separate telemetry/observation protocols, same-extension top-frame sender, current route/document, non-incognito HTTP(S), allowlisted fields, IDs and byte bounds. Excerpts require foreground eligibility and pass local URL/text redaction before queue admission through the shared `@openredaction/core` detector. Selected credential, token, connection-string, card-number and IBAN patterns are redacted; email and phone are retained. Detection uses library patterns, not project-authored detection regexes, and does not guarantee all secrets are found. Identity and resource keys are installation-keyed HMACs. Event replay bounds remain five-minute age / five-second future skew; unseen delayed events are ignored.
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

`apps/extension/storage/owner.ts` stores event/page envelopes and separate durable search-job envelopes in TalaDB's OPFS `records` collection. Only the offscreen document opens the database; the MV3 service worker and dashboard use bounded extension messaging. Stable source IDs are mapped to TalaDB ULIDs and retained in each envelope. Page payloads are sanitized before persistence and are excluded from `GET_EVENTS`.

1. Run shared selected-pattern sensitive-data redaction on captured page content and normalize both record types before mutation; page write boundary repeats redaction and allowlist validation.
2. A single serialized owner mutation preflights existing IDs, rejects conflicting identities, and reserves per-resource/day (32 KiB) plus per-origin/hour (128 KiB) budgets.
3. `records.insertMany()` writes accepted missing event/page records and their durable search-job envelopes atomically. Budget/rate limits return ignored outcomes without persistence.
4. Return ACK only after the durable TalaDB call resolves. Retries reuse stable IDs; owner loss can leave an unknown commit outcome, so replay reconciles by identity before ACK.

No Chrome API calls, external requests, backoff waits or metadata enrichment occur inside the storage mutation. OPFS failure is explicit; readers fail unavailable rather than returning empty history. A temporary native IndexedDB reader imports legacy profiles, verifies the copy, then retires `tabot_events`; it is not an active event store.

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

## Readers, diagnostics and data boundaries

`GET_EVENTS` returns committed event rows only; current dashboard does not poll it. Internal extension-page endpoints provide bounded page metadata, selected observation detail, site summaries and delete controls. Dashboard `BROWSE_LIBRARY` reads site/page/note projections; explicit `SEARCH_HISTORY` searches local event metadata, notes and retained excerpts, and `GET_PAGE_PREVIEW` returns one selected excerpt after ID/URL validation. These Chrome messages do not send history off-device or expose OPFS directly. `UPDATE_NOTE` edits existing text. MCP activity tools may search retained excerpts locally but do not return excerpt bodies/titles/paths; note tools separately return requested redacted text/title. `GET_COUNTS` is used for workspace compatibility/extension readiness; Settings displays the `GET_STORAGE_ESTIMATE` usage/quota gauge, not event/page counts. External dashboard messages require allowlisted localhost dev ports or Tabot GitHub Pages origin/path; relay authorization has its own origin check. Read failures return explicit codes, never `[]` or zero. Search/library views show unavailable/error and retry rather than interpreting failure as empty history. Tracking duration ticks locally once per second, refreshes persisted duration every 30 seconds and on focus/visibility; there is no current 1-second stats / 5-second event / 10-second popup history poll loop.

`GET_STATS` exposes health, collector/pending/active/held/outstanding rows, conservative bytes, oldest outstanding age, inserted/duplicate/ignored/coalesced/rejected counts, failures/retries, last commit/error code and last 128 successful batch timing samples. It remains an internal extension diagnostics message; dashboard does not poll it. `observed` counts pipeline calls, including replays—not physical DOM actions. `coalesced` counts shared in-flight duplicate sends, not all upstream throttle omissions. Invalid messages rejected before pipeline admission cannot be counted as stored events. Counters reset each worker activation; durable count is read from TalaDB. Compatibility `buffer*` fields mean queue budget/occupancy/peak, **not SAB slots**; `eventsProcessed/totalEvents` alias committed inserts and `droppedEvents` aliases admission rejections. None is a lifetime loss total.

Dashboard reads the extension through messaging, not direct OPFS/TalaDB access. `SEARCH_HISTORY` uses local full-text/hybrid search over event metadata and retained excerpts, then returns grouped projections; selected preview and note editing are explicit UI operations. Search jobs are indexed asynchronously in a dedicated local worker using packaged embeddings, with lexical fallback; neither excerpts nor vectors leave the device through dashboard search. MCP is read-only with allowlisted activity/site projections and a separate redacted user-note boundary; page excerpt bodies are searchable locally but not returned. MCP reads do not wait for pending ingestion. Paginated tool cursors are timestamp/offset cutoffs, not frozen database snapshots; capped search candidates and retained-data edits/deletions can change later pages. Relay disconnection does not stop local ingest or upload/replay raw telemetry. OAuth/grants are separate from local stored-data purge; see [relay README](../apps/mcp-server/README.md) and [technical contract](./tech.md#16-chatgpt-mcpoauth-relay--implemented-contract).

## Verification and remaining limits

Run `pnpm --filter extension check:ingest` for scheduler, ACK, FIFO, capacity, retry, protocol and outbox assertions; `pnpm --filter extension check:storageOwner` checks migration IDs, failed-open cleanup, search provenance/deletion and offscreen reconnect behavior; `pnpm --filter extension check:dashboardSender` checks external origin boundaries; `pnpm --filter extension check:dashboardHistory` checks dashboard projection and validation; `pnpm --filter extension check:searchEmbedding` covers worker messaging/failures; `pnpm --filter @tabot/shared check:historySearch`, `check:library` and `check:notes` cover matching, library and note behavior. User manually confirmed imported history and new capture survive a full Chrome restart; extension-origin `indexedDB.databases()` returned `[]` after migration. This verifies that profile's cutover, not quota/power-loss guarantees or every upgrading profile.

### Historical IndexedDB browser baseline (pre-TalaDB)

These measurements are the legacy IndexedDB baseline, not current TalaDB performance. They used Chrome 150 on macOS with eight reported hardware threads and the same event trace, schema and atomic helper. They are local observations, not production SLOs or a comparison with the retired best-effort SAB writer.

| Workload | Transactions: 25 ms / 0 ms / direct | p95 ACK ms: 25 ms / 0 ms / direct |
| --- | --- | --- |
| 20 events, 150 ms apart | 20 / 20 / 20 | 28.4 / 1.7 / 1.9 |
| 100 events, 5 ms apart | 20 / 100 / 100 | 29.2 / 1.0 / 1.2 |
| 1,000-event burst | 8 / 1,000 / 1,000 | 46.2 / 307.4 / 266.9 |

The 1,000-event burst completed in 61.5 / 326.1 / 278.5 ms respectively. Sparse traffic gained no transaction savings; batching added collection latency. A 10,000-event interaction overload persisted 1,920 and explicitly rejected 8,080, preserving the native/boundary reserve. Production-extension messaging at 150 ms spacing measured 31.8 ms p50 / 33.8 ms p95 ACK over 20 messages; headless focus/idle eligibility was pinned active. Worker restart, interrupted transaction, lost-ACK replay, quota recovery and capture with an offline relay passed. This does not establish power-loss durability or universal CPU/heap savings.

Full-history read/derivation costs, capped search candidate pools, retained-data pagination, multi-collection purge semantics, abrupt power loss and live assistant usefulness remain separate limits. Worker timers/alarms are not precise during sleep. Source code and local checks do not prove deployed Worker/Pages/store contents or successful live ChatGPT retrieval. No competing ingestion pipeline, raw-history upload, framework adapter or new runtime dependency was added.
