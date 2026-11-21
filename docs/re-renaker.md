# Neural reranker (Phase 5) — not built; use only if search is still poor

**Status: not implemented.** Search today is local hybrid retrieval: BM25 (`records.searchText`, `passages`) + vector
(`passages.hybridSearch`/`findNearest`), fused by URL with RRF, admission gate `admitSemanticHit`
(`apps/extension/storage/search-ranking.ts`), then a deterministic rerank `rerankCandidates`
(`packages/shared/src/recall/history-search.ts`: fused rank, recency, rarity-weighted title/host match, host/title duplicate
penalties). Build a reranker only when evidence below shows these rules are not enough.

## What it is

A cross-encoder reads the query and one candidate's text together and returns a relevance score. It reorders only the top
20–50 fused candidates; retrieval is unchanged. It would replace or sit after `rerankCandidates` and the hand-picked
`RERANK_WEIGHTS`.

## When to build it (all must hold)

1. A labeled eval set built from real queries (brand terms like `Wayfair`, `zosma ai`, `linkedin`, conceptual queries, and
   no-answer queries like `zzqxjvk`) exists and runs in `pnpm eval:search`.
2. On that set, recall@5 / nDCG on conceptual queries, or the no-answer false-positive rate, stays below target after tuning
   the cheap levers: cosine thresholds, RRF weights, pool depth, rerank weights.
3. An offline prototype of a candidate model shows a clear gain on that set (not just on synthetic fixtures).

## What it would help

- Vector-only noise above the cosine cutoff (unrelated pages scoring 0.25–0.35).
- Pages with short excerpts or weak titles where term matching is guesswork.
- Conceptual queries whose page never uses the query words.

## Costs to weigh

- Model asset ~20–100 MB bundled in the extension (the embedding model is already packaged); larger package and review.
- Latency ~50–200 ms per search for ~30 candidates (CPU/WASM/WebGPU in the offscreen document); must not slow the search box.
- Extra memory for a second model in the offscreen document.
- Privacy holds only if it runs fully local; candidate text must never go to the relay or a network.
- Failure must degrade to the current deterministic order, never to empty results.

## Integration sketch

- Run in the offscreen document next to the embedding worker; take the top-N from `fuseCandidateUrls` + `rerankCandidates`.
- Score `(query, title + best passage)` pairs, bounded N and text length; blend with, or replace, the rerank score.
- Gate behind a flag; fall back on model load failure, timeout or error; log only allowlisted codes.
- Add cases to `search-quality.check.mts` before/after and report recall, MRR, nDCG and latency.
