# Tabot - Technical Specification

> **Single source of truth for Tabot's technical architecture and deterministic browser-context layer.** This document supersedes `metrics.md`, `sessions-spec.md`, `contexts-spec.md`, `memories-spec.md`, `retrieval-spec.md`, and `liveContext-spec.md`.
>
> `plan-phase-2.md` remains the high-level roadmap and Phase 7 decision gate. When it conflicts with this document on implemented behavior, this document wins.

---

## 1. Product Boundary

Tabot is an engineering prototype: a Chrome extension and local web dashboard that collect browser activity at volume, retain it locally, and deterministically derive browser context.

```text
Chrome extension
  -> normalized browser events
  -> SharedArrayBuffer ring buffer + Atomics
  -> background drain, bounded batching, Dexie / IndexedDB
  -> Sessions -> Contexts -> Memories -> Retrieval
  -> Live browser-context snapshot
```

All data remains local. There is no backend, authentication, cloud storage, remote ingestion, LLM, embeddings, vector database, productivity scoring, or semantic task inference.

### Architectural principles

1. **Raw events are immutable source data.** Every derived object is disposable and rebuildable.
2. **No semantic claims from sparse telemetry.** The system may report domains, timestamps, counts, overlaps, recurrences, and similarity scores; it must not assert what a user was doing.
3. **No new telemetry for the derived layer.** Use the existing event stream until Phase 7 evaluates whether it is sufficient.
4. **Deterministic and bounded.** Same input produces the same output, and all derived/retrieval reads have practical caps.
5. **Evidence first.** Derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them.

### Privacy boundary

`KEY_ACTIVITY` records only that a key activity occurrence happened. Tabot never records typed text, key values, characters, input values, passwords, DOM snapshots, page content, or browsing data outside local IndexedDB.

---

## 2. Stack and Repository

- **Extension:** Plasmo, Manifest V3, Chrome target, background service worker.
- **Dashboard:** TanStack Start, React 19, Tailwind, TanStack Charts, BoldKit UI.
- **Language/package manager:** TypeScript (ESNext, bundler resolution), pnpm workspaces.
- **Concurrency:** `SharedArrayBuffer` and `Atomics` using `Int32Array`.
- **Rate shaping:** TanStack Pacer at the content-script boundary.
- **Persistence:** Dexie 4.x over IndexedDB database `tabot_events`, `events` table.
- **Backend:** none.

```text
tabot/
├── apps/
│   ├── extension/
│   │   ├── background.ts                # event producer, SAB drain, Dexie, messaging
│   │   ├── contents/tabot.ts            # page-level telemetry collection
│   │   └── popup.tsx                    # aggregate pipeline statistics
│   └── web/
│       └── src/routes/                  # dashboard
├── packages/shared/src/
│   ├── events.ts, buffer.ts, protocol.ts, metadata.ts, db.ts, logger.ts
│   ├── sessions.ts, contexts.ts, memories.ts, retrieval.ts, live-context.ts
│   └── *.check.ts                       # runnable derivation checks
├── docs/tech.md                         # this document
└── docs/plan-phase-2.md                 # roadmap and evaluation gate
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
- `SCROLL` observes `window` plus nested elements with `overflow-y: auto|scroll` and `scrollHeight > clientHeight`. Viewport offset is `documentElement.scrollTop` with the document body as fallback.
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

The UI also obtains the authoritative persisted count through `db.events.count()`. It must show dropped events and buffer occupancy/peak, not only processed totals.

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

MV3 service workers cannot use `Atomics.wait`, so draining uses queued microtasks with short burst polling and a 200ms fallback poll. This keeps the implementation allocation-light without an unavailable Blob Worker.

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

`GET_STATS` is synchronous. `GET_COUNTS` is asynchronous and returns `{ dexieCount }` (with legacy `rxdbCount` compatibility while consumers retain it). `TABOT_PAGE_EVENT` accepts content-script events. Existing derived-query functions remain shared-package APIs; dashboard/popup messaging for them is intentionally deferred until Phase 7 validates their value.

---

## 5. Derived Browser Intelligence

The deterministic derived layer is:

```text
StoredTabEvent[]
  -> Session[]
  -> BrowserContext[]
  -> Memory[]
  -> retrieval results and LiveBrowserContext
```

All layers use **Option A: lazy derivation**. No sessions, contexts, memories, retrieval, or live-context tables exist in IndexedDB. Persisted events remain the only durable source of truth.

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
  eventSequence: StoredTabEvent[]; // cleared when > 1000 events
  activeTabId: number;
  activeWindowId: number;
}

interface TabParticipation {
  tabId: number; eventCount: number; firstSeen: number; lastSeen: number; isActive: boolean;
}

interface DomainParticipation {
  domain: string; eventCount: number; tabIds: number[]; firstSeen: number; lastSeen: number;
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

### APIs and bounds

```ts
sessionize(events): Session[]
getSessions(db, start?, end?): Promise<Session[]>
getSessionById(db, id): Promise<Session | undefined>
getRecentSessions(db, limit = 10): Promise<Session[]>
```

`getSessions` uses indexed timestamp boundaries where supplied. `getRecentSessions` derives then slices. `sessionize([])` returns `[]`; a one-event input returns one valid zero-duration session.

---

## 7. Sessions to Contexts

A `BrowserContext` is a non-overlapping cluster of related sessions. It is evidence of related browser activity, never a task label.

```ts
interface BrowserContext {
  id: string; // `${firstSessionId}-${lastSessionId}`
  startTimestamp: number; endTimestamp: number; duration: number;
  sessionIds: string[]; sessionCount: number;
  domains: ContextDomain[];
  totalEventCount: number; totalInteractionCount: number;
  totalNavigationCount: number; totalTabSwitchCount: number;
  recurrenceCount: number; // supporting sessions for the top domain
  primaryDomain: string;   // display label only
}

interface ContextDomain {
  domain: string; eventCount: number; sessionCount: number;
  sessionIds: string[]; firstSeen: number; lastSeen: number;
}
```

### Construction rule

Sessions are sorted by start time and processed as a chain. A session joins the immediately previous session's context only when both conditions hold:

- the gap from prior session end is `<= 30 minutes`; and
- the two adjacent sessions share at least one domain.

Otherwise it begins a new context. A session belongs to exactly one context. There is no overlapping, hierarchical, or transitive bridging: `GitHub -> YouTube -> GitHub` forms three contexts because the middle session has no adjacent domain overlap.

Context domains aggregate event counts and session IDs; they sort by event count descending, then first seen ascending. `primaryDomain` is the first item in that evidence ordering and has no semantic meaning.

### APIs

```ts
buildContexts(sessions): BrowserContext[]
getContexts(db, start?, end?): Promise<BrowserContext[]>
getContextById(db, id): Promise<BrowserContext | undefined>
getRecentContexts(db, limit = 10): Promise<BrowserContext[]>
```

The recent-context API reads at most 500 recent sessions before building and slicing contexts.

---

## 8. Contexts to Memories

A `Memory` is a compact, evidence-backed representation of recurring or sufficiently dense browser-context history. It does not summarize user intent.

```ts
interface Memory {
  id: string; // a context id, or `${firstContextId}-${lastContextId}`
  kind: 'single' | 'recurrent';
  startTimestamp: number; endTimestamp: number;
  signature: string;
  domains: MemoryDomain[];
  contextIds: string[]; contextCount: number;
  firstContextId: string; lastContextId: string;
  totalSessionCount: number; totalEventCount: number;
  firstSeen: number; lastSeen: number; staleness: number; strength: number;
  observation: string; // observed domain-based statement
  inference: null;
}

interface MemoryDomain {
  domain: string; eventCount: number; contextCount: number;
  contextIds: string[]; firstSeen: number; lastSeen: number;
}
```

### Identity, qualification, and ranking

A canonical signature takes a context's six highest-event-count domains, alphabetizes them, then joins with `+`.

| Threshold | Value |
|---|---:|
| recurrent contexts | 2 |
| single-context minimum event count | 500 |
| domains in signature | 6 |
| stale after | 7 days |
| returned memory cap | 50 |

Contexts with the exact same signature consolidate into one memory. Partial overlaps deliberately remain separate: `github.com+slack.com` is not `github.com+slack.com+jira.com`. A one-context group is retained only when it has at least 500 events. A multi-context group is a `recurrent` memory.

`strength = contextCount * min(domainCount, 5)`. `staleness = max(0, now - lastSeen)`. Stale memories are not deleted; consumers receive their staleness and decide how to rank them. The observation is a template such as `visited github.com, slack.com across 3 activity periods`; `inference` is always `null`.

### APIs

```ts
buildMemories(contexts, now?): Memory[]
getMemories(db, limit = 50): Promise<Memory[]>
getMemoryById(db, id): Promise<Memory | undefined>
getMemoriesBySignature(db, signature): Promise<Memory[]>
```

Memory APIs derive from no more than 500 recent contexts and return strength-ordered results.

---

## 9. Browser-context Retrieval

Retrieval makes the derived layer usable without interpreting raw events at query time. It is domain-based, evidence-first, bounded, and returns structured results rather than task claims.

### Result types

```ts
interface SimilarContextResult {
  context: BrowserContext;
  similarity: number;
  sharedDomains: string[];
}
interface SimilarMemoryResult {
  memory: Memory;
  similarity: number;
  sharedDomains: string[];
}
interface ContextSummary {
  context: BrowserContext;
  observation: string;
  domainList: string[];
  eventDensity: number; // events per millisecond
}
interface RecurrenceReport {
  isRecurrent: boolean;
  memory?: Memory;
  similarMemories?: SimilarMemoryResult[];
}
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

Similarity is Jaccard index over domain sets:

```text
jaccard(A, B) = |A intersection B| / |A union B|
```

Only values greater than zero are returned, results sort descending by similarity, and default query caps are five (three for recurrence's related-memory list). Jaccard returns `0` for two empty sets rather than `NaN`.

### Evidence signals, not confidence claims

Consumers receive similarity, memory strength, staleness, context event density, and session count. They decide what those signals mean. Thin contexts, stale memories, and weak partial overlap are never hidden or turned into an intent claim.

Retrieval derives at most 500 contexts and 50 memories. Similarity is consequently `O(500 * averageDomains)`, acceptable until measurement proves otherwise.

---

## 10. Live Browser Context

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

## 11. Validation and Engineering Checks

Each derivation core is deterministic and has a runnable Node assert check:

```bash
pnpm --filter shared check:sessions
pnpm --filter shared check:contexts
pnpm --filter shared check:memories
pnpm --filter shared check:retrieval
pnpm --filter shared check:live-context
pnpm lint
pnpm --filter extension exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
```

The check scripts exercise the respective pure functions and rebuild consistency: the same events/sessions/contexts/memories and fixed clock must produce deep-equal output.

### Required behavioral coverage

- **Sessions:** continuous activity stays whole; inactivity, visibility, tab-return, and window boundaries split sensibly; empty/single-event streams work; rapid switching does not fragment; long reading remains low intensity.
- **Contexts:** adjacent overlapping domains within 30 minutes group; disjoint domains or longer gaps split; no transitive bridging; empty and one-session inputs work.
- **Memories:** exact signatures consolidate; partial overlap stays separate; dense singles qualify; recurrent groups qualify; signature cap, staleness, and rebuild consistency hold.
- **Retrieval:** today/range/domain filtering, exact recurrence, Jaccard ranking, previous context, novelty, timeline, domain history, and empty inputs work.
- **Live context:** active tab/window and current URL select latest matching events; navigation cap/order, related items, staleness, low intensity, absent data, and rebuild consistency work.

### Deferred only after measurement

Do not add derived IndexedDB tables, full event-cache indexes, derived dashboard routes, popup messages, semantic enrichment, or new telemetry merely for convenience. Add them only if Phase 7 demonstrates a concrete need.

---

## 12. Phase 7 Decision Gate

Before adding any AI capability, evaluate representative real and constructed browsing scenarios:

1. session quality and explainable boundaries;
2. context coherence and separation;
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

## 13. Constraints and Out of Scope

1. Background service worker is the sole SAB producer; content scripts never write shared memory.
2. SAB contains only fixed-size numeric fields; URLs/titles remain in the sidecar.
3. IndexedDB persists raw normalized events in batches; derived data is lazy and rebuildable.
4. Dashboard and popup do not receive raw events.
5. Derived output never names a task, intent, or content meaning.
6. There is no cloud/backend/authentication/multi-user path.
7. No LLM, embeddings, semantic search, vector database, cross-device identity, content capture, predictive context, or automation is implemented.
8. Optional persistence caches, derived UI routes, and derived runtime messages require Phase 7 evidence first.

---

## 14. History

- `2026-08-22` - Consolidated initial collection, SAB, Dexie, and dashboard documentation into `tech.md`.
- `2026-08-24` - Added the implemented deterministic derived layer: sessions, contexts, memories, retrieval, and live browser context; merged metrics into this document and retired split specification files.
