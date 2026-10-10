# Tabot Technical Specification

> **Technical source of truth for Tabot's architecture and deterministic derived layer.** Supersedes the earlier split specifications (`metrics.md`, `sessions-spec.md`, `contexts-spec.md`, `memories-spec.md`, `retrieval-spec.md`, `liveContext-spec.md`) and incorporates the former v0.2 product plan with [`system.md`](./system.md). Audited against working-tree code, including staged changes, on 2026-10-09. Implementation, deployment and live acceptance are separate statuses. Release gaps and acceptance are documented below and in the companion walkthrough.

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

Raw browser events remain local. The ChatGPT integration uses Tabot’s online MCP/OAuth connection service for authorization and request routing; the extension runs each tool against its local data and returns a sanitized, bounded result (such as a browser context, recurring-pattern evidence, or activity metrics) to ChatGPT when requested. The service stores OAuth/installation state, not browser history or tool results. There is no Tabot-hosted LLM, embeddings, vector database, productivity scoring, or semantic task inference. See [MCP relay setup and troubleshooting](../apps/mcp-server/README.md).

### Architectural principles

1. **Raw events are immutable source data.** Every derived object is disposable and rebuildable.
2. **No semantic claims from sparse telemetry.** The system may report domains, timestamps, counts, overlaps, recurrences, and similarity scores; it must not assert what a user was doing.
3. **No new telemetry for the derived layer.** Use the existing event stream until Phase 7 evaluates whether it is sufficient.
4. **Deterministic, with bounded results.** Same input and supplied clock produce the same output. Result counts/payloads have caps, but several local derivations scan the full retained event store; output bounds are not input-cost bounds.
5. **Evidence first.** Derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them.

### Privacy boundary

`KEY_ACTIVITY` records only that activity happened, never typed text, key values, characters or form/input values. Tabot does not capture password fields, DOM snapshots or page content. Raw URL sidecars can contain paths/query values and remain local; authorized tool results and user-controlled downloads are separate privacy boundaries. Sanitized derived results **do leave the device** when requested through ChatGPT (§16); “local-first” does not mean no network traffic or no sharing.

---

## 2. Stack and Repository

- **Extension:** Plasmo, Manifest V3, Chrome target, background service worker.
- **Dashboard:** TanStack Start + Vite/Nitro, React 19, Tailwind and local UI components; `react-force-graph-2d` for activity maps and `react-call` for session inspection. Marketing routes are prerendered; browser data is fetched/derived client-side. TanStack Charts is not a current package dependency.
- **Language/package manager:** TypeScript (ESNext, bundler resolution), pnpm workspaces.
- **Concurrency:** `SharedArrayBuffer` and `Atomics` using `Int32Array`.
- **Rate shaping:** TanStack Pacer at the content-script boundary.
- **Persistence:** Dexie 4.x over IndexedDB database `tabot_events`, `events` table.
- **Graph substrate:** graphology.
- **Optional relay:** Hono + MCP SDK on Cloudflare Workers, Durable Objects for OAuth/installation state, authenticated WebSocket to the extension. No remote browser-history store.

```text
tabot/
├── apps/
│   ├── extension/
│   │   ├── background.ts                # event producer, SAB drain, Dexie, messaging
│   │   ├── contents/tabot.ts            # page-level telemetry collection
│   │   ├── popup.tsx                    # activity recap, progress, new-summary CTA
│   │   ├── popup-model.ts, notification-model.ts
│   │   ├── foreground.ts               # focused/idle-aware sampling
│   │   └── relay.ts                    # authenticated WebSocket + local tool handlers
│   ├── mcp-server/                      # optional ChatGPT MCP/OAuth relay
│   └── web/
│       ├── src/routes/                  # landing + dashboard routes
│       ├── src/lib/home-data.ts         # extension transport + in-memory derivation
│       └── src/components/              # landing, dashboard, and UI components
├── packages/shared/src/
│   ├── events/                         # buffer, protocol, metadata, Dexie, event registry
│   ├── sessions/                       # sessionization
│   ├── activities/                     # anchors, episodes, foreground, metrics, SW semantics
│   ├── contexts/, memories/, recall/    # derivation, retrieval and live snapshot
│   ├── privacy/                        # fail-closed local PII sanitizer
│   ├── share/                          # export and scoped assistant prompts
│   ├── lib/                            # shared logging/utilities
│   └── checks/                         # runnable deterministic checks
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
  favicon?: string;  // local visual sidecar; stripped by sanitized export/tool projections
  metadata?: { x?: number; y?: number; scrollY?: number; previousWindowId?: number; enabled?: boolean; state?: number };
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

`StatsSnapshot` is an internal engineering/transport-health contract. Popup and dashboard also fetch persisted events for local derivation; presentational components do not render the raw stream. Raw event totals must not appear as user-facing activity/action/visit counts, per [PRODUCT.md](../PRODUCT.md).

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

`GET_COUNTS` obtains the authoritative persisted count through `db.events.count()` for internal diagnostics. Current popup uses a plain recording-loss message when `droppedEvents > 0`; it does not present pipeline-counter panels or buffer occupancy/peak as primary product UI. Sites, observed time, sessions and recurrence are the product-facing evidence.

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
- Recent-context helpers cap selected sessions at 500; memory database adapters use up to 500 resulting contexts and default to 50 returned memories. Pure `derive()`/`buildMemories()` and full-context lookup are not globally capped to those counts. These caps do not prevent full event-store scans. Add persistence caches only after measurement demonstrates a need.

---

## 6. Events to Sessions

A `Session` is a coherent continuous period of browser activity. It describes what occurred, not the user's task.

```ts
interface Session {
  id: string; // `${startTimestamp}-${endTimestamp}-${activeTabId}`
  startTimestamp: number;
  endTimestamp: number;
  duration: number; // foreground milliseconds
  wallDuration?: number; // elapsed milliseconds, including gaps
  activeSpans?: { start: number; end: number }[];
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

### Foreground time (derivation schema 9)

`foregroundEvents` is shared by session and transition derivation. It excludes background-tab activity, tab creation/removal, and redundant title/loading updates. A genuine URL change on the foreground tab remains evidence. Browser focus loss suppresses activity until focus returns; a selected tab in an unfocused window is not foreground.

Capture samples the selected tab in the focused, non-minimized window every 30 seconds using `chrome.alarms`. Focus/tab/idle transitions also trigger samples. `chrome.idle` stops sampling after 60 seconds without system input or on lock. The last observation lives in `chrome.storage.session`, surviving service-worker restarts. A sample delayed more than 90 seconds closes the previous span at its last observation, never at wake time. No page text or input values are collected.

`duration` in sessions, episodes, and contexts is foreground time, summed from non-overlapping observed intervals. Hidden/idle time and gaps between sessions are excluded even when one episode groups several sessions. `wallDuration` retains elapsed coverage, not time spent. Each page owns foreground dwell until the next page switch, without changing the last-event timestamps used by trajectory scoring.

Historical rows are re-derived locally; no IndexedDB migration or deletion is needed. Old traces lack periodic samples and sometimes focus/visibility evidence: duration remains an estimate, never extrapolated to now or across event gaps of five minutes or longer. Existing downloaded exports must be generated again to receive corrected durations; missing historical attention cannot be reconstructed exactly.

Checks: `pnpm --filter @tabot/shared check:foreground` and `pnpm --filter extension check:foreground`.

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
| default `getMemories` result cap | `50`; explicit limit may differ, pure `buildMemories` is uncapped |

Recurrence requires separate temporal occurrences at least 30 minutes apart; temporally-adjacent fragments of one visit fold into a single occurrence. Generic single-site activity (Google, ChatGPT, YouTube, new-tab) never qualifies. `strength = recurrenceEvidence × similarityConfidence × recencyFactor`. Stale memories are not deleted; consumers receive staleness and decide how to rank it. `observation` is an evidence summary (e.g. "Recurring sequence: github.com → slack.com, observed in 3 separate activity periods"); `inference` is always `null`.

### APIs

```ts
buildMemories(contexts, now?): Memory[]
getMemories(db, limit = 50): Promise<Memory[]>
getMemoryById(db, id): Promise<Memory | undefined>
getMemoriesBySignature(db, signature): Promise<Memory[]>
```

Memory database APIs derive from up to 500 recent contexts built from up to 500 recent sessions and return strength-ordered results. `getRecentSessions` sessionizes the full stored event array before slicing, so this is a candidate/result bound, not an indexed bounded event read.

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

Consumers receive similarity, memory strength, staleness, context event density, and session count. They decide what those signals mean. Local retrieval helpers do not convert thin contexts, stale memories or weak overlap into intent claims. The separate MCP discovery layer hides non-AI-ready contexts; explicit `get_context(id)` can still retrieve one (§16).

Individual similarity helpers typically compare selected recent-context/memory candidates; their comparison cost is linear in candidates times average domains. Full history reads and derivation precede several adapters. MCP context discovery/lookup derives the full history before selecting results, while memory adapters use the recent-session/context caps above. Do not describe all retrieval as a bounded 500-context database read.

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

`buildLiveContext` is the pure core. The database adapter gets the current context, all persisted events, and top-three related contexts/memories, then passes them into that pure core. No live-context table or dedicated live-snapshot route exists. The snapshot is already included in local `derive()`/export; the shipped dashboard has separate derived activity/pattern routes. MCP `get_current_context` projects the latest ready context, not the entire `LiveBrowserContext` object.

---

## 12. Validation and Engineering Checks

Each derivation core is deterministic and has a runnable Node assert check:

```bash
pnpm lint
pnpm --filter @tabot/shared check:sessions
pnpm --filter @tabot/shared check:meaningfulEvents
pnpm --filter @tabot/shared check:activityGraph
pnpm --filter @tabot/shared check:contexts
pnpm --filter @tabot/shared check:stabilization
pnpm --filter @tabot/shared check:memories
pnpm --filter @tabot/shared check:retrieval
pnpm --filter @tabot/shared check:privacy
pnpm --filter @tabot/shared check:activityMetrics
pnpm --filter @tabot/shared check:liveContext
pnpm --filter @tabot/shared check:pipeline
pnpm --filter @tabot/shared check:v5regression
pnpm --filter @tabot/shared check:bufferRoundtrip
pnpm --filter @tabot/shared run swSemantics
pnpm --filter @tabot/shared run swDerivation
pnpm --filter @tabot/shared run swGraph
pnpm --filter @tabot/shared run swEpisodes
pnpm --filter @tabot/shared run swFirstSignal
pnpm --filter @tabot/shared run swCost
pnpm --filter @tabot/shared run swValidation
pnpm --filter extension check:popup
pnpm --filter extension check:notifications
pnpm --filter extension check:metricsRelay
pnpm --filter mcp-server check:activityMetrics
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

Do not add derived IndexedDB tables, event caches/indexes, semantic enrichment or additional telemetry merely for convenience. Existing dashboard routes, popup messages and assistant handlers are already implemented; the evidence gate is a requirement for expanding capabilities, not a claim that those surfaces are absent.

---

## 13. Phase 7 Decision Gate

For the existing ChatGPT MCP integration and any future AI-facing changes, evaluate representative real and constructed browsing scenarios:

1. session quality and explainable boundaries;
2. episode and context coherence and separation;
3. memory usefulness and evidence traceability;
4. historical retrieval relevance;
5. live-context stability as browsing changes;
6. ambiguous behavior: rapid switching, long reading, unrelated tasks in one window, the same site used differently, task return after hours, and many dormant tabs.

The required decision is:

> **Does sparse browser telemetry provide enough signal to represent useful user context?**

If yes, retain the strongest evidence-grounded signals in tool results. If no, identify the minimum additional metadata required and why; do not expand collection simply because data is available.

The current ChatGPT integration serves requested, sanitized activity summaries, bounded recurring-pattern evidence and origin-only metrics (§16), not raw history or the whole live snapshot. Sessions are inspectable locally but have no dedicated MCP tool. Source inspection and deterministic checks do not establish representative real-browsing usefulness; this evaluation remains open.

---

## 14. Constraints and Out of Scope

1. Background service worker is the sole SAB producer; content scripts never write shared memory.
2. SAB contains only fixed-size numeric fields; URLs/titles remain in the sidecar.
3. IndexedDB persists raw normalized events in batches; derived data is lazy and rebuildable.
4. Dashboard and popup do not render raw event streams; they show aggregates plus derived views.
5. Derived output never names a task, intent, or content meaning.
6. The optional Cloudflare relay authenticates ChatGPT requests and routes them to the user's live extension; it does not store raw events or derived browser history. There is no Tabot account, cloud sync, or multi-user history store.
7. No Tabot-hosted LLM, embeddings, vector database, cross-device identity, content capture, predictive context, or automation is implemented. Local text search over derived contexts is available through MCP.
8. Additional persistence caches, collection or semantic capabilities require demonstrated need. Existing derived UI routes/runtime messages are current code, not deferred work.

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
- **Session layer:** a focus row cannot itself open a session or reset its inactivity clock; a focus-only trace yields 0 sessions. The foreground prefilter uses focus state to reject activity in unfocused windows and close observed dwell. Correcting previously admitted background activity can change derived sessions; focus regain alone never proves continued work.
- **Meaningful events:** classified contextual; never forms a transition (no URL).
- **Graph layer:** `applyFocusContinuity` (in `sw-graph.ts`) may only **decorate an existing same-session edge** with a strengthened weight when a causal focus sandwich is present (departure w→x, return x→w chained via `previousWindowId` inside the anchor span). Chains where `previousWindowId === -1`/`WINDOW_ID_NONE` are excluded (focus loss/regain is not an excursion return). SW adds zero nodes/edges/counts.
- **Episode layer:** no SW terms in the boundary scorer — no focus boost; evidence is a causal record only.

Historical Phase 2 measurement (before schema 9 foreground filtering): SW telemetry added **0** sessions, anchors, graph edges, episodes, contexts, memories; only graph evidence counts changed where genuine cross-window continuity occurred. Cost (from `sw-cost.check.ts`): SW ratio far under the 30% acceptance ceiling; SW derivation cost within measurement noise.

### SW checks

```bash
pnpm --filter @tabot/shared run swSemantics    # taxonomy + firewall classification
pnpm --filter @tabot/shared run swDerivation   # Pipeline A vs B comparison
pnpm --filter @tabot/shared run swGraph        # focus continuity (-1 chains excluded)
pnpm --filter @tabot/shared run swEpisodes     # focus-only burst -> 0 sessions
pnpm --filter @tabot/shared run swFirstSignal  # per-signal decision audit
pnpm --filter @tabot/shared run swCost         # noise + storage + CPU
pnpm --filter @tabot/shared run swValidation   # encode -> decode roundtrip
pnpm --filter @tabot/shared run swRealReport   # requires a supplied real trace
```

Schema/encode detail survives in `docs/sw-schema.md`. Focus adds no behavioral events or scoring boost; schema 9 additionally uses its browser state to exclude background evidence.

---

## 16. ChatGPT MCP/OAuth Relay — Implemented Contract

### Roles and configuration

The extension owns raw browser records, local queries, derivation and safe result projection. The Cloudflare Worker owns OAuth and routing; ChatGPT owns reasoning. There is no Tabot-hosted AI, account system, remote history database or native companion.

```text
ChatGPT -- OAuth access token --> POST /mcp
  -> token-bound installation Durable Object
  -> authenticated outbound extension WebSocket
  -> local Dexie / shared derivation / sanitization or aggregate projection
  -> correlated bounded result -> ChatGPT
```

Production configuration targets `https://tabot-mcp.shanvit7.workers.dev/mcp`; development targets `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`. Extension `PLASMO_PUBLIC_MCP_RELAY_URL` uses the matching origin, without `/mcp`; `PLASMO_PUBLIC_HOME_URL` controls dashboard links. `TABOT_AUTH_SECRET`, `TABOT_EXTENSION_ID` and dashboard `VITE_TABOT_EXTENSION_ID` must match their environment. `wrangler.toml` and `wrangler.dev.toml` use separate Workers/Durable Objects/secrets. These are configured targets, not evidence that production has the current source or seven discovered tools.

`pnpm dev` invokes the MCP source watcher, which **deploys to the dev Worker on startup/change**; it is not a localhost tunnel or a harmless offline check. `dev:local` runs Wrangler locally and cannot serve ChatGPT without a public route. No custom `mcp.tabot.ai` domain/named tunnel is configured in the documented setup. Operational commands live in the [relay README](../apps/mcp-server/README.md); production deploy requires explicit approval.

### Installation and OAuth

- Background startup calls `startRelay()` even before ChatGPT consent. Missing credentials trigger unauthenticated `POST /installations`, issuing a random installation ID and signed **365-day** credential. Registration contains no browsing record; the ID alone is not authorization.
- Credentials persist in `chrome.storage.local`, separately for dev/production. Saved invalid/expired credentials fail closed rather than silently replacing the installation. Automatic installation-credential renewal/repair UI is not implemented; rotation of this credential is different from OAuth refresh-token rotation.
- Extension connects to `/relay`, passing the signed bearer credential as its WebSocket subprotocol, not a URL query parameter. One installation Durable Object retains one live socket and in-memory pending calls, not browser-history/tool-result storage.
- Worker implements OAuth discovery, dynamic client registration, authorization-code + PKCE S256, token refresh and revocation. Registered redirects are HTTPS or loopback HTTP. Consent must run in the same Chrome profile as the configured extension.
- A **5-minute**, single-use authorization transaction binds client, redirect, PKCE challenge, state and optional resource. The consent page sends `TABOT_APPROVE_AUTHORIZATION`; the extension proves its installation directly to the Worker. Page JavaScript never receives the installation credential. Only an approved transaction can issue a **5-minute**, single-use authorization code.
- One auth Durable Object stores client registrations, hashed codes/access/refresh tokens and authorization transactions. Access lasts **1 hour**; refresh lasts **30 days** and rotates on use. Advertised scope is `tabot.context`. `/mcp` routes by verified token installation binding, never caller-provided installation ID.
- Revocation deletes the presented token, not every sibling token/client registration. Revoking refresh does not automatically erase an already-issued access token; registrations have no expiry/self-service deletion. No cross-device pairing, account login or guaranteed complete connection erasure is provided.

### Seven read-only tools

Tool names are protocol contracts, not product labels. Every tool advertises `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

| Tool / arguments | Implemented selection and limits |
| --- | --- |
| `search_context({ query, hours? })` | Query 1–200 characters; optional integer 1–168 hours. Local domain/sequence token-substring matching over ready contexts; maximum 8 results. No semantic/content search. |
| `get_recent_context({ hours })` | Required integer 1–168 hours; time-overlapping ready contexts, maximum 20. Source is derived before range selection. |
| `get_current_context({})` | Most recent ready context overlapping the last 24 hours; no real-time/task guarantee, missing returns `found: false`. |
| `get_context({ id })` | ID 1–256 characters; one exact context, including non-ready. Missing returns `found: false`, never an unscoped history dump. |
| `list_recurring_patterns({ limit? })` | Integer 1–20, default 10. Recurrent-only filtering before limiting; newest first. Up to 500 recent contexts from up to 500 recent sessions; scope/truncation reported. |
| `get_memory({ id })` | ID 1–256 characters; one pattern from the recent-context scope, or `found: false`. Origin-only supporting occurrences and real `get_context` IDs. |
| `get_activity_metrics({ from, to, origin? })` | Safe integer Unix milliseconds with `0 <= from < to <= now`; `[from,to)`, `from: 0` means retained history. Optional exact HTTP(S) origin, max 256 characters, with no credentials/path/query/fragment/trailing slash. Validated again locally. |

Server is `apps/mcp-server/src/index.ts`; schemas/constants are in `src/schema/tools.schema.ts` and `src/lib/`; extension dispatch/projections are in `apps/extension/relay.ts`. Tools return one JSON text content block; relay failures become MCP `isError` results. `get_session` and `get_page_context` do not exist. Local `LiveBrowserContext` APIs are not directly exposed by MCP.

Context IDs are derived, not durable database handles: changed source/algorithms and recent-memory scope can make a previously selected ID unavailable. Context discovery can include a still-growing ready summary; only notifications impose the settlement delay. Full-history lookup/discovery avoids IDs changed merely by slicing raw input, but still performs full local derivation and may exceed latency at scale. No pagination/cache/indexing guarantee is implied.

### Result privacy, bounds and time semantics

Context/memory paths call `sanitizeDerived` and allowlist projected fields. Metrics return structurally restricted HTTP(S) origins and aggregates without a raw-row export. Session/occurrence/visit counts are meaningful summaries; raw event/interaction totals remain internal and are absent from current external projections. Paths, queries, credentials, favicons, event sequences and page contents are not tool result fields. Origins/subdomains are intentionally visible, including potentially identifying enterprise hosts.

Default PII protection uses local OpenRedaction with selected email, phone, credit-card and IBAN patterns. Known textual fields are rewritten in a copy; source events are untouched. Detector failure aborts the context/memory/export result rather than exposing unredacted data. This is covered-pattern protection, not universal names/username/password/token detection. Manual JSONL download can include sanitized event rows and URL structure and is **not equivalent to MCP projection**; it never uploads itself. Never log browsing payloads, raw URLs, page titles, memory text or full responses. Worker application storage does not retain tool results; Cloudflare/OpenAI processing remains a separate privacy boundary.

| Result | Bounds |
| --- | --- |
| Context discovery | 8 search / 20 recent results; exact lookup selects one. Domain payload is not uniformly trimmed to a 60k budget. |
| Pattern list/evidence | 60,000-character budget with truncation; observation max 2,000 characters, up to 20 recent occurrences, 20 domains, 50 origins per sequence, 100 overall supporting IDs and 20 per occurrence. |
| Metrics | 60,000-character budget, up to 50 sites and 100 transition pairs; whole-period totals include omitted rows. Site filter applies after attribution and can find a site outside the unfiltered top 50. |
| Relay | 64,000-character response-frame limit; 10-second correlated-request timeout; offline/disconnect errors rather than stored-history fallback. |

Metric browsing time is estimated from consecutive observations, capped at **5 minutes per gap**, with no extrapolation after the last observation. Session/context duration uses foreground spans (§6); the two algorithms are not interchangeable attention measures. Fingerprint/occurrence sequences preserve derived first-occurrence ordering, not complete navigation replay; confidence is heuristic similarity, not probability of intent. Empty results mean no retained matching evidence, not proof of no activity/routines.

### Lifecycle and verification boundary

Extension heartbeats every **25 seconds**; reconnect doubles from **1 second** up to **60 seconds**, plus jitter. Chrome must remain open with the extension connected. `/health` proves Worker reachability only. `GET_ASSISTANT_CONNECTION` asks authenticated `/connection` for existing unexpired OAuth grants; no credential reaches dashboard JavaScript. **Connected does not prove a live relay socket, tool discovery or successful ChatGPT retrieval.** Unknown/checking/disconnected states remain distinct.

After Worker tool/schema/auth changes, deploy the intended environment explicitly and refresh ChatGPT discovery. Existing access/refresh grants can still represent a connection to older deployed code. Non-technical UI currently links to the ChatGPT Plugins search page, while documented dev setup requires Developer mode/manual URL entry; production onboarding and actual prompt-prefill/selected-ID retrieval remain unverified.

## 17. Readiness, Product Surfaces and Release Gate

Readiness is deterministic: `duration >= 10 minutes` AND `totalEventCount >= 10` AND (`domainCount >= 2` OR `sessionCount >= 2` OR `totalInteractionCount >= 5`). Shared core is `isAiReadyEvidence`; context and episode wrappers reuse it. It gates MCP discovery and popup readiness, **not** exact-ID access or a claim that a topic/intent is known.

Notifications in `background.ts` use a **15-minute Chrome alarm**, settled **30-minute**-old candidates, **24-hour** freshness, persisted context/memory high-water marks and **6-hour** cooldown. They are tracking-enabled only. First initialization seeds “seen” timestamps to now; no historical backfill. Selection compares ready contexts and newly seen recurrent memories; a qualifying episode inside the selected context can refine wording, not independently trigger notification. The selected summary/memory ID and connection state are saved with the notification. Click opens Home; button opens a scoped ChatGPT prompt or connection using that saved state. No dedicated Chrome startup reminder exists.

Home maps and session inspection, Activities range/site metrics, recurring-pattern discovery/actions, popup new-summary counts and session-count progress are implemented. Inspector mounts one `react-call` root, projects aggregate session evidence, separates browser/extension sources and shows no event counters or technical footer. The explicit shared-gate readiness indicator on Home is **absent**. At least notification and relay fallback wording still needs alignment with PRODUCT.md’s **activity/activity summary** vocabulary. Use internal `context` names only for contracts, not UI labels.

The old plan’s fake topic labels, event-count examples, new-memory popup counts and deterministic “first memory forming” progress are not implementation requirements. Local review remains primary and ChatGPT optional; no extra providers, centralized history, semantic inference, universal PII detector, native app or telemetry rewrite is needed. Preserve meaningful sparse re-engagement, honest empty states, privacy-first selected retrieval and evidence before interpretation.

The extension's prepared manifest version is **0.2.0**; MCP package/protocol is **0.2.0**. The extension package baseline remains **0.1.3** until Changesets creates the Version Packages PR, which will apply the minor bump to **0.2.0**. Local builds do not prove a store release or live deployment; use the existing Changesets/release PR workflow and approve deployment explicitly.

Release requires normal-user connection without MCP setup, real browsing/readiness/notification calibration, useful evidence-grounded ChatGPT results, production ID/origin/base-path/tool-version agreement, offline/restart/credential acceptance, remaining first-run notification guidance and a decision/implementation for startup reminder. See [system.md → status and acceptance](./system.md#v02-status-and-acceptance). Measure first useful activity → review → authorized assistant use → return, not raw collection volume. No implemented product-loop analytics is claimed.

**Audit evidence:** seven existing non-UI logic/relay checks passed on 2026-10-09: shared retrieval, privacy and activity metrics; extension popup model, notification model and metrics relay; server activity-metrics/MCP checks. They use constructed/mocked data and do not validate production ChatGPT. No UI tests/previews/browser automation, live consent/retrieval, production deployment or complete release acceptance was performed during this audit. UI review belongs to the user.

---

## 18. History

- `2026-08-22` - Consolidated initial collection, SAB, Dexie, and dashboard documentation into `tech.md`.
- `2026-08-24` - Added the implemented deterministic derived layer: sessions, contexts, memories, retrieval, and live browser context; merged metrics into this document and retired split specification files.
- `2026-08-28` - Rewrote the derived-layer sections to match the V6/V7 implementation: added the meaningful-event, activity-anchor, activity-graph, and episode stages; contexts are now built from episodes with trajectory-coherence segmentation; memories use behavioral fingerprints rather than exact domain signatures; sessions retain full event sequences; added a companion `system.md` walkthrough.
- `2026-09-13` - Synthesized the Phase 2 SW experiment into §15 (KEEP WITH REDUCTION): `SW_WINDOW_FOCUS` retained as the only SW signal; popup/toggle/download/lifecycle retired to diagnostic; `downloads` permission dropped; retired `docs/sw-events.md`, `docs/sw-inventory.md`, `docs/sw-phase.md`, `docs/sw-step11-report.md` folded in here and `system.md`.
- `2026-10-09` - Audited and absorbed the v0.2 product plan into this specification and `system.md`; documented all seven MCP tools, actual OAuth/relay/privacy/readiness contracts and current UI behavior. Corrected stale package paths, result-vs-read bounds and deferred-surface claims. Kept production/live acceptance and absent features separate from implementation; retired the standalone plan.
