# Idea: TalaDB for Tabot's local search and storage

**Status:** Historical comparison only. The side-index recommendation and pre-implementation blockers below are **superseded** by the full replacement documented in [plan.md](./plan.md); TalaDB is now the active local store. No current decisions or TODOs should be inferred from the historical recommendation sections.

**Current conclusion:** TalaDB replaced the event/page database with one OPFS-backed database, an extension offscreen owner, and one atomic records collection. A user verified old history and new capture across full Chrome restart; the extension origin reports no IndexedDB databases. Broader failure qualification and upgrades for other profiles remain. See `plan.md` for current implementation, evidence and limits.

**Research date:** 2026-10-26. TalaDB version pinned to **0.12.1** for implementation; historical notes below describe earlier API research.

## Initial recommendation — superseded

**TalaDB looks useful for richer local recall, but is not currently a drop-in replacement for Tabot's Dexie/IndexedDB event store.**

Keep IndexedDB as the authoritative event/page-observation store. Trial TalaDB as an **optional, rebuildable local search index** over permitted derived documents. The [browser retrieval smoke test below](#6-simple-browser-retrieval-test--measured) now demonstrates a potential recall benefit on synthetic data, not production quality. Consider replacing primary storage only after Chrome MV3 compatibility, transactional ingestion, replay identity, and recovery are demonstrated.

The biggest opportunity is **better retrieval**, not changing where raw click/scroll events live. If we only need existing event capture and dashboard metrics, keep Dexie: a database migration adds cost without proving a user benefit.

## 1. What would actually change?

Today, Dexie is the TypeScript wrapper and IndexedDB is the browser storage system. TalaDB is a Rust document/vector engine exposed through WASM in browsers, normally persisting to **OPFS** (Origin Private File System). Without OPFS APIs it uses an IndexedDB snapshot backend. This remains local browser storage—not a cloud database, backup service, or automatic cross-device sync. [T1]

```text
Current
Chrome/content events → MV3 service worker → bounded Pacer queue
  → atomic Dexie/IndexedDB transaction → persisted ACK
  → extension messaging → dashboard / authorized sanitized MCP results

Proposed first experiment
Existing capture + IndexedDB commit remain unchanged
  → permitted derived documents → optional TalaDB search index
  → bounded local keyword / semantic search results
```

A search-index failure must never block capture or turn an uncommitted event into a persisted ACK.

### Implementation at the time of this comparison (historical)

- `packages/shared/src/events/db.ts`: `tabot_events`, Dexie schema v2; `events` indexed by `id`, `timestamp`, `type`, `tabId`; `pages` separately indexed by `id`, `timestamp`, `pageKey`.
- `bulkInsertIngestRecords()` atomically checks replay identity, inserts missing events/pages, and enforces page-capture budgets. Same ID with conflicting capture identity fails; replay never overwrites enrichment.
- `apps/extension/event-pipeline.ts` / `apps/extension/background.ts`: up to 128 rows per batch, fixed 25 ms collection window, one serial writer. ACK follows commit, never enqueue. Memory/held retries are bounded, not durable across worker termination.
- Page evidence has separate consent, redaction, deletion, and retention controls; current pruning defaults to seven days / 25 MiB. It is not included in normal dashboard history or assistant tools.
- `apps/web/src/lib/home-data.ts`: dashboard reads via Chrome messages. Its origin cannot directly open extension-owned storage, whether IndexedDB or OPFS.
- `packages/shared/src/share/export.ts`: sessions, contexts, memories, and live context are derived from events. `packages/shared/src/recall/retrieval.ts` already supports token/domain search and Jaccard similarity, not embedding-based semantic search.

See [current data-flow contract](./data-flow.md). A storage change must preserve these behaviors rather than replace them with generic CRUD.

## 2. Comparison for Tabot

| Concern | Current Dexie / IndexedDB | TalaDB browser engine | Meaning for Tabot |
| --- | --- | --- | --- |
| Local persistence | Browser-managed indexed records | OPFS files; IndexedDB snapshot fallback | Still subject to browser storage lifecycle, deletion, and quota. Not a backup. |
| Runtime | Existing MV3 service-worker integration | WASM + dedicated worker, Web Locks, same-origin owner RPC | New extension packaging/lifecycle work; compatibility unproven. |
| Structured queries | Indexed ranges plus JavaScript predicates | MongoDB-like filter DSL, B-tree indexes, aggregation | Convenient richer queries; not SQL. Existing indexed time reads already work. |
| Atomic ingestion | Explicit transaction spanning events/pages and read-before-write checks | Individual writes and `insertMany()` are transactional; high-level general transaction primitive is not exposed in migration docs | Cannot assume parity with our entire multi-step ingestion transaction. [T2][T3] |
| Stable identity | Existing string IDs, including UUIDs and historical IDs | Generated or explicitly supplied ULIDs; `deriveDocId()` maps external keys | Published 0.12.1 types support supplied IDs, despite stale collection docs. Still needs UUID mapping and immutable replay/conflict checks. [T2][T4][T9] |
| Keyword search | Existing domain/token matching; no general BM25 index | Built-in BM25 and boolean text filters | Clear potential improvement for searchable local evidence. |
| Semantic / hybrid search | No persisted embedding index | Exact vector search, optional persistent HNSW, keyword/vector fusion | Strongest new capability; embeddings still require a separate model. [T5][T6] |
| Dashboard aggregates | Pure application derivation | Engine-side grouping, sorting, projection | Could reduce returned rows for some queries; does not implement Tabot's session/context semantics. |
| Live updates | Chrome-message polling across origins | Local subscriptions and same-origin multi-tab coordination | Does not automatically replace dashboard messaging or polling. |
| React fetching | Existing app transport and React stack | Optional React hooks and TanStack Query-like `/query` API | Separate architectural choice, not required to use the database. |
| Payload / startup | Current JS dependency, no DB WASM runtime | Docs quote roughly 570 kB gzipped WASM, plus worker/JS; model additional | Measure packaged size, cold open, memory, battery—not just throughput. [T1] |
| Operational risk | Already integrated, with retained ingestion checks | Pre-1.0 project; homepage says maintained by one person. Docs advertise Apache-2.0; npm declares `MIT OR Apache-2.0` | Pin versions; verify artifact licenses, upgrades, format changes, and recovery. Not proof the project is unsuitable. [T7][T8] |

**Do not use the homepage's comparison table as evidence that IndexedDB lacks transactions.** Our existing Dexie transaction already supplies atomic multi-table writes. Likewise, Rust/WASM and OPFS do not establish that this workload will be faster.

## 3. Features this could unlock

### A. Better local recall — strongest fit

Examples: “Find my previous work around database migrations” or “Show contexts related to this topic even if they used different domains.”

Index permitted text representations of contexts/resources, with source IDs, time ranges, and domain metadata. BM25 handles literal terms; embeddings can find paraphrases; hybrid search combines both. Filter by time/domain before ranking, return bounded results, and retain source provenance. [T5][T6]

Start with keyword search and measure usefulness before adding a model. Existing domain/URL-path metadata without page-body text limits meaning: semantic search cannot recover page content we never collected. Do not promise content-level recall from URLs and activity counts alone.

### B. Optional search over consented visible excerpts

Existing opted-in page observations provide richer text. A future extension-local search UI could index their already-redacted fragments. This is a **separate feature/consent decision**, not an automatic consequence of adopting TalaDB.

Keep current exclusions, capture budgets, and source retention. Revocation/deletion must remove source-linked text, embeddings, and cached hits. Do not expose excerpts to dashboard or MCP merely because a new query API makes them reachable.

### C. Query-side summaries

Persist rebuildable derived summaries and query aggregates or bounded history slices without repeatedly transferring all events. This may improve history-heavy reads, but derivation/caching and transport design still need work. TalaDB does not automatically make sessionization, context graphs, or full-history replay incremental.

TalaDB's documented query surface is document/filter/aggregation/vector based, not a replacement for Tabot's Graphology domain logic.

## 4. Blockers to a full storage replacement

### 4.1 MV3 hosting and CSP

TalaDB's documented browser runtime owns storage in a **DedicatedWorker** and coordinates access using Web Locks and BroadcastChannel. The published 0.12.1 browser bundle directly calls `new Worker(...)`; this is not merely homepage wording. Its web instructions also require WASM/worker CSP and describe COOP/COEP configuration. [T1][T9]

Our capture owner is an ephemeral Chrome extension **service worker**, not a browser tab. Published 0.12.1 platform detection requires `globalThis.window` to select the browser path; a service worker lacks it. The shipped adapter therefore is not a direct service-worker integration. Raw WASM support would not by itself fix platform selection, worker hosting, or persistence. Chrome also restricts service-worker imports and extension executable resources. [T9][C1][C2]

A candidate experiment is an extension-owned offscreen document hosting TalaDB's worker. That adds an `offscreen` permission, an owner lifecycle, runtime messaging, and commit-response/recovery boundaries. It is **not** an approved architecture or a reason to keep the service worker alive. Chrome documents offscreen-worker use and lifecycle constraints; feasibility still needs a real packaged extension. [C3]

Bundle JS/WASM locally; test Plasmo's production output, extension CSP (`wasm-unsafe-eval`), worker URLs, and any required isolation. Do not copy Vite dev headers into a manifest and assume equivalence. A popup/dashboard-tab owner is insufficient for primary ingestion because capture must work while UI is closed.

### 4.2 Atomicity and replay identity

`insertMany()` documents one transaction for its inserts. That does **not** prove support for this required sequence in one transaction:

1. Read existing events and pages.
2. Reject same-ID/different-capture conflicts.
3. Evaluate page budgets against committed and incoming rows.
4. Insert accepted rows across both collections.
5. Report committed, duplicate, and ignored outcomes only after commit.

The migration reference explicitly says the high-level API lacks a general transaction primitive and migrations checkpoint rather than roll back an entire `up` body. The web guide's broader statement that migrations run “atomically” conflicts with that detail; treat the specific limitation as the safe baseline. [T1][T3]

The collection reference says `insert()` ignores supplied `_id`, but **published 0.12.1 declarations explicitly support supplied ULIDs** through `InsertDoc<T>` and document duplicate-ID rejection. `deriveDocId(collection, key)` deterministically maps external keys; UUID strings are not accepted directly as `_id`. This resolves part of the identity concern, but needs runtime verification. Keep original event IDs and capture identities, verify both on duplicate/collision, and never treat a deterministic hash as proof that payloads match. The helper uses a non-cryptographic hash, not a trust-boundary identity guarantee. Blind upsert is not equivalent to immutable event replay. [T2][T4][T9]

This API gap is a **primary-store blocker**, not a small follow-up task. A lower-level binding or different schema would need its own reviewed proof; do not silently weaken the contract.

### 4.3 Durability and owner failure

The web guide says default browser writes acknowledge persistence; in IndexedDB fallback, ACK waits for the IDB transaction. With `flush_every_write: false`, writes are eventual and `db.flush()` is the durability barrier. Do not use eventual writes for authoritative event ACKs. [T1]

Owner loss can leave a committed operation with no response. TalaDB documents unknown outcomes and no automatic RPC replay: reconcile/retry by stable identity. Our existing lost-ACK contract must survive the added owner/message hop.

The fallback is documented as a **32 MiB-limited snapshot backend**. It serializes the database; it is not equivalent to IndexedDB's current row-oriented usage. OPFS permission/file-open errors reject opening rather than silently selecting another store. Test quota, failed open, lock contention, worker termination, and restart—not only clean close. [T1]

Neither engine promises immunity to browser-data clearing, uninstall, abrupt power loss, or device loss.

### 4.4 `/query` is not a prerequisite or free upgrade

The supplied [query guide](https://taladb.dev/guide/query.html) describes `@taladb/react/query`: local collection-backed equivalents of TanStack Query-style hooks, including HTTP mutation outboxes. It is **not** the engine's complete query-language reference and not a transparent replacement for our Chrome-message reads. [T4]

No server-mutation outbox is needed for local browser capture. Do not enable webhooks or remote sync for raw history. TalaDB's provider is client-only and renders fallback during SSR; wrapping the whole TanStack Start application would also change rendering behavior. Storage evaluation should not trigger a React data-layer rewrite.

## 5. Proposed smallest production experiment

The standalone browser probe in section 6 is complete. The extension integration below remains proposed; its scope does not describe the model-enabled, synthetic-only probe.

**Scope:** one optional, extension-local keyword search over a bounded set of permitted derived summaries. IndexedDB remains authoritative. No full history migration, model download, new assistant access, or production dual-write path.

1. **Compatibility spike:** pin available package versions; package WASM/worker assets with Plasmo; prove open/write/read/reopen without an open popup. Verify actual backend and durable-write status using `storageInfo()` where supported. Fail visibly if unavailable.
2. **Bounded rebuild:** derive search documents from committed local records; retain source IDs and derivation version. Build only from data currently allowed by policy. Keep index disposable; report rebuilding/unavailable rather than empty history.
3. **Search comparison:** run the same representative questions through current token/domain search and TalaDB BM25. Only if results justify it, add a separately approved on-device embedding model and hybrid search.
4. **Failure checks:** terminate/recreate owner, restart browser, lose a response, reject storage, revoke/delete source evidence, and rebuild. Nothing may stall the existing writer or resurrect deleted text.
5. **Measure and decide:** compare relevance, query latency, cold-open time, memory, packaged size, index growth, and ongoing CPU cost on identical data/hardware.

Use a simple on-demand rebuild first, not a second durable ingestion pipeline. If index refresh fails, preserve capture and flag stale/unavailable search. A side index should not become a second source of truth. Deletion/revocation must invalidate access immediately; suspended index owners must process invalidation or rebuild before serving again.

### Proposed acceptance gates

These are review targets, **not measured results**:

- **Privacy:** no raw-history/excerpt network egress; existing assistant authorization and sanitization remain unchanged. Any approved model/asset download is disclosed and sends no history content.
- **Isolation:** original ingestion checks pass; index unavailability cannot change persisted ACK behavior. Existing storage errors remain distinguishable from empty history.
- **Lifecycle:** optional index survives reopen or rebuilds safely, including with every user-facing UI closed; no keepalive workaround.
- **Quality:** a small manually judged question set shows more useful results than current search, not merely different scores.
- **Cost:** record p50/p95 latency, cold startup, memory, size, and index overhead at 1k/10k/100k events and realistic document counts. Compare indexed documents separately from event volume; do not embed every low-value event.
- **Replacement, later:** no primary-store cutover until multi-collection atomicity, stable-ID conflict/replay, quota recovery, and migration rollback are proven with browser integration tests. Existing `pnpm --filter extension check:ingest` is necessary but not browser durability proof.

## 6. Simple browser retrieval test — measured

**Run:** 2026-10-26, twice with identical rankings/quality metrics. Real headless Chromium via `agent-browser`; published `taladb@0.12.1` + `@taladb/web@0.12.1`, persistent worker-backed OPFS. `storageInfo()` returned `storage: 'opfs'`, `durableWrites: true`, no storage error. This is a normal localhost web page using the web guide's isolation setup, **not** an MV3 extension test.

### Method

- **20 synthetic documents**, including related security/storage topics, similar old/new refund policies, and opaque identifiers. No real browser history or production database touched.
- **16 fixed, manually labelled questions:** four exact-term/identifier queries, eight natural-language paraphrases, two explicitly filtered queries, and two unrelated questions with no answer. Labels/corpus fixed before running; no weight or threshold tuning.
- **Two identical-information tracks:** domain/URL-path metadata only; then the same metadata plus synthetic page excerpts. Every TalaDB method receives the same text within its track.
- **Real baseline:** calls Tabot's current `searchContextsCore()` from `packages/shared/src/recall/retrieval.ts`. An additional control gives that same matcher the excerpts too, by appending them to its test haystack; this is not a production feature or existing excerpt-search path. All fixture contexts are assumed eligible; production readiness/consent gating is not tested.
- **Actual embeddings:** `Xenova/all-MiniLM-L6-v2`, revision `751bff37182d3f1213fa05d7196b954e230abad9`, 384 dimensions, q8, normalized mean pooling, Transformers.js 3.8.1, local single-thread WASM inference. No invented/random vectors. Assets download from Hugging Face/jsDelivr; document/query inference stays in Chrome.
- **Search:** top three results; default BM25 and hybrid fusion. Exact flat cosine search removes approximate-index recall as a confounder; no HNSW claim. Domain/time filters are supplied explicitly and checked across every method, not inferred from question wording.

### Results: 14 answerable questions

Each question has one labelled relevant document. Recall@3 therefore equals the proportion finding that document in the first three hits; MRR@3 rewards higher rank and assigns zero for a miss. No-answer questions are evaluated separately.

| Method | Text available | Correct top result | Recall@3 | MRR@3 |
| --- | --- | ---: | ---: | ---: |
| Current Tabot matcher | Metadata | 2/14 (14.3%) | 3/14 (21.4%) | 0.179 |
| TalaDB BM25 | Same metadata | 2/14 (14.3%) | 3/14 (21.4%) | 0.167 |
| TalaDB vectors | Same metadata | 8/14 (57.1%) | 12/14 (85.7%) | 0.702 |
| TalaDB hybrid | Same metadata | 7/14 (50.0%) | 12/14 (85.7%) | 0.667 |
| Existing matcher + excerpts — control | Metadata + excerpts | 13/14 (92.9%) | 14/14 (100%) | 0.964 |
| TalaDB BM25 | Same metadata + excerpts | 14/14 (100%) | 14/14 (100%) | 1.000 |
| TalaDB vectors | Same metadata + excerpts | 13/14 (92.9%) | 14/14 (100%) | 0.964 |
| TalaDB hybrid | Same metadata + excerpts | 14/14 (100%) | 14/14 (100%) | 1.000 |

**Useful observations:**

- On unchanged metadata, vectors improved retrieval: “remove listeners when a component disappears” found the `useeffect-cleanup` resource where current matching returned nothing. BM25 alone did not improve overall metadata recall.
- Richer evidence produced a large gain even without a new retrieval engine: existing matcher + excerpts already reached 14/14 Recall@3. Do not attribute all improvement to TalaDB, or claim consented excerpts are already available to current tools.
- Exact `bm25` ranked second with enriched vectors, first with BM25/hybrid. Vectors are not a replacement for literal-term search. Metadata hybrid also underperformed metadata vectors on top-one accuracy; hybrid is not universally better.
- **No-answer failure:** vectors and hybrid returned three unrelated suggestions for **both** unrelated questions. BM25 returned none for both; metadata matcher returned suggestions for one, excerpt matcher for both. Ranking is not proof that an answer exists. A user-facing system needs separately calibrated abstention/low-confidence handling; no threshold was tuned here.
- Both explicit domain/date filters passed; no result escaped its filter.

**Conclusion:** enough evidence to justify a bounded retrieval prototype, not a primary-storage migration. For metadata-only recall, test embeddings further. For approved excerpt search, BM25 is a strong first implementation; this fixture did not show a quality advantage from adding vectors over BM25. Embeddings can be implemented alongside IndexedDB too: this compares retrieval methods, **not** an inherent quality limit of IndexedDB.

### Reproduce and limits

```bash
node scripts/check-taladb-retrieval.mjs
# Optional alternate report path:
node scripts/check-taladb-retrieval.mjs /tmp/tabot-retrieval-results.json
```

Requires `agent-browser`, npm/network access, and Node supporting `registerHooks` and TypeScript stripping. Installs pinned DB packages into a temporary directory, serves a temporary localhost page, downloads runtime/model assets, runs assertions, writes [raw per-query rankings and metrics](./taladb-retrieval-results.json), then closes its isolated browser session/server and removes temporary packages. No repository dependency changes. Structural/filter failures exit nonzero; low retrieval scores are reported, not hidden behind a forced “vectors win” assertion.

Small authored fixture is easy and selection-biased, with one label per query; perfect scores are **not** expected production quality. It omits realistic corpus size, human-graded relevance, titles, multi-result judgments, multilingual/typo queries, latency/battery benchmarks, restart/crash recovery, live ingestion, consent/deletion paths, and MV3 packaging. Next useful check: an opt-in, locally evaluated set of user-authored recall questions with harder distractors and separate no-answer judgments. Do not enable a production model download or broader evidence access based on this result alone.

## 7. If full replacement is still desired

Do not migrate merely to unlock vectors. If a primary-store prototype clears the blockers above, review a separate migration plan:

1. Retain the old IndexedDB store for verification/rollback, subject to ongoing privacy purges. Check quota/headroom for old data, new files, indexes, and temporary copies. User-facing JSONL exports contain sanitized events plus derived records, but exclude page observations and replay-source metadata; they are **not** a lossless database backup.
2. Pause admission at a documented cutover boundary and settle active writes; do not take a moving full-history copy. Resume only with a defined authoritative writer and truthful ACK behavior.
3. Copy bounded chunks with durable progress and deterministic ID mapping; preserve all historical fields, event ordering rules, redaction, budgets, and page retention. Interrupted import must resume without duplication.
4. Validate counts, identity fingerprints, representative ranges, and derived output against IndexedDB; test owner/browser interruption and lost-response replay.
5. Switch reads/writes only after validation. During the rollback window, enforce deletion, consent revocation, and retention across both stores, derived indexes, and temporary copies. Rollback must never resurrect expired or deleted evidence. If TalaDB has accepted new events, switching back requires reconciled copy-back; the retained old store alone is not a current rollback target.
6. Retire the old database only after explicit approval; mandatory privacy purges never wait for that approval. Do not assume TalaDB's raw `exportSnapshot()` is available through high-level `openDB()` or reuse an open live file through a second raw handle. [T1]

A live migration would need replay/cutover coordination. That complexity is intentionally deferred until a replacement demonstrates value.

## Initial decision — superseded by plan.md

- **Recommended:** retain Dexie primary storage; approve only a bounded TalaDB search/compatibility experiment if richer recall is a near-term product goal.
- **Next retrieval trial:** extend the measured metadata-embedding/BM25 comparison to user-authored questions, including no-answer behavior; integrate only as a disposable side index after MV3/consent checks.
- **Defer:** production model rollout, excerpt access changes, assistant-tool changes, React query migration, cloud sync, and full storage cutover until separately justified.
- **Reconsider replacement when:** tested MV3 ownership and transactional APIs match current guarantees, and measured product/performance gains outweigh migration and maintenance cost.

## Sources and confidence

Primary sources checked on the research date. Capabilities above are documentation claims unless marked as existing Tabot implementation or measured in section 6. A standalone browser retrieval/OPFS smoke test was run; no TalaDB extension benchmark, migration, or crash-durability test was run. Live docs contain inconsistencies (supplied-ID support versus published types, migration atomicity, storage status examples, and older multi-tab wording), so a package-pinned spike is required.

- **[T1]** [Browser/WASM guide](https://taladb.dev/guide/web): OPFS/fallback, workers/CSP, ownership, durable writes, snapshot limits/export, model example.
- **[T2]** [Collection reference](https://taladb.dev/api/collection.html): generated IDs, transactional bulk inserts, reads, subscriptions, aggregation/pagination.
- **[T3]** [Migration reference](https://taladb.dev/api/migrations.html): checkpoint-per-version, partial writes persist, missing general transaction primitive.
- **[T4]** [Local-first React query guide](https://taladb.dev/guide/query.html): collection-backed hooks, deterministic IDs, network mutations, SSR boundaries.
- **[T5]** [Text/hybrid search reference](https://taladb.dev/api/search.html): BM25 and keyword/vector retrieval.
- **[T6]** [Vector search reference](https://taladb.dev/api/vector-search.html): exact/HNSW support, filtered execution, persistence and rebuild controls. HNSW is documented for browsers; do not rely on the older `hnsw: false` storage-status example as a capability statement.
- **[T7]** [Project homepage](https://taladb.dev/), [source](https://github.com/taladb/taladb), [releases](https://github.com/taladb/taladb/releases): positioning, Apache-2.0 licensing, release tracking and maintainer disclosure. Marketing comparisons are not workload evidence.
- **[T8]** [npm package metadata](https://registry.npmjs.org/taladb/latest): published version, exact-version browser/native peer dependencies, and package license declaration.
- **[T9]** [Published `taladb@0.12.1` archive](https://registry.npmjs.org/taladb/-/taladb-0.12.1.tgz), `package/dist/index.d.ts` and `package/dist/index.browser.mjs`: inspected `InsertDoc`, `Collection`, `TalaDB`, `deriveDocId`, and `isDocId` declarations, plus browser worker construction. Supplied ULIDs and duplicate rejection are documented here; no general transaction method appears on `TalaDB`/`Collection`. Browser detection requires `globalThis.window`. Static inspection is not extension-runtime proof.
- **[C1]** [Chrome extension service-worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics): imports, packaging and remote-code constraints.
- **[C2]** [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy): default WASM restrictions and `wasm-unsafe-eval` policy.
- **[C3]** [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen): permission, reasons including workers, messaging, owner-document lifecycle.
