# Tabot recall and event-consolidation plan

**Status:** proposal; no implementation changes. Preserve raw event/page records as local source of truth. Treat sessions, episodes, contexts and memories as versioned, rebuildable projections—not as authoritative history.

## Current state and diagnosis

- `apps/extension/storage/owner.ts` stores event/page envelopes in one TalaDB `records` collection. It creates B-tree indexes for `recordKind`, `timestamp`, `originalId`, `pageKey`, and `origin`, but most reads call `records.find()` and filter/sort in JavaScript. The owner currently rebuilds derived data from event history.
- `packages/shared/src/share/export.ts` derives sessions → transitions → contexts → memories deterministically. Context and memory logic is heuristic, not learned or semantically aware; page excerpts do not currently contribute to these projections.
- Dashboard history recall has its own local BM25-like scan (`packages/shared/src/recall/history-search.ts`). MCP `search_context` searches derived domains/sequences, not excerpts. Similar contexts/memories use domain overlap.
- Audits found correctness gaps to fix before adding semantic infrastructure: clean sanitized excerpts can be excluded by the `privacy.redacted` flag; citations may omit the matching source; context transition order can be contaminated by earlier occurrences; short fragments can inflate memory recurrence confidence.

## Goal

Make recall answer **what was visited/read, when, in what activity sequence, and with what evidence**, while retaining local-only raw history, deterministic derivation, explicit uncertainty, bounded work, and fail-closed privacy. Reuse TalaDB query/index/search primitives before adding a second search engine or embedding model.

## Proposed storage shape

Keep current `event` and `page` records immutable. **Do not change event IDs, event/page schemas, payloads, or ingestion semantics.** Put indexed search text and derived session/episode/context data in separate, disposable TalaDB projection collection(s), keyed to stable source IDs and tagged with projection/schema version:

- Search projection: event type, timestamp, origin, sanitized URL path, and bounded sanitized page excerpt text. Page text must come only from already-sanitized observations. Never include query/fragment, typed text, raw DOM, or unsanitized values. Keep sanitization-success provenance distinct from whether redaction changed text.
- Activity projection: versioned session/episode/context identifiers, time bounds, stable source IDs, bounded activity sequence, and event/page counts. Build deterministically from source rows; rebuild/discard when algorithm or schema version changes. Do not duplicate full source text into memories.
- Projections are caches, not evidence authority: deleting source records must delete dependent projection rows; rebuilding from immutable source log must reproduce them. Indexes/FTS are created on projection fields, not by rewriting event records.

Avoid event-per-keystroke, arbitrary DOM selectors, page screenshots, query strings, form values, or cloud embeddings. Existing opt-in capture and per-origin consent remain the content boundary.

## Recall pipeline

1. **Fix evidence correctness first.** Separate “sanitization succeeded” from “PII was redacted”; ensure clean safe observations are searchable. For each hit, preserve the exact matching event/page source ID, timestamp and sanitized URL; produce a query-centered excerpt from that same page record. Keep total source counts distinct from returned citations; expose truncated/partial coverage.
2. **Use TalaDB indexes to prune.** Add/verify B-tree indexes needed for `recordKind` and time bounds; query only relevant record type and requested range. Use `aggregate([{ $match: ... }, { $sort: ... }, { $limit: ... }])` for bounded list/count workloads where appropriate. TalaDB docs state first-stage `$match` can use indexes; later stages run in memory. Do not assume `find()` supports sort, skip, limit, or projection—it does not in documented Collection API.
3. **Use native BM25 for keyword recall.** Create FTS indexes on bounded `searchText` fields and use `searchText(field, query, topK, filter?, options?)`. It uses OR semantics and BM25 ranking; `$contains` requires every token, so use it only for boolean filters. Preserve history-date/origin filters in TalaDB query filters where supported. Test actual filter/index plans and semantics with installed `taladb` 0.12.1 before replacing current path.
4. **Consolidate activity on indexed subsets.** Fetch chronological rows for the requested time window, then run existing pure deterministic session → episode → context rules on that bounded window. Correct transition occurrence ordering and use actual context-local evidence. Keep `pageKey`/`origin` as searchable associations, but do not let shared origin alone imply same task. Establish stable ordering with `(timestamp, originalId)` tie-break.
5. **Improve recurrence evidence.** Fold adjacent fragments into occurrences before recurrence/confidence evaluation. Require separated independent occurrences for recurrence; calculate shared domains/tokens as true intersections. Store compact source references per occurrence so each inferred pattern is explainable and deletable with source data.
6. **Unify dashboard and MCP contracts.** One shared recall service should return ranked hits plus query scope, matching terms, supporting citations, coverage/truncation, and heuristic confidence. Both callers can choose display limits; neither should invent separate matching rules. MCP should expose only sanitized derived results and citations, never raw event payloads.
7. **Consider hybrid/vector retrieval only after lexical evaluation.** TalaDB documents `hybridSearch` (BM25 + vector, reciprocal-rank fusion) and vector indexes/nearest-neighbor search. Keep vectors optional and local; first prove a query set where BM25 misses paraphrases that embeddings recover. Measure model download/storage cost, embedding latency, privacy and quality on-device before choosing a model/index. Do not make embeddings a prerequisite for baseline recall.

## TalaDB capability mapping

| Need | TalaDB API documented | Tabot use/decision |
|---|---|---|
| Indexed equality/range filters | `createIndex`, `find(filter)`, filters; collection guide | Apply type/time/origin filtering in storage instead of full collection scans. |
| Compound equality filters | `createCompoundIndex(fields)` | Use only if measured stable queries need equality on all indexed fields; docs say partial/non-equality cases fall back. |
| Ranked local text search | `createFtsIndex`, `searchText`; search reference | Primary next retrieval step for sanitized excerpt/event terms. |
| Keyword boolean matching | `$contains` on FTS field | Use only when all query tokens must occur; not ranking. |
| Search + semantic ranking | `hybridSearch`, vector index, `findNearest` | Deferred until real-query evaluation establishes lexical gap and on-device cost is acceptable. |
| Filtering, grouping, ordering, bounded outputs | `aggregate` stages `$match/$group/$sort/$skip/$limit/$project` | Candidate for indexed first-stage pruning and dashboard summaries; later stages are in-memory. |
| Reactive dashboard data | `subscribe` / `subscribeAggregate` | Optional; current polling can remain until local live-query behavior benefits UX. Not a recall-quality fix. |
| Atomic ingestion | `insertMany` | Already used for accepted events/pages in one bulk write; retain stable-ID replay/conflict checks. |

## Rollout and checks

**Phase 1 — correctness:** add regression checks for clean sanitized excerpts, matching-source citations, local transition ordering, repeated-transition preservation, and recurrence invariance under splitting one visit into short fragments. Keep all checks deterministic and local.

**Phase 2 — indexed lexical recall:** create a derived search-projection collection with sanitized searchable fields + idempotent indexes; implement date/origin/type-pruned reads and TalaDB BM25. Do not modify source event/page rows. Verify projection rebuild and FTS index creation/backfill behavior; benchmark cold index creation separately from normal queries.

**Phase 3 — bounded derivation:** persist versioned derived projections only if profiling shows repeated full-history reconstruction is a real latency problem. Source records remain authority; make rebuild/delete/reset behavior explicit. Add limits and degradation states rather than returning partial data as complete.

**Phase 4 — optional hybrid:** compare BM25 vs hybrid on held-out paraphrase queries. Adopt vectors only if retrieval quality improves enough to justify model, index, disk and compute costs.

Evaluation corpus must include exact terms, synonyms/paraphrases, short important visits, repeated visits, competing pages on same origin, time/origin filters, no-answer queries, and explicit evidence checks. Track Recall@3, MRR, citation support, no-answer precision, p50/p95 latency, scan/candidate counts, and index size. Current three hand-authored recall checks are not adequate evidence for semantic expansion.

## Constraints and risks

- Query API behavior should be verified against the installed browser package, not inferred solely from website docs. Project pins `taladb` and `@taladb/web` at `0.12.1`; no new dependency is proposed.
- Index creation backfills existing records and may be expensive. Plan for migration/startup time and profile sizes before enabling new indexes for all profiles.
- `aggregate` only gets index acceleration when `$match` is first; remaining pipeline stages are in memory. Do not describe aggregation as a general query planner/index for all work.
- Searchable fields must be derived only after existing privacy sanitization. Indexes and vectors are still local persistent data and must follow deletion/retention rules.
- No claim that TalaDB alone can infer task intent. Better storage/search improves evidence retrieval; session boundaries and recurring-memory semantics still need validated deterministic rules.

## Sources

- TalaDB Web guide (browser/WASM, indexes, FTS, vector/hybrid, aggregation, live queries): https://taladb.dev/guide/web.html
- TalaDB local-first query guide (`@taladb/react/query`; React Query-style hooks, distinct from core Collection querying): https://taladb.dev/guide/query.html
- TalaDB Collection API (filters, indexes, aggregation and `find()` ordering/limits): https://taladb.dev/api/collection.html
- TalaDB Search API (`searchText`, BM25 semantics/options): https://taladb.dev/api/search.html
- Local storage/index implementation: `apps/extension/storage/owner.ts`
- Deterministic derivation: `packages/shared/src/share/export.ts`, `packages/shared/src/sessions/sessions.ts`, `packages/shared/src/contexts/contexts.ts`, `packages/shared/src/memories/memories.ts`
- Search paths: `packages/shared/src/recall/history-search.ts`, `packages/shared/src/recall/retrieval.ts`, `apps/extension/relay/relay.ts`
- Privacy/capture: `packages/shared/src/pages/observations.ts`, `packages/shared/src/privacy/ingest.ts`, `apps/extension/capture/visible-excerpts.ts`
