# Plan: replace Dexie/IndexedDB with TalaDB as Tabot's primary store

**Status (2026-10-28):** TalaDB/OPFS is the active event/page store; migration reader imports, verifies, then retires legacy `tabot_events`. User manually verified one profile: old history remained, new capture worked, full Chrome quit/restart preserved data, and extension-origin `indexedDB.databases()` returned `[]`. Phase C deterministic checks pass. Isolated Chrome 150 production smoke now exposes a packaging blocker before TalaDB reports storage capabilities: `Could not resolve bundle with id lluku`. Not release-qualified; fix production worker packaging, then qualify OPFS/failure/recovery and remaining profile upgrades. Search delivery remains separate Phase E work.
**Research/test date:** 2026-10-26. **Pinned target:** `taladb@0.12.1` + `@taladb/web@0.12.1` (both npm `latest` when checked).  
**Supersedes:** the dual-store/side-index recommendation in [idea.md](./idea.md). Existing retrieval measurements remain evidence, not the proposed architecture.

## 1. Conclusion

**Yes. TalaDB can persist Tabot's events and page observations and can replace the current event database completely.** This is supported by an actual unpacked Chrome MV3 extension test, not only TalaDB's introduction or a normal web-page demo.

**Recommended target: one authoritative TalaDB database backed by OPFS, no permanent IndexedDB event store, no dual writes, no separate search database.** This plan does not require keyword/vector fusion either; a hybrid retrieval algorithm is a separate choice, not a prerequisite for storage replacement.

It is **not** a drop-in dependency swap. Two changes make a supported-API replacement feasible:

1. Host TalaDB's browser worker from an extension-owned **offscreen document**, not directly inside the MV3 service worker.
2. Store immutable event and page records in **one collection**, and serialize complete application mutations in one owner. Perform identity/budget preflight before one atomic `insertMany()` call. This avoids requiring an unavailable high-level transaction spanning two collections.

The earlier assessment treated lack of an exposed general transaction as a blocker without proving whether our data model could remove that requirement. The single-collection design addresses that limitation; it does not pretend TalaDB exposes a transaction API that it lacks.

**Verdict distinction:** implemented and manually verified for one user's profile, not production-qualified. The user confirmed existing history remained, new capture worked, and the dashboard continued to read after a full Chrome restart; extension-origin `indexedDB.databases()` returned `[]`. This does not cover real quota/process-crash behavior, every upgrading profile, or useful recall on real questions. No engine fork has been shown necessary.

### Current execution status

- **Implemented and user-verified for one profile:** packaged TalaDB worker via Plasmo; offscreen owner; OPFS-backed records; legacy copy verification/import; legacy IndexedDB database removed; history and new capture survived full Chrome quit/restart.
- **Implemented, broader qualification open:** bounded writer/messaging, failed-owner recovery, migration-only native IndexedDB reader, deterministic regression/failure checks. User manually verified one profile. Agent-browser Phase C uses disposable profile `/tmp/tabot-phase-c-prod`, no user data.
- **Still open:** quota/forced-crash/unknown-ACK qualification and upgrade coverage for remaining profiles/schema variants. Keep migration reader until the supported upgrade population is deliberately retired. Retrieval outcome work is a separate Phase E product objective, not a prerequisite for IndexedDB retirement.
- **Cutover caveat:** code retires the legacy database automatically after verification; original proposal called for explicit retirement confirmation. Do not claim that confirmation gate was implemented for all profiles.

## 2. What was actually verified

### Test environment

Disposable unpacked MV3 extension, separate temporary browser profile, Chrome 150 on macOS, driven with `agent-browser`. All fixtures synthetic; no Tabot user database opened. JS/WASM/worker assets copied from the published packages and loaded locally. No CDN executable code, embedding model, popup, dashboard, or remote history service was required for persistence.

Test manifest used:

- `offscreen` permission; `WORKERS` reason; an offscreen static HTML page hosting the browser client.
- `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'` for extension pages.
- `cross_origin_embedder_policy: { value: 'require-corp' }` and `cross_origin_opener_policy: { value: 'same-origin' }`.
- Module service worker; Chrome 116 minimum for `runtime.getContexts()`.

The offscreen document reported `crossOriginIsolated: true`. TalaDB reported `storage: 'opfs'`, `owner: true`, `durableWrites: true`, `storageError: null`.

### Observations

| Check | Observed result | What it establishes / does not establish |
| --- | --- | --- |
| Mixed ingestion | One `insertMany()` persisted **112 event + 16 page records** | Both domain types can live in one atomic collection operation. Not a port of Tabot's admission logic. |
| Domain payloads | All 128 records matched reconstructed fixture data after removing TalaDB's added `_changed_at` | Nested source metadata, segments, logical IDs, timestamps, and supplied deterministic `_id` round-tripped. JSON key order is not significant. |
| Existing-ID conflict | Batch containing a new row plus an existing `_id` rejected; count stayed 128; new row absent | No partial insertion on this duplicate failure. App-level same-source replay still needs its own preflight. |
| Invalid ID / repeated batch ID | Both batches rejected; preceding new row absent | Supplied `_id` must be a valid ULID; row-validation/duplicate failures rolled back tested inserts. |
| Offscreen termination | Closed owner without `db.close()`/explicit flush, recreated it, recovered all 128 rows | Acknowledged records outlive the document/worker. Not an OS power-loss test. |
| Browser restart | Closed browser, relaunched same isolated profile/extension path, recovered all 128 rows | Data was not merely in a surviving page's RAM. This was a normal browser shutdown, not forced process kill. |
| Query parity primitives | B-tree/compound indexes, half-open timestamp filter, `$sort`, `$limit`, event/page discrimination passed | Required range/order primitives exist; unsorted `find()` must not replace indexed chronological reads. |
| Deletion | Deleted two matching page fixtures, terminated owner, recovered only the unrelated page | Filtered deletion persists. Does not yet exercise Tabot consent UI or all retention rules. |
| OPFS error injection | Replaced `FileSystemSyncAccessHandle.flush()` in the disposable worker with a throwing test hook | Write rejected, further reads/writes failed until reopen. After reopen the failed write's row **was present**: rejected I/O can have an unknown commit outcome. No false success was observed. This was not actual disk exhaustion. |
| 10,000-document run | 9,843 events + 157 pages; 79 batches of at most 128; all survived owner termination **and browser restart** | Useful persistence/volume smoke test; not a long-lived production workload. |

Fault injection changed only a temporary copy of the worker. Earlier persistence/rollback checks used stock published packages. Later load measurements used that copy with the fault disabled. No library/product changes were made.

### Diagnostic timings, not comparative benchmarks

One warm synthetic run: 10,000 input documents / 2,691,594 JSON bytes, timestamp and kind/time indexes, durable writes enabled:

- All 79 batch calls: **312.14 ms** total; batch p50 **3.76 ms**, p95 **5.41 ms**.
- Sorted 100-row time-range query: **5.55 ms**.
- Recreate offscreen owner and reopen database: **33.49 ms**.
- Origin storage estimate: approximately **9.38 MB**, including all probe collections and storage overhead—not just the 2.69 MB load fixture.

These include probe runtime-message hops, but exclude Tabot sanitization, budget accounting, derivation, model inference, and search-index maintenance. No Dexie baseline, repeated statistical sampling, cold-start claim, battery claim, or speedup claim.

**Important failure lesson:** after an I/O error, do not infer “nothing was committed” and do not continue reading through the poisoned handle. Reopen, reconcile immutable identities, then resolve retries. That is essential to truthful ACKs.

## 3. Target architecture: one database

```text
Chrome/content events
  → existing MV3 coordinator: sender/policy checks + bounded Pacer pipeline
  → authenticated, bounded internal storage RPC
  → extension-owned offscreen document: one serialized mutation owner
  → TalaDB DedicatedWorker + Web Lock
  → atomic records.insertMany() → durable OPFS commit
  → commit response → persisted ACK

Dashboard / authorized MCP tool
  → existing extension transport and authorization
  → bounded reads from the same TalaDB database
  → existing derivation / approved derived-search documents
  → sanitized response
```

The service worker stays ephemeral; no new keepalive polling. Offscreen `WORKERS` use is documented by Chrome; unlike `AUDIO_PLAYBACK`, it has no reason-specific 30-second lifetime limit. Nevertheless, disappearance/recreation must be normal, recoverable states. It is not a promise of an immortal background page. [C1]

Only the offscreen owner opens a writable application database. Dashboard, popup, content scripts, relay, and shared derivation code do not acquire their own TalaDB handles. This also avoids relying on multi-client coordination for application-level transactions.

**Keep `chrome.storage.local` for preferences, connection state, and existing consent settings.** Replacing the event database does not require moving Chrome's settings API or the relay's independent OAuth state.

### Packaging and startup

- Package exact-version browser JS, worker modules, and WASM as extension assets. Verify real Plasmo production URLs; the successful raw extension fixture does not prove Parcel/Plasmo rewrites them correctly.
- Use an offscreen entry page and a small typed coordinator proxy; keep TalaDB runtime imports out of shared pure modules, dashboard SSR, and content scripts.
- Register service-worker listeners synchronously. Deduplicate concurrent offscreen creation, authenticate readiness, and reattach after coordinator restart.
- Require `storageInfo().storage === 'opfs'` and durable writes before exposing primary storage as ready. Reject unsupported/failed storage explicitly. Do not silently open an empty memory database or accept TalaDB's IndexedDB snapshot fallback as the final design.
- Request only necessary new permissions (`offscreen`; evaluate, justify, and test any proposed `unlimitedStorage` permission separately). Check quota/headroom; browser storage is not a backup.
- Verify CSP/isolation effects on popup images, resources, OAuth/navigation, and existing external messaging. No remotely hosted executable code or general `unsafe-eval`. [C2]

## 4. Data model and transactional contract

### Authoritative collection: `records`

Illustrative envelope, not implementation:

```ts
{
  _id: deriveDocId('tabot:records:v1', `${recordKind}:${originalId}`),
  recordKind: 'event' | 'page',
  originalId,
  timestamp,
  pageKey?,   // page-only lookup metadata
  origin?,    // normalized page origin for budgets/deletion
  payload: sanitizedOriginalStoredRow
}
```

Retain original domain IDs, source/capture identities, and payload fields. TalaDB's ULID `_id` is an internal lookup key, **not** a replacement source identity. `deriveDocId()` is deterministic but not a cryptographic collision guarantee: a returned row must still match `recordKind`, `originalId`, and the existing event/page identity rules. Reject mismatches rather than overwriting. [T3]

TalaDB adds fields such as `_changed_at`. Unwrap `payload` for application consumers; do not leak storage metadata, envelope fields, or engine ordering into existing exports and relay contracts.

Start with indexes for `(recordKind, timestamp)`, `(recordKind, originalId)` as needed, and page resource/time/origin queries. Match actual planner support and query measurements before adding redundant indexes. Always specify chronological ordering and deterministic ties where existing derivation expects them.

### Other collections in the same database

- `meta`: storage schema/version, migration state, derivation checkpoints. Checkpoints are written **after** the data they describe; replay must tolerate an interrupted checkpoint update.
- Derived context/resource search documents, when implemented: rebuildable projections of committed `records`, with source IDs, derivation version, time/domain scope, and permitted text. Not another source of truth or another database.

Do not persist a second copy of every low-level event as a search document or embed every click/scroll.

### Commit algorithm

All application mutations—including ingestion, deletion, retention, migration, and derived invalidation—pass through one bounded owner-side mutation lane. Serializing only individual worker calls is insufficient: the whole read/check/write operation must be protected.

1. Validate/sanitize snapshots before storage; preserve current trust-boundary checks and consent policy. Recheck any required authorization/version at the mutation boundary.
2. Normalize incoming IDs; deduplicate within the batch using existing identity rules. Same-ID/different-capture conflict rejects the operation before writes.
3. Within the owner mutation lane, fetch candidate existing records; compare original identity and existing payload enrichment rules. Replays count as duplicates, never upserts.
4. Compute current page budgets against committed page records plus accepted incoming pages in timestamp order. Preserve existing resource/day, site/hour, recent-capture, and accounting-limit behavior. Ignored pages retain explicit reason codes.
5. Build one array of missing event records and accepted page records. Make **one** `records.insertMany()` call. Empty-array/replay-only paths must still require a healthy, authoritative storage session.
6. Return existing inserted/duplicate/ignored result semantics only after the durable call resolves. Pipeline ACK follows that result, never admission, RPC submission, or eventual flushing.

**Why this works:** read-dependent validation cannot race another application mutation; the final multi-kind insert is one native transaction in one collection. There is no claim of a general multi-call/multi-collection transaction. If later code opens another writer or modifies `records` outside this lane, this argument no longer holds. [T2][T4]

Derived writes can trail raw commits and be rebuilt; their checkpoint must never advance ahead of source commits. A derived-index failure must not retroactively turn a durable raw event into an unpersisted one. Reads must not expose partial application maintenance as an apparently complete result.

### Failure/retry contract

- Bound request count, bytes, owner queue, and response time; preserve the current 128-row / 25 ms batching and bounded held/retry behavior. Do not hide unbounded memory behind a promise chain or a second scheduler.
- Missing owner, failed open, no OPFS, storage I/O errors, or RPC timeout yield unavailable/retryable/held outcomes—not `persisted`, an empty history, or a new blank database.
- After storage errors, discard/reopen the poisoned session before reconciliation; do not use `storageInfo()` alone as a health check for every OPFS failure.
- Owner death / lost response can mean committed-but-unacknowledged. Stable-ID preflight on retry recognizes matching records and avoids double insertion; conflicting identity still rejects.
- Do not blindly retry non-idempotent updates. Primary captured records remain immutable; maintenance needs explicit idempotent predicates/checkpoints.
- Pending in-memory captures still are not durable before commit. This migration does not invent a durable pre-commit queue or guarantee zero loss during browser shutdown.

## 5. Original implementation map (historical)

This table recorded proposed work before implementation. Current status is above; do not treat the rows as unimplemented TODOs.

| Area | Planned work |
| --- | --- |
| `packages/shared/src/events/db.ts` | Replace Dexie implementation and exported Dexie-shaped handle with the domain storage API; preserve sanitation, immutable identity, counts/ranges, page budgets, deletion, and retention semantics. Separate browser runtime hosting from shared record logic. |
| `packages/shared/src/index.ts` and DB-typed derivation modules | Export/use the minimal domain methods actually required. Keep pure session/context/memory/graph algorithms unchanged; do not manufacture a Dexie query-chain compatibility layer. |
| `apps/extension/background.ts` | Replace direct `.events.get()` lookup and `createEventsDb()` wiring with typed owner calls. Route all mutation kinds consistently. Preserve top-level listeners, capture policy, relay behavior, and truthful errors. |
| New extension offscreen entry / storage owner / coordinator proxy | Local runtime hosting, startup handshake, bounded protocol, serialized high-level mutations, recovery. Proposed file names chosen during implementation to match Plasmo's entry-page rules. |
| `apps/extension/event-pipeline.ts` | Reuse existing Pacer/serial-writer contract. Change only the commit boundary/proxy integration if required; no new transport worker experiment. |
| `apps/extension/package.json`, dependency ownership, lockfile | Pin browser dependencies, package local assets, add reviewed manifest policy/permission changes. Remove runtime Dexie use after migration support is addressed. |
| Existing ingestion/page/pipeline checks and fakes | Test domain behavior without assuming a Dexie table object; add real packaged-browser checks instead of calling mocks durability tests. |
| Popup/dashboard count contracts | Remove misleading internal Dexie/RxDB terminology in coordinated producer/consumer changes, or preserve compatibility aliases explicitly during a short version transition. Do not silently break existing extension/dashboard versions. |
| Documentation / privacy text / store permission disclosures | Update architecture, storage lifecycle, migration, support/recovery, and offscreen justification. No claim of cloud backup or automatic sync. |

The exact caller inventory and sequencing must be finalized against the repository before implementation; this is not permission to rewrite unrelated UI, relay hosting, React Query, or Graphology.

## 6. Migration: temporary copy, then one store

A temporary verified import is not the proposed steady-state hybrid architecture. **No permanent shadow IndexedDB database or ongoing dual writes.** Few users make rollout easier; they do not make silent history loss acceptable.

1. **Explicit migration/startup state.** Pause admission and settle current writes before taking a source snapshot. Captures that cannot be durably admitted must not receive persisted ACKs. Surface blocked/migrating storage, not empty history. New installs skip legacy migration entirely.
2. **Preflight.** Identify the existing extension-owned `tabot_events` v1/v2 database without accidentally creating a blank legacy database. Check available storage for old data + new OPFS file + indexes + temporary overhead. Obtain explicit confirmation for verified legacy retirement; do not assume early users consent to deletion.
3. **Read bounded source chunks.** Use a migration-only reader; native IndexedDB is sufficient if removing the Dexie dependency completely. Copy original replay-source fields and eligible page evidence. Current sanitized JSONL export is **not** a lossless backup: it omits page observations and source metadata.
4. **Apply current privacy policy.** Respect retention, revoked consent, excluded origins, and redaction. Track policy-required exclusions separately from errors; do not silently discard invalid records or apply fresh-capture budgets in a way that silently drops already accepted history.
5. **Import idempotently.** Deterministic namespaced IDs, full identity comparisons, bounded atomic `insertMany()` batches. Record durable progress only after data commit. If interrupted between data and checkpoint, replay/verify the same chunk safely.
6. **Verify before activation.** Compare eligible counts by kind, source identity/payload fingerprints, timestamp boundaries, representative derived sessions/contexts/metrics, and page evidence. Explain every policy exclusion. Persist a durable verified-import marker in TalaDB.
7. **Retire legacy storage, then resume.** Close legacy connections and delete the old database only after verification and authorized retirement. Confirm deletion; handle blocked deletion visibly. No new primary writes start while migration still depends on an unreconciled legacy copy. Make the deletion/activation crash window recoverable from the durable verified marker; never reopen/create an empty source and call migration complete.
8. **Activate TalaDB-only operation.** All reads/writes use OPFS. Remove migration-only Dexie code/dependency or retain only the minimal native legacy reader needed for remaining upgrading installs. No automatic fallback to a stale old store.

Before activation/deletion, a failed import can leave the untouched legacy database authoritative. **After TalaDB accepts new events, rollback is not switching a flag to old IndexedDB.** It requires a verified export/reverse migration of current records. Clearing TalaDB or uninstalling/reinstalling is not an acceptable recovery instruction without explicit data-loss consent.

Privacy deletion/revocation during migration must either pause migration safely or invalidate/purge affected rows from both temporary copies before any reads resume. A stale checkpoint, retained source copy, or derived projection must not resurrect deleted evidence.

## 7. Make stored data useful: delivery outcomes

Moving identical events from IndexedDB to OPFS alone does not produce a better answer. TalaDB's reason to exist here is **one local engine for durable history plus queryable, source-linked recall**, not a faster-looking insert demo. [T1]

| Stored data | User-visible outcome | Boundaries / quality check |
| --- | --- | --- |
| Immutable events + stable source IDs | Reliable chronological history, resume/revisit links, trustworthy counts and provenance | Existing metrics/context outputs remain equivalent; replay and failures do not inflate them. |
| Derived resources and contexts | Filter history by domain/time and search meaningful metadata with BM25 | Return supporting links/time ranges; judge results against the current matcher on user-authored questions. |
| Optional derived embeddings in the same DB | Find related prior work despite different wording | Explicit model/runtime cost; local inference; exact-term behavior and no-answer quality evaluated separately. No fusion requirement. |
| Existing consented, redacted page observations | Evidence-backed local excerpt search, only where already permitted or separately approved | Same opt-in/retention; citations to supporting observations; deletion removes text/vectors/caches; no automatic MCP/dashboard expansion. |

The prior 20-document fixture found metadata Recall@3 of 21.4% with the current matcher versus 85.7% with vectors. With excerpts, even the existing matcher reached 100% Recall@3; BM25 ranked all 14 answerable queries first. Vectors also returned unrelated hits for both unanswerable questions. These results support testing a retrieval product, **not** claiming that changing the persistence engine alone improves meaning. See [raw retrieval results](./taladb-retrieval-results.json).

Keep first retrieval delivery focused: derived context/resource search with citations and explicit empty/low-confidence states. Do not add a chatbot, cloud synchronization, React query rewrite, or a model for every event. If embeddings are enabled, distribute/download only approved model assets; browser history and inference inputs stay local. Decide retention of derived-only metadata explicitly rather than retaining source content indefinitely under a new name.

**Product success gate:** a small user-authored, human-judged evaluation set covering exact identifiers, paraphrases, time/domain constraints, duplicates, deleted evidence, and unanswerable questions. Measure top-result usefulness, Recall@3/MRR, and false suggestions. Preserve original baseline; do not tune thresholds on the evaluation set and then report it as unseen validation. Storage correctness is mandatory even if search quality disappoints.

## 8. Implementation sequence and release gates

Original work packages and exit criteria; status below reflects current implementation and user verification. Remaining work is qualification, not a fresh migration build.

### Phase A — production runtime proof (**implemented; one profile verified**)

Package exact browser artifacts through actual Plasmo build; add offscreen lifecycle + authenticated bounded internal protocol, initially with synthetic test data only. Verify fresh profile, no popup/dashboard open, service-worker suspension/restart, offscreen recreation, browser restart, WASM CSP, isolation regressions, and OPFS-only fail-closed behavior.

**Exit:** production build can open/write/recover the database without exposing raw storage RPC to content scripts or external callers. Test `sender.id` **and** trusted extension context/channel; content scripts also carry the extension ID.

### Phase B — authoritative storage and contract tests (**implemented; broader failure coverage remains**)

This pre-cutover work was implemented: the `records` envelope and serialized ingestion path preserve counts/ranges, source lookup, page summaries, budgets, pruning, deletion, payload unwrapping and domain contracts. One user profile has since cut over; broader upgrade coverage remains.

**Exit:** existing shared/extension checks pass, plus browser tests proving mixed-batch atomicity, same-source replay, conflicting identity rejection, no enrichment overwrite, resource/site/concurrent budget enforcement, retention/deletion order, owner loss, and lost ACK reconciliation.

### Phase C — failure and workload qualification (**in progress; deterministic checks added**)

**Deterministic coverage:** a never-resolving storage RPC times out after 10 seconds and recreates a disappeared owner; `openDB` failure retries; injected before-write errors retry; simulated after-write/lost-ACK replay returns duplicate by stable ID without duplicate storage. Synthetic 1,000-event ingest checks bounded batches and eventual ACKs (writer only, not storage throughput). Existing checks cover OPFS fail-closed behavior, cleanup, queue bounds, and held/retry. These mock-boundary checks are not TalaDB durability proof.

**Isolated Chrome smoke (Phase C, in progress):** Chrome 150, production Plasmo build, disposable profile; `crossOriginIsolated` and `navigator.storage.getDirectory` are available. Offscreen TalaDB startup currently fails with `Could not resolve bundle with id lluku` from `index.browser.c3785e40.js`, before storage capabilities are reported. Therefore no OPFS/durability result yet. Next: fix the production worker/WASM bundle reference, rebuild, and repeat the synthetic startup/commit/reopen check in the disposable profile.

Still test unavailable/denied OPFS, real quota failure where practical, injected write/flush errors, owner/coordinator death at each commit boundary, forced process kill/reopen, lock contention, version mismatch, real TalaDB late-commit-after-timeout behavior, and queues under sustained capture. Confirm storage failure is not rendered as empty history. Measure 1k/10k/100k events with realistic page evidence, index sizes, packaged size, cold startup, p50/p95 commit/query latency, memory, and idle/background CPU. Compare identical sanitized inputs with the current pipeline; set acceptable budgets from baseline measurements, not invented speedup targets.

**Exit:** no acknowledged-record loss or partial committed mixed batch in tested failures; bounded memory/backpressure; known-outcome or explicit unknown-outcome recovery; acceptable measured startup/resource cost. Do not claim protection from arbitrary hardware/power failures based on this suite.

### Phase D — verified one-time migration and sole-store cutover (**implemented and verified for one profile**)

The idempotent import, verification marker, and automatic legacy retirement are implemented. One existing profile was manually verified after full Chrome restart. The original proposed explicit retirement confirmation was not implemented; interrupted import/deletion, blocked deletion, insufficient space, consent revocation, and all legacy schema variants still need qualification.

**Exit:** new installs and upgraded profiles use TalaDB only; counts/identity/domain outputs verify; old event database retired as authorized; no stale rollback path or hidden data loss.

### Phase E — data-outcome delivery and cleanup (**retrieval product work remains separate**)

Build same-database derived search for committed history with provenance and invalidation; select BM25/vector behavior by evidence, not branding. Verify freshness and deletion before returning results. Complete user-question quality evaluation. Remove obsolete Dexie-shaped interfaces, dependency paths, misleading counters, and architecture text; retain only intentional compatibility/migration code with an explicit retirement condition.

**Exit:** the switch has a concrete useful recall outcome, not only a different file format; privacy and metrics contracts still hold. No pending search job may block primary event commits indefinitely.

## 9. Remaining uncertainties and decision boundary

- **Not yet broadly tested:** failure/recovery across all Plasmo assets, real quota exhaustion, forced process crashes, long-running histories and performance against the retired Dexie path. One real profile completed migration and passed user-verified restart/new-capture checks; remaining profile/schema and consent/budget cases still need coverage.
- **Not supplied by TalaDB:** browser-history semantics, embeddings/model choice, automatic cross-origin dashboard access, our capture authorization, reliable application migration rollback, or cross-device backup.
- **Dependency risk:** pre-1.0 release/format changes and documentation inconsistencies require exact pins, upgrade/recovery tests, and license review. The introduction calls TalaDB “production-ready”; that is the project's claim, not certification of our Chrome integration. [T1]
- **No unconditional ship decision:** if phases A–C cannot preserve ACK/identity/privacy/recovery guarantees with supported APIs, stop before migrating history. Do not quietly restore a dual-store architecture or weaken correctness to force the conclusion.

**Decision recorded:** full replacement was implemented; it is not an optional side index. One existing profile passed manual cutover/restart verification. Remaining release gates are qualification of failure modes and upgrading profiles, not approval to start implementation.

## Sources

First-party documentation plus inspected published artifacts; runtime observations are explicitly separated above.

- **[T1]** [TalaDB introduction](https://taladb.dev/introduction.html): redb/OPFS architecture, on-device document/vector engine, runtime split, local-only scope, production-readiness claim.
- **[T2]** [Browser/WASM guide](https://taladb.dev/guide/web): DedicatedWorker/Web Locks, durable/default versus eventual writes, OPFS/fallback behavior, owner failures and storage status.
- **[T3]** [Published `taladb@0.12.1`](https://registry.npmjs.org/taladb/-/taladb-0.12.1.tgz), `dist/index.d.ts` / `dist/index.browser.mjs`: supplied ULID support, deterministic ID helper, worker construction, client API and lack of general transaction method. [npm metadata](https://registry.npmjs.org/taladb/0.12.1).
- **[T4]** [Published `@taladb/web@0.12.1`](https://registry.npmjs.org/@taladb/web/-/web-0.12.1.tgz), `worker/taladb.worker.js` / `pkg/`: queued dispatch, OPFS handle, mutation ACK path, 32 MiB snapshot fallback, unknown-outcome errors. [Collection API](https://taladb.dev/api/collection.html) and [migration API](https://taladb.dev/api/migrations.html): bulk writes versus general transaction/migration limits. Runtime-tested supplied-ID behavior takes precedence over stale collection prose.
- **[T5]** [Search API](https://taladb.dev/api/search.html), [vector API](https://taladb.dev/api/vector-search.html), [local-first React query guide](https://taladb.dev/guide/query.html): retrieval features; React hooks/outboxes are optional and not part of this storage replacement.
- **[C1]** [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen): permission, `WORKERS`, runtime-only extension messaging, static entry page, lifecycle and Chrome 116 `getContexts()` example.
- **[C2]** [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy), [service-worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics): local executable assets, import/runtime restrictions, WASM policy.
- **[R1]** Repository contracts: `packages/shared/src/events/db.ts`, `packages/shared/src/events/ingest.ts`, `packages/shared/src/pages/budget.ts`, `apps/extension/event-pipeline.ts`, `apps/extension/background.ts`, `apps/extension/page-ingress.ts`, `packages/shared/src/recall/retrieval.ts`, and [data-flow.md](./data-flow.md).
