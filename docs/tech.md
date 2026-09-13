# Tabot Technical Specification

> **Single source of truth for Tabot's technical architecture and deterministic browser-context layer.** This document supersedes the earlier split specifications (`metrics.md`, `sessions-spec.md`, `contexts-spec.md`, `memories-spec.md`, `retrieval-spec.md`, `liveContext-spec.md`). Companion walkthrough: [`system.md`](./system.md).

---

## 1. Product Boundary

Tabot is an engineering prototype: a Chrome extension and local web dashboard that collect browser activity at volume, retain it locally, and deterministically derive browser context.

```text
Chrome tab APIs + content script
  -> background service worker (sole producer)
  -> SharedArrayBuffer ring buffer + Atomics
  -> bounded drain + Dexie / IndexedDB
  -> pure lazy derivation:
     events -> sessions -> anchors -> graph -> episodes -> contexts -> memories -> retrieval
  -> live browser-context snapshot
```

All data remains local. There is no backend, authentication, cloud storage, remote ingestion, LLM, embeddings, vector database, productivity scoring, or semantic task inference.

### Architectural principles

1. **Raw events are immutable source data.** Every derived object is disposable and rebuildable.
2. **No semantic claims from sparse telemetry.** The system may report domains, timestamps, counts, overlaps, recurrences, and similarity scores; it must not assert what a user was doing.
3. **No new telemetry for the derived layer.** Use the existing event stream until Phase 7 evaluates whether it is sufficient.
4. **Deterministic and bounded.** Same input produces the same output, and all derived/retrieval reads have practical caps.
5. **Evidence first.** Derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them.

### Privacy boundary

`KEY_ACTIVITY` records only that a key-activity occurrence happened. Tabot never records typed text, key values, characters, input values, passwords, DOM snapshots, page content, or browsing data outside local IndexedDB.

---

## 2. Stack and Repository

- **Extension:** Plasmo, Manifest V3, Chrome target, background service worker.
- **Dashboard:** TanStack Start (SPA mode), React 19, Tailwind, TanStack Charts, BoldKit UI.
- **Language/package manager:** TypeScript (ESNext, bundler resolution), pnpm workspaces.
- **Concurrency:** `SharedArrayBuffer` and `Atomics` using `Int32Array`.
- **Rate shaping:** TanStack Pacer at the content-script boundary.
- **Persistence:** Dexie 4.x over IndexedDB database `tabot_events`, `events` table.
- **Graph substrate:** graphology.
- **Backend:** none.

```text
tabot/
├── apps/
│   ├── extension/
│   │   ├── background.ts                # event producer, SAB drain, Dexie, messaging
│   │   ├── contents/tabot.ts            # page-level telemetry collection
│   │   └── popup.tsx                    # aggregate pipeline statistics
│   └── web/
│       ├── src/routes/                  # landing + dashboard routes
│       ├── src/lib/dashboard-data.ts    # extension transport + in-memory derivation
│       └── src/components/              # landing, dashboard, and UI components
├── packages/shared/src/
│   ├── events.ts, buffer.ts, protocol.ts, metadata.ts, db.ts, logger.ts
│   ├── sessions.ts, meaningful-events.ts, activity-graph.ts, episode-boundary.ts
│   ├── sw-semantics.ts, sw-graph.ts          # SW telemetry layer (Phase 2)
│   ├── contexts.ts, memories.ts, retrieval.ts, live-context.ts
│   └── *.check.ts                       # runnable derivation checks
└── docs/
    ├── tech.md                          # this document
    └── system.md                        # walkthrough of flow, algorithms, and graph
```

---

## 3. Raw Browser Telemetry

### Event registry

The event registry is additive; event numbers are never renumbered.

```ts
export const EVENT_TYPES = {
  TAB_CREATED: 0,
  TAB_ACTIVATED: 1,
  TAB_UPDATED: 2,
  TAB_REMOVED: 3,
  NAVIGATION: 4,
  PAGE_VISIBLE: 5,
  PAGE_HIDDEN: 6,
  SCROLL: 7,
  CLICK: 8,
  KEY_ACTIVITY: 9,
  // SW telemetry (Phase 2). Indices fixed — ever. Historical Dexie rows
  // decode via these values even though only SW_WINDOW_FOCUS is produced.
  SW_WINDOW_FOCUS: 10,
  SW_POPUP_OPEN: 11,
  SW_TRACKING_TOGGLE: 12,
  SW_DOWNLOAD: 13,
  SW_LIFECYCLE: 14,
} as const;
```

### Captured events and data

| Event | Source / trigger | Per-event metadata |
|---|---|---|
| `TAB_CREATED` | `chrome.tabs.onCreated` | none |
| `TAB_ACTIVATED` | `chrome.tabs.onActivated` | none |
| `TAB_UPDATED` | `chrome.tabs.onUpdated` | none |
| `TAB_REMOVED` | `chrome.tabs.onRemoved` | none; `windowId` uses `0` sentinel |
| `NAVIGATION` | `chrome.webNavigation.onCommitted`, main frame only | none |
| `PAGE_VISIBLE` | content-script `visibilitychange` to visible | none |
| `PAGE_HIDDEN` | content-script `visibilitychange` to hidden | none |
| `SCROLL` | window and qualifying nested scroll containers | `scrollY` |
| `CLICK` | document `click` listener | client `x`, `y` |
| `KEY_ACTIVITY` | document `keydown` listener | none |
| `SW_WINDOW_FOCUS` | `chrome.windows.onFocusChanged` | `previousWindowId` (see [SW telemetry](#15-service-worker-telemetry-phase-2-final)) |

`SW_POPUP_OPEN`, `SW_TRACKING_TOGGLE`, `SW_DOWNLOAD`, `SW_LIFECYCLE` occupy indices 11–14 for historical decode only; the extension no longer produces them and derivation classifies them `diagnostic` (never behavioral).

Every persisted event has this representation:

```ts
interface StoredTabEvent {
  id: string;       // `${timestamp}-${tabId}-${logicalIndex}`
  type: TabEventType;
  tabId: number;
  windowId: number;
  timestamp: number; // Date.now() at capture
  url?: string;      // in-memory tab metadata enrichment at drain time
  metadata?: { x?: number; y?: number; scrollY?: number };
}
```

`id` uses a monotonic logical ring-buffer index, never a physical slot. This prevents collisions when ring-buffer slots are reused or the service worker restarts.

### Collection details

- `SCROLL` and `KEY_ACTIVITY` are Pacer-throttled at the content-script boundary (currently 150ms).
- `SCROLL` observes `window` plus nested elements with `overflow-y: auto|scroll` and `scrollHeight > clientHeight`.
- `CLICK`, `PAGE_VISIBLE`, and `PAGE_HIDDEN` are emitted directly.
- Chrome tab lifecycle and navigation events are not throttled.
- `TAB_REMOVED` cleans its `tabMeta` entry. `TAB_CREATED` and `TAB_UPDATED`, plus navigation handling, update sidecar URL/title metadata.

### Metrics and UI boundary

The popup and dashboard consume only aggregate `StatsSnapshot` values, not raw events:

```ts
interface StatsSnapshot {
  totalEvents: number;
  tabCreated: number; tabActivated: number; tabUpdated: number; tabRemoved: number;
  navigation: number;
  pageVisible: number; pageHidden: number;
  scroll: number; click: number; keyActivity: number;
  eventsProcessed: number; droppedEvents: number;
  bufferCapacity: number; bufferOccupancy: number; peakBufferOccupancy: number;
  lastProcessedAt: number;
}
```

The UI also obtains the authoritative persisted count through `db.events.count()`. It must show dropped events and buffer occupancy/peak, not only processed totals. The dashboard may additionally fetch raw events for in-browser derivation, but it never renders the raw stream.

---

## 4. Event Transport and Persistence

### Metadata sidecar

Variable-length values never enter shared memory. `tabMeta: Map<tabId, { url?, title?, lastSeen }>` is maintained in the background worker and URL metadata is added to decoded events at persistence time.

### SharedArrayBuffer ring buffer

The background service worker is the only producer. Content scripts send page events through `chrome.runtime` and never write to the SAB directly.

- Capacity: `10,000` slots.
- Event slot: `8 * Int32` = `32` bytes (`type`, `tabId`, `windowId`, flags, timestamp high/low, `value0`, `value1`).
- Control slots: `WRITE_INDEX`, `READ_INDEX`, `CAPACITY`, `PUBLISHED_INDEX`.
- Logical indexes are monotonic. Physical slot is `logicalIndex % capacity`.
- `PUBLISHED_INDEX` is the consumer's source of truth: fields are written before publication.
- `SCROLL` stores `scrollY` in `value0`; `CLICK` stores `x` and `y` in `value0`/`value1`.
- An attempt to write when `writeIndex - readIndex >= capacity` fails and increments `droppedEvents`.

MV3 service workers cannot use `Atomics.wait`, so draining uses queued microtasks with short burst polling and a 200ms fallback poll.

### Drain and IndexedDB

The background consumer decodes at most `512` events per drain, advances `READ_INDEX` after reading the batch, updates aggregate counters, enriches events with `tabMeta`, then asynchronously calls Dexie's `bulkPut`.

```text
SAB -> bounded drain (512) -> StoredTabEvent[] -> Dexie bulkPut -> IndexedDB
```

Persistence is downstream from the hot path. A failed `bulkPut` is logged; it does not block the drain. The Dexie schema is:

```ts
events: 'id, timestamp, type, tabId'
```

`windowId`, `url`, and numeric metadata are stored but not indexed. The database is `tabot_events`; the legacy `tabot_rxdb` database is deleted at first open.

### Messages

`GET_STATS` is synchronous. `GET_COUNTS` is asynchronous and returns `{ dexieCount }` (with legacy `rxdbCount` compatibility while consumers retain it). `TABOT_PAGE_EVENT` accepts content-script events. `GET_EVENTS` returns persisted events for in-browser derivation. Both internal and `onMessageExternal` listeners expose the same contract for the web dashboard.

---

## 5. Derived Browser Intelligence

The deterministic derived layer is:

```text
StoredTabEvent[]
  -> deriveMeaningfulEvents()      (collapse browser-state noise)
  -> sessionize()                  -> Session[]
  -> buildActivityAnchors() + buildActivityGraph() + extractActivityEpisodes()
  -> buildContexts()               -> BrowserContext[]
  -> buildMemories()               -> Memory[]
  -> retrieval primitives          -> summaries / similarity / timeline
  -> buildLiveContext()            -> LiveBrowserContext
```

All layers use **lazy derivation**. No sessions, contexts, memories, retrieval, or live-context tables exist in IndexedDB. Persisted events remain the only durable source of truth.

### Shared constraints

- No LLM, semantic search, embeddings, vector database, user-intent inference, cross-device correlation, content semantics, or application identity beyond domains.
- New algorithms must remain pure at their core and expose a minimal Dexie adapter around that core.
- The current 500-context / 50-memory bounds are deliberate. Add persistence caches only after measurement proves lazy derivation insufficient.

---

## 6. Events to Sessions

A `Session` is a coherent continuous period of browser activity. It describes what occurred, not the user's task.

```ts
interface Session {
  id: string; // `${startTimestamp}-${endTimestamp}-${activeTabId}`
  startTimestamp: number;
  endTimestamp: number;
  duration: number;
  eventCount: number;
  tabs: TabParticipation[];
  domains: DomainParticipation[];
  interactionCount: number; // CLICK + KEY_ACTIVITY + SCROLL
  navigationCount: number;
  tabSwitchCount: number;
  eventSequence: StoredTabEvent[]; // full sequence retained (no trim)
  activeTabId: number;
  activeWindowId: number;
}
```

### Boundaries and thresholds

A time-ordered event starts a new session when the first applicable condition succeeds:

| Priority | Condition | Threshold |
|---:|---|---:|
| 1 | Gap from previous event | `>= 5 minutes` |
| 2 | `PAGE_HIDDEN` immediately followed by `PAGE_VISIBLE` | `>= 2 minutes` |
| 3 | A previously observed tab becomes active after silence | `>= 10 minutes` |
| 4 | Event switches windows after the previous window has been silent | `>= 30 seconds` |

Events are sorted by timestamp first. Domain participation is only recorded for events with a URL; malformed URLs become domain `unknown`. Tab/window last-event maps survive session boundaries to detect a return after absence. `activeTabId` is the most active tab that received `TAB_ACTIVATED`; `activeWindowId` is the window with most events.

### Sequence retention

The full `eventSequence` is retained without trimming. The episode layer segments from real event trajectories, so collapsing a large session into an empty sequence would erase the material segmentation needs.

### APIs and bounds

```ts
sessionize(events): Session[]
getSessions(db, start?, end?): Promise<Session[]>
getSessionById(db, id): Promise<Session | undefined>
getRecentSessions(db, limit = 10): Promise<Session[]>
```

`getSessions` uses indexed timestamp boundaries where supplied. `sessionize([])` returns `[]`; a one-event input returns one valid zero-duration session.

---

## 7. Events to Episodes: the Activity Graph

An `ActivityAnchor` is a meaningful browser state: a page (`origin + pathname`) the user stayed on within one session, with event, interaction, and navigation counts. A page change or an inactivity gap (`> 30 minutes`) opens a new anchor. URL-less browser-chrome activity folds into the current anchor rather than creating a standalone empty identity.

Graphology builds a sparse, directed, typed graph of anchors:

- **Chronological within-session edges** between consecutive anchors, typed by the strongest evidence present (`same-page` > `same-origin` > `navigation` > `interaction-continuity` > `same-tab` > `temporal-adjacency`).
- **Cross-session `return` edges** on the same page within a five-minute excursion window. Longer returns are recurrence, not continuity, and must not fuse disjoint sessions.

Edge weights decay exponentially over a 15-minute scale; no edge crosses an inactivity gap beyond 15 minutes. Construction stays local, keeping `E << N²`.

`extractActivityEpisodes` walks anchors chronologically — not connected components, not community detection. For each candidate boundary it computes a trajectory-coherence score from:

| Signal | Weight |
|---|---:|
| local trajectory profile similarity | 0.45 |
| typed graph continuity | 0.2 |
| interaction continuity | 0.15 |
| temporal continuity | 0.1 |
| navigation continuity | 0.1 |

A boundary splits when discontinuity is strong and the following activity persists. Hysteresis and a split-vs-merge penalty suppress flicker; a cleanup pass merges tiny weak fragments only where adjacent activity supports them. The result separates a session containing legal work, LinkedIn, and research into distinct episodes while keeping a coherent multi-site research chain whole.

### Interfaces

```ts
interface ActivityAnchor {
  id: string;
  startAt: number; endAt: number;
  sessionId: string; tabId: number; windowId: number;
  origin: string; pathname: string; pageKey: string;
  eventIds: string[]; eventCount: number;
  interactionCount: number; navigationCount: number;
  domainEvents?: Record<string, number>;
}

interface ActivityEpisode {
  id: string;
  anchorIds: string[];
  startTimestamp: number; endTimestamp: number; duration: number;
  sessionIds: string[]; domains: string[];
  totalEventCount: number; totalInteractionCount: number; totalNavigationCount: number;
  primaryDomain: string;
  boundaryType: "start" | "end" | "internal";
  homeOrigin: string;
  domainEvents: Record<string, number>;
  boundaries?: BoundaryDiagnostic[];
  trajectorySegmented: boolean;
}
```

`trajectorySegmented` distinguishes episodes built from real event trajectories from fallback summary anchors that have no raw sequence; the context layer trusts only fallback episodes for transition-chain merge evidence.

---

## 8. Episodes to Contexts

A `BrowserContext` is a non-overlapping cluster of related episodes. It is evidence of related browser activity, never a task label.

```ts
interface BrowserContext {
  id: string; // `${firstEpisodeId}-${lastEpisodeId}`
  startTimestamp: number; endTimestamp: number; duration: number;
  sessionIds: string[]; sessionCount: number;
  domains: ContextDomain[];
  totalEventCount: number; totalInteractionCount: number;
  totalNavigationCount: number; totalTabSwitchCount: number;
  recurrenceCount: number;
  primaryDomain: string;   // display label only
  mergeEvidence?: string[];
  sequence?: string[];
  transitions?: ContextTransition[];
  excursions?: Excursion[];
  episodes?: ActivityEpisode[];
}
```

### Construction rule

Episodes are processed chronologically. The next episode joins the current context only when:

- the gap from the previous episode end is `<= 30 minutes`; **and**
- the merged context stays within a `90-minute` total-span cap; **and**
- episode-level merge evidence exists.

For trajectory-segmented episodes the boundary decision is final; a context does not re-merge them. Only fallback episodes (no raw trajectory) may merge via strong same-origin continuation or a coherent cross-domain transition chain. Same-tab alone never creates a context: a tab is a surface, not a task.

Context domains aggregate per-origin event counts from the context's own episodes (not whole sessions), sort by event count descending then first-seen ascending. `primaryDomain` is the first item in that evidence ordering and has no semantic meaning. `sequence`, `transitions`, and `excursions` are derived from the transition stream and are evidence-only.

### APIs

```ts
buildContexts(sessions, transitions?): BrowserContext[]
getContexts(db, start?, end?): Promise<BrowserContext[]>
getContextById(db, id): Promise<BrowserContext | undefined>
getRecentContexts(db, limit = 10): Promise<BrowserContext[]>
```

The recent-context API reads at most 500 recent sessions before building and slicing contexts.

---

## 9. Contexts to Memories

A `Memory` is a compact, evidence-backed representation of recurring behavioral patterns across episodes. It does not summarize user intent.

```ts
interface Memory {
  id: string; // a context id, or `${firstContextId}-${lastContextId}`
  kind: 'single' | 'recurrent';
  startTimestamp: number; endTimestamp: number;
  signature: string;                 // legacy diagnostic (top-6 domain signature)
  fingerprint: BehaviorFingerprint;  // the behavioral pattern
  sequence?: string[];
  occurrences: MemoryOccurrence[];
  contextIds: string[]; contextCount: number;
  firstContextId: string; lastContextId: string;
  totalSessionCount: number; totalEventCount: number;
  lastSeen: number; firstSeen: number; staleness: number;
  strength: number; confidence: number;
  evidence: {
    occurrenceCount: number;
    temporalSpreadMs: number;
    similarityScores: number[];
    sharedSequenceTokens: number;
    sharedDomains: number;
  };
  observation: string; // observed domain-based statement
  inference: null;
}
```

### Identity, qualification, and ranking

Identity is a behavioral fingerprint: weighted domains, ordered origins and transitions, entry/exit origins, and an interaction profile (duration, event density, navigation and interaction rates). Candidate contexts cluster when behavioral similarity is at least `0.65`.

Similarity combines token-level ordered-sequence edit distance, domain Jaccard, transition overlap, entry/exit agreement, and interaction-profile proximity. A strict domain superset is blocked from merging (`github+slack` is not `github+slack+jira`). Identical trails floor at `0.75` to survive reading-depth noise.

| Rule | Value |
|---|---:|
| recurrent occurrences | `>= 2` separate occurrences |
| single-occurrence minimum events | `500` |
| similarity merge threshold | `0.65` |
| recurrence minimum gap | `30 minutes` |
| legacy signature domain cap | `6` |
| stale after | `7 days` |
| returned memory cap | `50` |

Recurrence requires separate temporal occurrences at least 30 minutes apart; temporally-adjacent fragments of one visit fold into a single occurrence. Generic single-site activity (Google, ChatGPT, YouTube, new-tab) never qualifies. `strength = recurrenceEvidence × similarityConfidence × recencyFactor`. Stale memories are not deleted; consumers receive staleness and decide how to rank it. `observation` is an evidence summary (e.g. "Recurring sequence: github.com → slack.com, observed in 3 separate activity periods"); `inference` is always `null`.

### APIs

```ts
buildMemories(contexts, now?): Memory[]
getMemories(db, limit = 50): Promise<Memory[]>
getMemoryById(db, id): Promise<Memory | undefined>
getMemoriesBySignature(db, signature): Promise<Memory[]>
```

Memory APIs derive from no more than 500 recent contexts and return strength-ordered results.

---

## 10. Browser-context Retrieval

Retrieval makes the derived layer usable without interpreting raw events at query time. It is domain-based, evidence-first, bounded, and returns structured results rather than task claims.

### Result types

```ts
interface SimilarContextResult { context: BrowserContext; similarity: number; sharedDomains: string[]; }
interface SimilarMemoryResult { memory: Memory; similarity: number; sharedDomains: string[]; }
interface ContextSummary { context: BrowserContext; observation: string; domainList: string[]; eventDensity: number; }
interface RecurrenceReport { isRecurrent: boolean; memory?: Memory; similarMemories?: SimilarMemoryResult[]; }
interface TimelineEntry { context: BrowserContext; isRecurrent: boolean; memoryId?: string; }
interface DomainHistoryReport {
  domain: string; contexts: BrowserContext[]; memories: Memory[];
  totalEvents: number; firstSeen: number; lastSeen: number;
}
```

### Primitives

| Category | Functions | Behavior |
|---|---|---|
| Temporal | `getRecentActivity`, `getActivityToday`, `getActivityBetween` | Recent contexts are newest first; date/range reads return relevant derived contexts. |
| Domain | `getDomainsInContext`, `getContextsWithDomain`, `findMemoryBySignature`, `getMemoryHistoryForDomain` | Exact domain/signature access against bounded derived reads. |
| Similarity | `findSimilarContexts`, `findSimilarMemories` | Compares domain sets; excludes the target context itself. |
| Current context | `getCurrentContext`, `getPreviousContext`, `isDomainNovel`, `isSignatureRecurrent` | Supplies recent state, prior context, lookback novelty, and exact-signature recurrence. |
| Composites | `summarizeContext`, `reportRecurrence`, `getActivityTimeline`, `getDomainHistory` | Structured summaries, recurrence evidence, annotated timeline, and domain evidence history. |

Context similarity is Jaccard index over domain sets:

```text
jaccard(A, B) = |A intersection B| / |A union B|
```

Only values greater than zero are returned, results sort descending by similarity, and default query caps are five (three for recurrence's related-memory list). Jaccard returns `0` for two empty sets rather than `NaN`.

### Evidence signals, not confidence claims

Consumers receive similarity, memory strength, staleness, context event density, and session count. They decide what those signals mean. Thin contexts, stale memories, and weak partial overlap are never hidden or turned into an intent claim.

Retrieval derives at most 500 contexts and 50 memories. Similarity is consequently `O(500 * averageDomains)`, acceptable until measurement proves otherwise.

---

## 11. Live Browser Context

`LiveBrowserContext` is an on-demand snapshot that joins live event-stream state with the derived historical layer. It answers which browser context is currently observable, not what task the user is performing.

```ts
interface LiveBrowserContext {
  currentContext?: BrowserContext;
  activeTabId: number;
  activeWindowId: number;
  currentUrl?: string;
  interactionIntensity: number; // interactions per minute
  recentNavigations: string[];  // newest first
  relatedContexts: SimilarContextResult[];
  relatedMemories: SimilarMemoryResult[];
  evidence: { eventCount: number; sessionCount: number; staleness: number };
  computedAt: number;
}
```

### Snapshot semantics

- `currentContext`: most recent derived context, or `undefined` if there are no events.
- active tab/window: last `TAB_ACTIVATED`, defaulting to `0` if absent.
- current URL: last URL-bearing `NAVIGATION`, or `undefined` if absent.
- interaction intensity: `totalInteractionCount / (duration / 60000)`; zero for missing or zero-duration contexts.
- navigation sequence: URL-bearing navigations, newest first, default cap 10.
- related contexts/memories: top three retrieval similarity results, empty without a current context.
- evidence staleness: `now - currentContext.endTimestamp`, or zero if there is no context.

### APIs

```ts
buildLiveContext({ currentContext, events, relatedContexts, relatedMemories, now?, navigationLimit? }): LiveBrowserContext
getCurrentBrowserContext(db, navigationLimit = 10): Promise<LiveBrowserContext>
getLiveInteractionIntensity(db): Promise<number>
getLiveNavigationSequence(db, limit = 10): Promise<string[]>
```

`buildLiveContext` is the pure core. The database adapter gets the current context, all persisted events, and top-three related contexts/memories, then passes them into that pure core. No live-context table, real-time stream, or dashboard route is introduced before Phase 7 validates the snapshot's usefulness.

---

## 12. Validation and Engineering Checks

Each derivation core is deterministic and has a runnable Node assert check:

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
pnpm --filter shared run swSemantics swDerivation swGraph swEpisodes
pnpm --filter shared run swFirstSignal swCost swValidation
pnpm --filter extension build
pnpm --filter web build
```

The check scripts exercise the respective pure functions and rebuild consistency: the same events/sessions/contexts/memories and fixed clock must produce deep-equal output.

### Required behavioral coverage

- **Sessions:** continuous activity stays whole; inactivity, visibility, tab-return, and window boundaries split sensibly; empty/single-event streams work; rapid switching does not fragment; long reading remains low intensity.
- **Episodes:** a cross-domain research chain stays one episode; a short weak excursion stays one episode; a durable task switch splits; browser chrome does not produce a standalone episode; a long coherent activity has no duration cap.
- **Contexts:** adjacent episode evidence within 30 minutes groups; disjoint domains or longer gaps split; no transitive bridging; same-tab alone does not merge; empty and one-episode inputs work.
- **Memories:** reordered identical trails consolidate; strict domain supersets do not auto-consolidate; empty fingerprints create no memory; occurrences are preserved individually; recurrent patterns outrank one-off event blobs.
- **Retrieval:** today/range/domain filtering, exact recurrence, Jaccard ranking, previous context, novelty, timeline, domain history, and empty inputs work.
- **Live context:** active tab/window and current URL select latest matching events; navigation cap/order, related items, staleness, low intensity, absent data, and rebuild consistency work.

### Deferred only after measurement

Do not add derived IndexedDB tables, full event-cache indexes, derived dashboard routes, popup messages, semantic enrichment, or new telemetry merely for convenience. Add them only if Phase 7 demonstrates a concrete need.

---

## 13. Phase 7 Decision Gate

Before adding any AI capability, evaluate representative real and constructed browsing scenarios:

1. session quality and explainable boundaries;
2. episode and context coherence and separation;
3. memory usefulness and evidence traceability;
4. historical retrieval relevance;
5. live-context stability as browsing changes;
6. ambiguous behavior: rapid switching, long reading, unrelated tasks in one window, the same site used differently, task return after hours, and many dormant tabs.

The required decision is:

> **Does sparse browser telemetry provide enough signal to represent useful user context?**

If yes, identify the strongest evidence-grounded signals before preparing an agent consumer. If no, identify the minimum additional metadata required and why; do not expand collection simply because data is available.

A future Tabot agent must consume:

```text
Current Browser Context + Relevant Browser Memories + Supporting Evidence
```

rather than raw event history.

---

## 14. Constraints and Out of Scope

1. Background service worker is the sole SAB producer; content scripts never write shared memory.
2. SAB contains only fixed-size numeric fields; URLs/titles remain in the sidecar.
3. IndexedDB persists raw normalized events in batches; derived data is lazy and rebuildable.
4. Dashboard and popup do not render raw event streams; they show aggregates plus derived views.
5. Derived output never names a task, intent, or content meaning.
6. There is no cloud/backend/authentication/multi-user path.
7. No LLM, embeddings, semantic search, vector database, cross-device identity, content capture, predictive context, or automation is implemented.
8. Optional persistence caches, derived UI routes, and derived runtime messages require Phase 7 evidence first.

---

## 15. Service Worker Telemetry (Phase 2 final)

Phase 2 ran a Service Worker (SW) telemetry experiment and concluded **KEEP WITH REDUCTION**: one SW signal survives, four were retired, the `downloads` permission was removed. Raw events remain the source of truth; SW rows flow through the exact same SAB → Dexie → pure-derivation path as Phase 1 events.

### Semantic classification (single derivation gate)

The classifier in `sw-semantics.ts` assigns every event one class; every behavioral layer consults it before using an event:

| Class | Effect |
|---|---|
| `behavioral` | may contribute to sessions/episodes/contexts/memories as evidence |
| `contextual` | shapes interpretation of *other* events (continuity) but is not itself activity |
| `diagnostic` | invisible to derivation; engineering only — the firewall rule |

Final taxonomy:

| Event | Class | Produced? | Effect |
|---|---|---|---|
| `SW_WINDOW_FOCUS` | contextual | **yes** | graph continuity evidence only |
| `SW_POPUP_OPEN` | diagnostic | no (historical rows decode) | none |
| `SW_TRACKING_TOGGLE` | diagnostic | no | none |
| `SW_DOWNLOAD` | diagnostic | no | none |
| `SW_LIFECYCLE` | diagnostic | no | none |

Retired types are **deterministically** ignored — classification is hardcoded, not runtime-configurable. Enum indices 10–14 and the buffer decode branches are kept so persisted historical rows still decode, then are excluded by the same classifier. Producer (`background.ts`) emits only `SW_WINDOW_FOCUS`.

### `SW_WINDOW_FOCUS` semantics

- Source: `chrome.windows.onFocusChanged`; requires `windows` permission. `windowId = -1` is the no-window sentinel; `previousWindowId` goes in SAB slot 3.
- **Session layer:** `sessionize` skips it entirely. It cannot open, extend, merge, or split a session; it never updates activity clocks; a focus-only trace yields 0 sessions.
- **Meaningful events:** classified contextual; never forms a transition (no URL).
- **Graph layer:** `applyFocusContinuity` (in `sw-graph.ts`) may only **decorate an existing same-session edge** with a strengthened weight when a causal focus sandwich is present (departure w→x, return x→w chained via `previousWindowId` inside the anchor span). Chains where `previousWindowId === -1`/`WINDOW_ID_NONE` are excluded (focus loss/regain is not an excursion return). SW adds zero nodes/edges/counts.
- **Episode layer:** no SW terms in the boundary scorer — no focus boost; evidence is a causal record only.

Measured on real browsing: SW telemetry adds **0** sessions, anchors, graph edges, episodes, contexts, memories; only graph evidence counts change where genuine cross-window continuity occurred. Cost (from `sw-cost.check.ts`): SW ratio far under the 30% acceptance ceiling; SW derivation cost within measurement noise.

### SW checks

```bash
pnpm --filter shared run swSemantics    # taxonomy + firewall classification
pnpm --filter shared run swDerivation   # Pipeline A vs B: SW-invariance of derived layers
pnpm --filter shared run swGraph        # focus-continuity evidence rules (-1 chains excluded)
pnpm --filter shared run swEpisodes     # focus changes NO episode boundary; focus-only burst -> 0
pnpm --filter shared run swFirstSignal  # per-signal decision audit
pnpm --filter shared run swCost         # noise + storage + CPU vs Phase 1
pnpm --filter shared run swValidation   # encode -> decode roundtrip, noise-bounded popup
pnpm --filter shared run swRealReport   # real trace: Phase 1 vs Phase 2 report (needs trace.json)
```

Schema/encode detail survives in `docs/sw-schema.md`. The Step 11 report's episode-merge claims were superseded: the corrected final semantics is that focus changes **no** session or episode boundary.

---

## 16. History

- `2026-08-22` - Consolidated initial collection, SAB, Dexie, and dashboard documentation into `tech.md`.
- `2026-08-24` - Added the implemented deterministic derived layer: sessions, contexts, memories, retrieval, and live browser context; merged metrics into this document and retired split specification files.
- `2026-08-28` - Rewrote the derived-layer sections to match the V6/V7 implementation: added the meaningful-event, activity-anchor, activity-graph, and episode stages; contexts are now built from episodes with trajectory-coherence segmentation; memories use behavioral fingerprints rather than exact domain signatures; sessions retain full event sequences; added a companion `system.md` walkthrough.
- `2026-09-13` - Synthesized the Phase 2 SW experiment into §15 (KEEP WITH REDUCTION): `SW_WINDOW_FOCUS` retained as the only SW signal; popup/toggle/download/lifecycle retired to diagnostic; `downloads` permission dropped; retired `docs/sw-events.md`, `docs/sw-inventory.md`, `docs/sw-phase.md`, `docs/sw-step11-report.md` folded in here and `system.md`.
