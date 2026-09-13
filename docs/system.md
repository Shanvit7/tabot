# Tabot System Overview

Tabot is a local-first Chrome extension plus browser dashboard. It records a small set of browser-activity signals, stores normalized events in IndexedDB, and deterministically derives sessions, activity episodes, contexts, and recurring behavioral patterns.

This is a walkthrough of current behavior. [`tech.md`](./tech.md) is technical source of truth.

## Pipeline

```text
Chrome tab APIs + content script
  -> Chrome extension background service worker
  -> SharedArrayBuffer ring buffer
  -> bounded drain and Dexie / IndexedDB
  -> pure derivation at read time
     events -> sessions -> anchors -> graph -> episodes -> contexts -> memories
  -> extension popup or local dashboard
```

Everything stays on device. There is no Tabot backend, account, cloud sync, page-content capture, typed-text capture, LLM, embedding store, or task/intent inference.

Only raw normalized events are durable. Derived results are rebuilt from those events, so changing a derivation algorithm does not require migrating derived tables.

## Capture

The content script and Chrome APIs collect these signals:

| Event | Source | Captured data |
| --- | --- | --- |
| `TAB_CREATED` | `chrome.tabs.onCreated` | tab and window IDs |
| `TAB_ACTIVATED` | `chrome.tabs.onActivated` | tab and window IDs |
| `TAB_UPDATED` | `chrome.tabs.onUpdated` | tab and window IDs |
| `TAB_REMOVED` | `chrome.tabs.onRemoved` | tab ID; window ID is `0` sentinel |
| `NAVIGATION` | `chrome.webNavigation.onCommitted`, main frame | tab ID and URL sidecar |
| `PAGE_VISIBLE`, `PAGE_HIDDEN` | `visibilitychange` | event only |
| `SCROLL` | viewport and discovered nested scroll containers | scroll offset |
| `CLICK` | document click | client coordinates |
| `KEY_ACTIVITY` | document keydown | event only |
| `SW_WINDOW_FOCUS` | `chrome.windows.onFocusChanged` | window ID focus transition (see SW telemetry section) |

`SCROLL` and `KEY_ACTIVITY` are throttled to 150 ms by TanStack Pacer before messaging the background worker. Key values, text, form values, DOM, screenshots, and page content are never recorded.

Content scripts send `TABOT_PAGE_EVENT` messages. They never touch shared memory. Background service worker is sole producer and owns tab URL/title metadata in an in-memory sidecar.

The extension also observes one service-worker-level signal (`SW_WINDOW_FOCUS`, see [SW telemetry](#service-worker-telemetry-phase-2-outcome)); four experimental SW signals (popup open, tracking toggle, download, lifecycle) were retired in the Phase 2 final reduction.

## Service Worker Telemetry (Phase 2 outcome)

Phase 2 ran a Service Worker (SW) telemetry experiment: could browser/extension-level signals improve segmentation beyond tab/page telemetry? The **final decision was KEEP WITH REDUCTION** — exactly one SW signal survives, four were retired.

### Surviving signal: `SW_WINDOW_FOCUS`

| | |
| --- | --- |
| Source | `chrome.windows.onFocusChanged` (requires `windows` permission) |
| Carries | `windowId`; sentinel `-1` = no window focused inside Chrome; metadata `previousWindowId` |
| Semantics | **contextual** — browser state, not activity. It may inform *continuity evidence* at the graph layer; it is never activity itself |
| Privacy | window identity only; no URL, no title, no content |

Why it exists: `tabs.onActivated` fires only when the active *tab* changes. Focusing a window without changing its tab (title-bar click, click-through) is invisible to Phase 1 telemetry. `SW_WINDOW_FOCUS` closes that gap.

What it is allowed to do (enforced by code, not convention):

- **Never a session boundary.** `sessionize` skips it entirely (like diagnostic events) — it cannot open, extend, merge, or split a session. A focus-only trace yields **0 sessions**.
- **No episode-boundary score boost.** The episode scorer has no SW terms; focus evidence is a causal record, not a scoring input.
- **Graph continuity evidence only.** `applyFocusContinuity` decorates an *existing* same-session edge with a strengthened weight when a causal focus sandwich is present (departure window w→x, return x→w chained by `previousWindowId`). Chains involving `previousWindowId === -1` (browser focus loss/regain) are excluded. Evidence requires behavioral anchors on both sides — it can never create a node, edge, or episode, only strengthen an existing trajectory.

Net measured effect on real browsing: SW telemetry adds **zero** sessions, episodes, contexts, or memories; the only delta is graph evidence counts where cross-window continuity genuinely occurred.

### Retired signals (historical rows only)

`SW_POPUP_OPEN`, `SW_TRACKING_TOGGLE`, `SW_DOWNLOAD`, `SW_LIFECYCLE` are classified **diagnostic**: invisible to every behavioral layer (sessions, transitions, contexts, memories). The extension no longer produces them. Their enum indices 10–14 and decode branches are **kept** so historical Dexie rows still decode deterministically — then are filtered out at derivation. Deterministic, not runtime-configurable.

### Taxonomy rules

Every event carries a semantic class, applied by the shared classifier before any derivation touches it:

| Class | Effect |
| --- | --- |
| `behavioral` | may contribute to sessions/episodes/contexts as evidence |
| `contextual` | shapes interpretation of *other* events; not itself activity |
| `diagnostic` | never influences derivation; engineering only — the firewall rule |

The SW experiment documented 5 signals, 4 categories, 1 new permission (`downloads`), 0 content-bearing fields — and ended with `downloads` permission **removed** and only `SW_WINDOW_FOCUS` retained. Full experimental record: `docs/sw-schema.md` (schema design, still current for encode/decode).

`packages/shared/src/buffer.ts` defines a 10,000-slot `SharedArrayBuffer` ring buffer. Each 32-byte slot stores fixed-width numeric data only:

```text
type, tabId, windowId, flags, timestamp high, timestamp low, value0, value1
```

Four atomic control slots hold logical write, read, capacity, and published indexes.

- Producer writes a complete slot, then publishes its logical index.
- Consumer reads only through published index; it cannot read half-written slots.
- Physical position is `logicalIndex % capacity`; logical indexes keep event IDs unique across slot reuse.
- Full buffer rejects new event and increments visible `droppedEvents`.
- MV3 service workers cannot block on `Atomics.wait`; a queued microtask drains new work and 200 ms polling is fallback wakeup.

Background drains at most 512 events per pass. It updates aggregate counters, enriches each event with current tab URL if available, advances read index, then asynchronously persists with Dexie `bulkPut`. A persistence failure is logged and does not block capture.

`tabot_events` contains one `events` table:

```text
id, timestamp, type, tabId
```

`id` is `${timestamp}-${tabId}-${logicalIndex}`. URLs, window IDs, and event metadata are stored but intentionally unindexed. Old `tabot_rxdb` storage is deleted on first Dexie open.

## Derivation

All derivation functions live in `packages/shared/src` and are pure over `StoredTabEvent[]` (plus a supplied clock where needed).

### 1. Meaningful events

`deriveMeaningfulEvents` removes `TAB_UPDATED` noise unless URL identity changed. A `NAVIGATION` always remains, including a reload at same URL. It also derives URL/page transitions while retaining source event IDs.

### 2. Sessions

`sessionize` starts a new session at first applicable boundary:

| Boundary | Threshold |
| --- | ---: |
| no activity | 5 min |
| `PAGE_HIDDEN` then `PAGE_VISIBLE` | 2 min |
| non-activation event on tab silent since last event | 10 min |
| switch from window silent before event | 30 s |

A session retains full event sequence, tab/domain participation, interaction counts, navigation count, and tab-switch count. Full sequence retention matters because later episode segmentation operates on real event trajectories.

### 3. Anchors, graph, and episodes

An activity anchor is a meaningful page span (`origin + pathname`) in one session, with event, interaction, and navigation counts. Page change or a gap over 30 min opens a new anchor. URL-less browser-chrome activity folds into current anchor rather than creating an empty identity.

Graphology builds sparse directed edges between nearby anchors. Edge type is strongest available evidence: `same-page`, `same-origin`, `navigation`, `interaction-continuity`, `same-tab`, or `temporal-adjacency`. Weights decay exponentially over a 15-minute scale. Short cross-session return edges are allowed only within five minutes.

Episodes are chronological, not graph connected components. Each candidate anchor boundary receives a trajectory-coherence score from:

- temporal continuity;
- typed graph continuity;
- navigation and interaction continuity;
- local profile similarity: origin/page sets, tabs, rates, density, and focused-origin continuity.

A boundary splits when discontinuity is strong enough and next-side activity persists. Hysteresis and a split penalty suppress flicker; a cleanup pass merges tiny, weak fragments only where adjacent activity supports it. This preserves coherent multi-site research while splitting durable shifts in behavior.

### 4. Contexts

Contexts group chronological episodes under a 30-minute adjacent-gap limit and a 90-minute total-span cap. Trajectory-segmented episode boundaries are final; only fallback episodes that lack raw trajectories can merge with strong same-origin or coherent-chain transition evidence. Domain totals come from the episodes owned by that context, not whole sessions that may contain several activities.

A context describes related browser activity, not a user task.

### 5. Memories

A memory is a recurring behavioral pattern, not an exact domain-set match. Each context produces a fingerprint containing weighted domains, ordered origins and transitions, entry/exit origins, plus navigation and interaction rates.

Candidate contexts cluster at behavioral similarity >= 0.65. Similarity combines token-level ordered-sequence edit distance, domain and transition overlap, entry/exit agreement, and interaction profile. A strict domain superset is blocked from merging. A repeated pattern must have occurrences at least 30 minutes apart; adjacent fragments become one occurrence.

Single-occurrence patterns require 500 events. Generic single-site activity such as Google, ChatGPT, YouTube, or new-tab activity does not become a memory. Memory records expose confidence, strength, occurrence evidence, staleness, and an observed sequence. They never contain inferred intent.

## Local Dashboard

`apps/web/src/routes/dashboard.tsx` has Overview, Activity, Memories, and Export views. It asks the extension for `GET_STATS`, `GET_COUNTS`, and `GET_EVENTS`, then derives dashboard views in browser memory using shared pure functions. It does not send data to a server.

The dashboard must run at an origin allowed by extension `externally_connectable`. Production permits `https://shanvit7.github.io/*`; local development permits `http://localhost:3000/*`. The Chrome Web Store assigns one stable extension ID. Set it as GitHub Actions variable `TABOT_EXTENSION_ID`; deploy passes it to `VITE_TABOT_EXTENSION_ID`, so installed users connect automatically

## Checks

```bash
pnpm lint
pnpm --filter shared check:sessions
pnpm --filter shared check:meaningfulEvents
pnpm --filter shared check:activityGraph
pnpm --filter shared check:contexts
pnpm --filter shared check:stabilization
pnpm --filter shared check:memories
pnpm --filter shared check:retrieval
pnpm --filter shared check:liveContext
pnpm --filter shared check:pipeline
pnpm --filter shared check:v5regression
pnpm --filter shared check:bufferRoundtrip
pnpm --filter shared run swSemantics
pnpm --filter shared run swDerivation
pnpm --filter shared run swGraph
pnpm --filter shared run swEpisodes
pnpm --filter shared run swFirstSignal
pnpm --filter shared run swCost
pnpm --filter shared run swValidation
pnpm --filter extension build
pnpm --filter web build
```
