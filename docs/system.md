# Tabot — System Overview

How the pipeline works end-to-end, the algorithms behind each derivation stage, and what the activity graph does.

> Companion to [`tech.md`](./tech.md), which is the authoritative spec. This document is the walkthrough: the *flow*, the *algorithms*, and the *graph* in plain terms.

---

## 1. The pipeline at a glance

```text
Chrome extension (content script + background service worker)
  → raw browser events (tab lifecycle, navigation, scroll, click, keys)
  → SharedArrayBuffer ring buffer + Atomics        (hot path, no allocation)
  → background drain (bounded batches)             (decode → count → enrich)
  → Dexie / IndexedDB                               (durable source of truth)
  → lazy derivation chain                           (rebuildable, no tables)
      events → Sessions → Contexts → Memories → Retrieval → Live snapshot
  → dashboard (aggregates + derived views only)
```

Every stage downstream of IndexedDB is **lazy and deterministic**: nothing but raw events is persisted. Sessions, contexts, memories, and retrieval results are re-derived from events on read. Same input → same output. The graph is the middle stage that turns *sessions* into *activity episodes*, which is what contexts are actually built from.

---

## 2. Stage 0 — Capture (extension)

**Content script** (`apps/extension/contents/tabot.ts`) collects page-level events:

| Event | Source | Metadata |
|---|---|---|
| `PAGE_VISIBLE` / `PAGE_HIDDEN` | `visibilitychange` | — |
| `SCROLL` | window + nested scrollable elements | `scrollY` |
| `CLICK` | document `click` | `x`, `y` |
| `KEY_ACTIVITY` | document `keydown` | — (never the key value) |

- `SCROLL` and `KEY_ACTIVITY` are throttled by **TanStack Pacer** at the content-script boundary (150ms).
- Content scripts never write shared memory — they send messages via `chrome.runtime` (`TABOT_PAGE_EVENT`).

**Background service worker** (`apps/extension/background.ts`) collects Chrome tab-lifecycle events and is the **sole producer** into the SAB:

| Event | Chrome API |
|---|---|
| `TAB_CREATED` | `tabs.onCreated` |
| `TAB_ACTIVATED` | `tabs.onActivated` |
| `TAB_UPDATED` | `tabs.onUpdated` |
| `TAB_REMOVED` | `tabs.onRemoved` |
| `NAVIGATION` | `webNavigation.onCommitted` (main frame) |

A sidecar `Map<tabId, {url, title}>` holds variable-length data (URLs) so only fixed-size numbers enter shared memory.

---

## 3. Stage 1 — Transport (SharedArrayBuffer ring buffer)

File: `packages/shared/src/buffer.ts`

A single `SharedArrayBuffer` holds:

- **4 control slots** (`Int32`): `WRITE_INDEX`, `READ_INDEX`, `CAPACITY`, `PUBLISHED_INDEX`.
- **10,000 event slots**, each `8 × Int32 = 32 bytes`: `type, tabId, windowId, flags, timestampHi, timestampLo, value0, value1`.

**Algorithms / mechanics:**

- **Lock-free single-producer ring buffer.** The producer writes the slot, then advances `WRITE_INDEX`, then `PUBLISHED_INDEX`. The consumer reads only up to `PUBLISHED_INDEX` — so it never sees a half-written slot. That ordering is the publication protocol.
- **Logical (monotonic) indexes, physical slot = `logical % capacity`.** Event `id` uses the logical index, so IDs never collide even when slots are reused or the service worker restarts.
- **Full check** is `writeIndex - readIndex >= capacity`; on overflow the write is rejected and `droppedEvents` increments (data loss is counted, not silent).
- **`Atomics.wait` is unavailable** in MV3 service workers, so the drain is woken by `queueMicrotask` + a 200ms fallback poll, not blocking.

Timestamp is split across two `Int32`s (`hi * 2³² + lo`) to keep 64-bit precision in 32-bit cells.

---

## 4. Stage 2 — Drain + persistence (background)

File: `apps/extension/background.ts`

```text
SAB → processBatch() → decode ≤512 events → advance READ_INDEX → enrich → bulkPut
```

- `processBatch` decodes at most **512** events per drain, reads each slot, increments per-type counters, and builds `StoredTabEvent[]`.
- URL enrichment happens at drain time from the sidecar (`getMeta(tabId)`).
- `READ_INDEX` advances **after** the batch is read; the decoded docs are then handed to Dexie asynchronously (`bulkInsertEvents`).
- Persistence is **downstream of the hot path**: a failed `bulkPut` is logged but never blocks the drain.
- Dexie schema: `events: 'id, timestamp, type, tabId'` (the only indexed fields; `windowId`, `url`, metadata are stored but not indexed). DB is `tabot_events`.

The UI never reads the raw event *stream* — it reads `StatsSnapshot` aggregates plus the persisted count (`db.events.count()`), and can fetch events for local derivation.

---

## 5. The derivation chain (pure, lazy)

Everything below lives in `packages/shared/src/*` and is **pure**: a function of `StoredTabEvent[]` (plus a fixed `now` for staleness). Each layer has a runnable `*.check.ts` assert script.

```text
StoredTabEvent[]
  → deriveMeaningfulEvents()        (dedupe noise)
  → sessionize()                     → Session[]
  → buildActivityAnchors() + buildActivityGraph() + extractActivityEpisodes()
  → buildContexts()                  → BrowserContext[]
  → buildMemories()                  → Memory[]
  → retrieval primitives             → summaries / similarity / timeline
  → buildLiveContext()               → LiveBrowserContext
```

### 5.1 Meaningful events — noise reduction

File: `meaningful-events.ts`

`TAB_UPDATED` fires on *any* property change. `deriveMeaningfulEvents` keeps it **only when the tab's URL identity actually changed** (tracked per tab). A `NAVIGATION` always emits (reloading the same URL is still an action). Result: the browser-state noise is collapsed while behavioral signal is preserved.

### 5.2 Sessions — segmentation by time

File: `sessions.ts`

`sessionize(events)` sorts by timestamp and walks the stream, opening a new session on the first matching boundary (priority order):

| # | Boundary | Threshold |
|---|---|---|
| 1 | gap from previous event | ≥ 5 min |
| 2 | `PAGE_HIDDEN` → `PAGE_VISIBLE` | ≥ 2 min |
| 3 | a silent tab gets a non-activation event | ≥ 10 min |
| 4 | window switch after prior window silent | ≥ 30 s |

Each session accumulates event count, interaction count (`CLICK`+`KEY_ACTIVITY`+`SCROLL`), navigation count, tab switches (`TAB_ACTIVATED`), per-tab and per-domain participation. The event sequence is kept but trimmed to empty past 1000 events (summaries survive).

### 5.3 The activity graph — see §6

The graph turns sessions into **activity episodes**. This is the conceptual heart of the pipeline and is described in full below.

### 5.4 Contexts — grouping episodes

File: `contexts.ts`

Contexts are **not** built by connecting raw sessions anymore — they are built from **activity episodes**. `buildContexts`:

1. `buildActivityAnchors(sessions)` — meaningful page-spans per session.
2. `buildActivityGraph(anchors)` — typed, weighted graph.
3. `extractActivityEpisodes(anchors, graph)` — segment the graph into episodes.
4. Walk episodes chronologically; merge the next episode into the current context when:
   - gap ≤ 30 min **and** total span ≤ 90 min (hard cap against transitive chains), **and**
   - episode-level merge evidence exists — tiered:
     - **T1** same-origin navigation across the boundary (strong),
     - **T2** coherent cross-domain chain (strong),
     - **T3** same-tab + short boundary gap (supporting only; a tab is a surface, not a task).
   - A **home-origin departure/return** is a boundary unless overridden by T1/T2.

A context has a `primaryDomain` (top by event count, display-only), domain evidence, a merged ordered `sequence`, `transitions`, and `excursions` (short round-trips that don't split the context).

### 5.5 Memories — recurrence

File: `memories.ts`

A memory's **signature** is the context's top-6 domains by event count, alphabetized, joined with `+`. Contexts with the **exact same signature** consolidate into one memory; partial overlap stays separate.

| Rule | Value |
|---|---|
| recurrent = | ≥ 2 contexts with same signature |
| single context qualifies = | ≥ 500 events |
| signature domain cap | 6 |
| staleness | `now - lastSeen` (stale after 7 days, but not deleted) |
| `strength` | `contextCount × min(domainCount, 5)` |
| cap | 50 memories |

`observation` is an evidence template (e.g. "visited github.com, slack.com across 3 activity periods"); `inference` is **always `null`** — no intent, no LLM.

### 5.6 Retrieval — bounded queries

File: `retrieval.ts`

Query primitives over the derived layer, all bounded (≤ 500 contexts / 50 memories per read):

- **Temporal**: recent / today / between.
- **Domain**: contexts with a domain, memory history for a domain.
- **Similarity**: **Jaccard index** over domain sets — `|A∩B| / |A∪B|`, returns `0` for two empty sets, excludes self, sorts descending, default cap 5 (3 for recurrence's related list).
- **Current-context**: latest context, previous, novelty (domain not seen in lookback), exact-signature recurrence.
- **Composites**: `summarizeContext` (observation + domain list + event density), `reportRecurrence`, `getActivityTimeline`, `getDomainHistory`.

### 5.7 Live context — snapshot

File: `live-context.ts`

`buildLiveContext` joins the live event stream with the historical layer on demand: active tab/window, current URL, interaction intensity (`interactions / minutes`), recent navigations, and top-3 similar contexts/memories. No live-context table or real-time stream exists yet — it's derived at read.

---

## 6. The activity graph

Files: `activity-graph.ts` (plus `meaningful-events.ts` for input)

**The graph is the evidence substrate that turns "a session" (a time span) into "activities" (what the user was actually doing).** A browser session is *not* an activity: one session can contain several loosely-related activities (legal work → LinkedIn → research → legal work). The graph exists to separate those.

**Substrate**: [graphology](https://graphology.github.io/) — the only non-stdlib dependency in the derivation chain.

```text
Session[] + derived meaningful events
  → ActivityAnchor[]          (nodes: a page-span with counts)
  → Graph<Anchor, Edge>       (typed, weighted, temporally-bounded edges)
  → ActivityEpisode[]         (segmented runs of related anchors)
  → Contexts (built from episodes)
```

### 6.1 Nodes — `ActivityAnchor`

An anchor is a **meaningful browser state**: a page (`origin + pathname`) the user stayed on for a span, with `eventCount`, `interactionCount`, `navigationCount`, and the raw event IDs folded into it. A page change or an inactivity gap (`> 30 min`) opens a new anchor. Anchors also carry `domainEvents` (per-origin counts) so activity attribution stays accurate even for session-summary fallback anchors.

### 6.2 Edges — `RelationshipEdge`

Seven typed, directed edges:

| Type | Weight (base) |
|---|---|
| `same-page` | 1.0 |
| `navigation` | 1.0 |
| `return` | 0.9 |
| `same-origin` | 0.8 |
| `interaction-continuity` | 0.7 |
| `same-tab` | 0.6 |
| `temporal-adjacency` | 0.4 |

- **Weight = base × temporal decay**: `exp(-gapMs / DECAY_CONSTANT_MS)` where `DECAY_CONSTANT_MS = 15 min`. Closer in time = stronger.
- **Hard temporal gate**: no edge across an inactivity gap `> 15 min` (`RELATIONSHIP_CUTOFF_MS`).
- **Sparse, local construction** (keeps edges `≪ N²`):
  1. Chronological within-session edges between consecutive anchors — typed by the **strongest** evidence present (priority: same-page > same-origin > navigation > interaction-continuity > same-tab > temporal-adjacency).
  2. Cross-session **`return` edges**: same page in a later session within the excursion window (5 min) — a short return is an excursion; a longer return is recurrence and must **not** fuse disjoint sessions.

### 6.3 Segmentation — `extractActivityEpisodes`

Explicitly **not** connected components and **not** community detection. The graph supplies *evidence*; chronological order supplies the *constraint*. Walking anchors in time order, a new episode starts on:

- a hard temporal gap (`> 30 min`),
- a cross-session boundary with **no graph edge**,
- a **home-origin departure/return** — leaving or returning to the session's dominant origin (the task cluster), or
- otherwise the anchor joins the current episode when a **strong** same-page/same-origin edge exists.

**Home-origin logic**: a session's dominant origin (≥ 2 anchors *and* strictly more than any other origin) is the "home". Leaving it is a boundary; returning is a boundary; but a **balanced cross-domain chain** (DeepSeek → Google → Amboras → LinkedIn, no dominant) has no home to leave, so it stays one coherent episode.

Each episode records its anchors, sessions, domains, counts, `primaryDomain`, `homeOrigin`, and per-origin `domainEvents`.

### 6.4 What the graph gives the pipeline

1. **Activity segmentation within a session** — a session containing legal work + LinkedIn + research is split into separate episodes instead of being one blob.
2. **Evidence for context merging** — same-page/same-origin edges keep related activity together; the tiered merge rules (T1/T2/T3) read episode boundaries, not raw session adjacency.
3. **Excursions** — short round-trips (main → external → main) are detected and kept *inside* a context rather than fragmenting it.

Without the graph, contexts would be built from raw session connectivity and would mis-group a long multi-activity session (or split a coherent research chain on every domain hop). The graph is what makes contexts describe *activity*, not just *time*.

---

## 7. Dashboard

File: `apps/web/src/routes/metrics.tsx` + `src/lib/metrics-data.ts`

The dashboard polls the extension (`GET_STATS`, `GET_COUNTS`, `GET_EVENTS`) and re-derives sessions/contexts/memories **in memory** from fetched raw events via the shared pure functions. It renders six tabs — Pipeline, Sessions, Contexts, Memories, Live, Export — and only ever shows aggregates plus derived views, never the raw event stream.

Export: JSONL + manifest (canonical, self-describing) or CSV (flat session convenience view).
