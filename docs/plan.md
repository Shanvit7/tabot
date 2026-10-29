# Tabot local browser intelligence plan

**Status:** Candidate generation, feature extraction, local labeling, training, and held-out comparison are implemented. Real local judgments, accepted decision thresholds, and any model promotion remain pending; this is not a claim that learned relationships already work.

## Product thesis

Tabot makes local browser evidence more useful to external AI clients by providing searchable evidence and, if proven valuable, learned relationships across that evidence. ChatGPT, Claude, or another MCP client owns conversation and natural-language orchestration. Tabot contributes access to local browser history and useful, inspectable associations those clients cannot retrieve alone.

**Testable hypothesis:** relationship expansion can connect supporting browser evidence across tabs, sites, and separated visits that direct TalaDB retrieval misses—without adding too much unrelated evidence.

## Product responsibilities

| Component | Responsibility | Not responsible for |
|---|---|---|
| Browser capture | Preserve locally observed events and visible page observations, with provenance | Claiming user intent from activity |
| TalaDB | Store, filter, search, aggregate, and retrieve local evidence; provide experiment baseline | Deciding whether observations belong to one task |
| Handwired experiment | Learn and score candidate relationships from numerical features and evaluation examples | Parsing arbitrary raw text/JSON, understanding language, or acting as an agent |
| Tabot MCP | Expose evidence search, provenance, related evidence, and trails to external clients | Replacing their conversation/planning loop |

## Architecture direction

Keep the existing immutable local evidence layer, redaction, and sensitive-page exclusions. Stop requiring every observation to pass through the semantic hierarchy `events → sessions → episodes → contexts → memories`.

```text
Browser events + visible page observations
                  │
                  ▼
       Local evidence store (TalaDB)
                  │
          ┌───────┴──────────┐
          ▼                  ▼
 Direct TalaDB search   Bounded candidate features
 baseline               and relationships
                              │
                              ▼
                    Handwired experiment
                              │
                              ▼
                 Scored, inspectable links
                              │
                              ▼
                         Tabot MCP
                  retrieve evidence/trails
```

This is a target, not a finalized implementation. Feature representation, learning objective, candidate generation, feedback/labels, and relationship persistence must be established experimentally. Candidate generation may bound computation, but must not silently decide semantic relatedness. Keep source IDs, timestamps, and supporting evidence attached to every feature and score. Allow links across conventional time/session boundaries, allow overlapping trails, and leave unsupported observations unconnected.

TalaDB remains the local evidence and direct-retrieval foundation. Handwired is an experiment in learning relationships; it is not a replacement for TalaDB search, a natural-language parser, or an LLM. If it only reorders TalaDB's results or does not improve a concrete work-recovery task, remove it.

## First experiment: relationship expansion vs TalaDB alone

Use one narrow task, such as resuming an authentication bug investigation whose evidence spans an issue, documentation, code discussion, and later visit.

### 1. Establish evaluation examples

Use realistic work-retrieval tasks and locally available evidence; synthetic fixtures may test mechanics but cannot support quality claims. Keep one task/thread wholly within one split.

**Labels:**
- Pair `related`: both observations materially help recover the same bounded work thread; same site, topic, or time proximity alone is insufficient.
- Pair `unrelated`: reviewed evidence supports distinct work threads.
- Pair `ambiguous`: evidence is insufficient or reviewers disagree; exclude from binary training and report separately.
- Task evidence `relevant` / `irrelevant` / `unjudged`: judged against the task query, not inferred from the pair label. Unjudged evidence is not negative evidence.

**Local dataset shape:** versioned tasks with opaque `threadId`, `split` (`train` or `evaluation`), a user-authored query, judged source IDs, and pair judgments `{leftId, rightId, label}`. Store it outside the repository/profile export; keep source IDs and labels only—no URLs, excerpts, page text, or raw event payloads. Feature extraction reads consented local evidence by source ID. Query text and labels never leave the device.

Include hard negatives (nearby unrelated pages and topically similar pages from another thread), preserve ambiguous cases, and split by thread/time to prevent near-duplicate leakage. Do not claim representative quality until real examples exist.

### 2. Freeze the TalaDB-only baseline

Run direct TalaDB search/filter retrieval for each task and record returned source IDs, ranking, latency, and evidence coverage. This is the control: both systems receive the same underlying evidence and query. The relationship-expanded system must not receive extra evidence unavailable to the baseline.

### 3. Build bounded candidates and features

Implemented first bounded candidate slice in `packages/shared/src/recall/relatedness.ts`: exact normalized-URL, page-key, and document-ID neighbors (including long gaps), then temporal neighbors within caller-supplied limits. Candidate generation does not assign semantic labels. Hard caps: 50,000 output pairs and 64 temporal neighbors; caller supplies max time gap.

Feature contract v1 records source IDs and timestamps plus a numeric vector: log time gap, same tab/window, URL availability/origin/exact URL/path-prefix ratio, document-ID availability/match, event/event-type flags, page/page-key/trigger flags, and redacted page-text availability/Jaccard. No raw URLs or text leave the extractor. Missing evidence has an availability flag and zero similarity. `find_related_evidence` now retrieves seed-identity matches across time plus a bounded temporal neighborhood (up to 1,000 candidates), generates capped candidate pairs, and ranks inspectable matches with transparent signals and `heuristic-v1`. Do not make session/context membership a required input.

### 4. Train and evaluate one scorer

A transparent rule/feature baseline is wired into MCP; its score is an uncalibrated ranking value, not a probability. The local Handwired training/evaluation pipeline is implemented in `packages/shared/src/recall/relatedness-experiment.ts` and runs with `pnpm --filter @tabot/shared relatedness:local -- <export.jsonl> [labels.jsonl] [model.json]`. It rejects thread/source split leakage, trains only from explicit related/unrelated pair judgments, compares held-out pair AUC against time/URL/lexical/heuristic baselines, and compares task-level P@8/recall@8/nDCG@8 against TalaDB-only and heuristic expansion. Model weights are written outside the repository; the MCP runtime does not load them. The current export is event-only, so page-text feature coverage is reported and may be zero. Handwired stays offline until real local judgments exist and the held-out decision gate passes.

Measure relevant-evidence recall, irrelevant-evidence rate/precision, ranking quality, and task-level usefulness. Report corpus size, label policy, feature availability, and limitations with the results. Inspect false joins, missed links, generic pages, sparse/no-text cases, and whether topical similarity is mistaken for task continuity. Establish acceptance thresholds before examining outcomes. Do not call uncalibrated scores probabilities.

### Decision gate

Keep investing in Handwired only if relationship expansion materially improves useful evidence retrieval over TalaDB alone without an unacceptable increase in irrelevant associations. Otherwise keep the simpler retrieval system and discard the learned layer. A graph/neural visualization is never proof that a relationship is meaningful.

## Migration after a successful experiment

1. Expose only demonstrated capabilities: evidence search, source provenance/time context, expansion to supported related items, and evidence-backed trails.
2. Keep MCP results sanitized and bounded. External sharing of page content must remain separately explicit and conform to the privacy contract.
3. Make relationships revisable interpretations with model/version and supporting source IDs—not historical facts or claims about intent.
4. Migrate popup, export, relay, and MCP consumers from sessions/episodes/contexts/memories only when a validated outcome replaces each contract.
5. Then remove unused derivation modules, thresholds, tests, exports, and context/memory tools. Do not change event/page IDs, schemas, or ingestion semantics merely to remove derived concepts. Keep immutable evidence authoritative.

## Risks and constraints

- Sparse event metadata may not establish useful relationships when page capture is off; communicate evidence limits honestly.
- Temporal proximity, same-origin visits, and shared topics can create false links. Show evidence and uncertainty.
- The existing deterministic hierarchy can become elaborate without delivering value; do not reproduce it under new names.
- The current derived models and their consumers are still present. Removing them is application-contract work, although sessions/contexts/memories are not persisted TalaDB documents.
- Handwired cannot learn meaning from raw browser JSON or arbitrary text by itself. Tabot must provide numeric features, training objective, examples, and held-out evaluation.

## Current implementation status

The existing local event/page capture and TalaDB persistence remain the evidence layer. MCP exposes paginated `search_evidence`, `find_related_evidence`, and `get_evidence_trail`, each capped at 8 outputs/page. Trails include requested seeds plus a page of related candidates, sorted chronologically; seeds are marked `role: seed`, heuristic candidates `role: related`. Relatedness accepts 1–8 source refs, retrieves exact URL/page/document identity matches across time plus temporal candidates within 1–720 hours (default 168), caps returned candidate pool at 1,000 and pair work at 20,000, and exposes origins, timestamps, redacted excerpts, matched source IDs, match signals, and `heuristic-v1` score. A capped pool is flagged. **Deferred infrastructure:** the local owner scans stored records (`O(n)`); measure before adding a local rebuildable index. Offset cursors use an event-time cutoff, so late-arriving older timestamps may shift pages; replace with a commit-sequence/keyset cursor if pagination stability becomes necessary. These are accepted proof-of-concept limits, not blockers for the Handwired experiment. Scores are uncalibrated ranking values, not probabilities. `relatedness:local` now provides the supervised fit and held-out comparison workflow, but no real local judgments or accepted thresholds exist yet; synthetic checks establish mechanics only. Handwired is not loaded by MCP, and relatedness is not validated against task relevance. First-scan cost and offset-cursor stability remain accepted proof-of-concept limits above.

Search uses TalaDB indexed record-kind/time filters and page-origin filtering before BM25-like ranking; native TalaDB FTS/vector retrieval is not wired in. Legacy context, memory, recurring-pattern, activity-metric, and feedback tools remain absent. Session/context/memory derivation remains legacy code and is not in the current MCP contract. The pinned Handwired scorer and local labeler remain offline experiments; Handwired is pinned at `257856e3b221140acb4cc4460626b850c0bd4ff1` and its private upstream repo has no package exports, so dependency/API remains commit-coupled.

### Page-capture reality check

`apps/extension/contents/tabot.ts` collects short, redacted visible-text excerpts automatically on eligible HTTP(S) origins while tracking is enabled. No per-origin consent choice remains. Capture still requires a focused, visible regular tab; incognito, login/auth/password paths and known password-manager hosts are excluded. Capture triggers after a 1-second visible dwell, scroll/mutation dwell, or trusted interaction; it reads only visible viewport text and skips form/contenteditable fields. Each observation is capped at 4 segments × 1,000 characters; capture has a 5-second per-resource minimum interval, 32 KiB/resource/day and 128 KiB/site/hour budgets. There is no time-based expiry; oldest records are removed only when the 25 MiB total storage budget is exceeded.

The user's JSONL export cannot tell whether page excerpts were stored. `packages/shared/src/share/export.ts` derives from events only and emits event/session/context/episode/memory rows; it excludes TalaDB `page-observation` records by design. Popup's **Saved page excerpts** per-origin counts are the available in-product check. Thus the export's missing text is an export-scope limitation, not proof capture failed. Historical capture coverage cannot be determined from this JSONL.

For a pipeline smoke test, a separate copy of the export was augmented with 342 clearly marked synthetic page-observation rows. Each uses URL-derived labels plus deterministic randomized placeholder text; no actual page text was fetched or inferred. `searchHistory` returned the expected synthetic page at rank 1 for all 20 sampled fixture-marker queries (0/20 baseline matches without page rows). This verifies only indexing/citation plumbing—not retrieval quality or real page-content value. The original export was left untouched.

### Local event-only fit probe

The supplied export contains 37,674 events, 35,002 URL-bearing rows, 339 normalized URLs across 66 origins, and 29,161 event IDs assigned to 106 legacy sessions; 8,513 events are outside those session sequences. It has 12,764 scrolls, 9,318 key-activity records, and 1,715 clicks. These are event-only counts; page observations are absent from this export by design, so the probe could not use page-text/document-ID features.

A process-local logistic probe used legacy session membership as **weak labels** (same session = positive; adjacent-session boundary = negative), with chronological session split (79 train / 27 held out): 5,067 training pairs, 1,802 test pairs. Gap-only versus all-16-feature metrics: AUC 0.9562→0.9563, precision 0.9589→0.9738, recall 0.9010→0.8973, accuracy 0.9367→0.9417. This tests imitation of the old sessionizer, **not** task relevance. No model or labels were persisted. It provides no evidence for or against Handwired on semantic recall; require local page evidence and genuine task-level relevance evaluation before deciding.

## References

- Handwired: https://github.com/chenglou/handwired and https://chenglou.me/handwired/
- TalaDB Web guide: https://taladb.dev/guide/web.html
- Current evidence and privacy flow: [`data-flow.md`](./data-flow.md)
