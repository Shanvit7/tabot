# Tabot Technical Specification

> **Technical source of truth for Tabot's architecture and deterministic derived layer.** Supersedes the earlier split specifications (`metrics.md`, `sessions-spec.md`, `contexts-spec.md`, `memories-spec.md`, `retrieval-spec.md`, `liveContext-spec.md`) and incorporates the former v0.2 product plan with [`system.md`](./system.md). Audited against working-tree code on 2026-10-28. TalaDB migration is implemented and one Chrome profile passed full-restart verification. Per-profile upgrade and live search evaluation remain for human QA; broader qualification and search-quality evaluation are deferred, not blockers to the completed implementation.

---

## 1. Product Boundary

Tabot is an early-stage proof of concept: a Chrome extension and local web dashboard that collect browser activity at volume, retain it locally, and deterministically derive browser context.

```text
Chrome tab APIs + content script
  -> existing service worker (validation, metadata snapshot, bounded admission)
  -> Pacer Batcher (128 rows / fixed first-item 25 ms window)
  -> Pacer AsyncQueuer (FIFO, concurrency 1)
  -> offscreen TalaDB owner -> atomic OPFS commit -> persisted ACK
  -> events derive activity; optional page observations derive bounded evidence separately
     events -> sessions -> anchors -> graph -> episodes -> contexts -> memories -> retrieval
  -> live browser-context snapshot
```

Raw browser events remain local. The ChatGPT integration uses Tabot’s online MCP/OAuth connection service for authorization and request routing; the extension runs each tool against its local data and returns a sanitized, bounded result (such as a browser context, recurring-pattern evidence, or activity metrics) to ChatGPT when requested. The service stores OAuth/installation state, not browser history or tool results. There is no Tabot-hosted LLM, embeddings, vector database, productivity scoring, or semantic task inference. See [MCP relay setup and troubleshooting](../apps/mcp-server/README.md).

### Architectural principles

1. **Raw events are immutable source data.** Every derived object is disposable and rebuildable.
2. **No semantic claims from sparse telemetry.** The system may report domains, timestamps, counts, overlaps, recurrences, and similarity scores; it must not assert what a user was doing.
3. **Separate evidence domains.** Page excerpts are captured separately and never become lifecycle events or behavioral metrics.
4. **Deterministic, with bounded results.** Same input and supplied clock produce the same output. Result counts/payloads have caps, but several local derivations scan the full retained event store; output bounds are not input-cost bounds.
5. **Evidence first.** Derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them.

### Privacy boundary

`KEY_ACTIVITY` records only that activity happened, never typed text, key values, characters or form/input values. Page excerpts are automatically captured while global tracking is enabled, restricted to bounded visible text fragments that pass current viewport, clipping and occlusion checks after one-second foreground dwell or trusted interaction. Password/form/editor content, auth routes, incognito and whole-page snapshots are excluded. They have no time-based expiry; oldest rows are removed only when the 25 MiB storage budget is exceeded. Page excerpts stay local and are not included in assistant tools. Raw URL sidecars can contain paths/query values and remain local; authorized tool results and user-controlled downloads are separate privacy boundaries. Sanitized derived results **do leave the device** when requested through ChatGPT (§16); “local-first” does not mean no network traffic or no sharing.

---

## 2. Stack and Repository

- **Extension:** Plasmo, Manifest V3, Chrome target, background service worker.
- **Dashboard:** TanStack Start + Rsbuild, React 19 with React Compiler, Tailwind and local UI components; `react-force-graph-2d` for activity maps and `react-call` for session inspection. Marketing routes are prerendered; browser data is fetched/derived client-side. TanStack Charts is not a current package dependency.
- **Language/package manager:** TypeScript (ESNext, bundler resolution), pnpm workspaces.
- **Scheduling:** TanStack Pacer 0.22.0 Batcher + serial AsyncQueuer in the same MV3 worker; no production SAB/Atomics or transport Web Worker.
- **Rate shaping:** Pacer 150 ms scroll/key throttlers and bounded transport retries at the content-script boundary.
- **Persistence:** TalaDB 0.12.1 in one OPFS-backed `records` collection; immutable activity and page evidence stored as distinct record kinds. IndexedDB is used only by the verified legacy-profile importer.
- **Graph substrate:** graphology.
- **Optional relay:** Hono + MCP SDK on Cloudflare Workers, Durable Objects for OAuth/installation state, authenticated WebSocket to the extension. No remote browser-history store.

```text
tabot/
├── apps/
│   ├── extension/
│   │   ├── background.ts                # native producers, ingest wiring, readers, messaging
│   │   ├── contents/tabot.ts            # page telemetry and automatic visible excerpts
│   │   ├── popup.tsx                    # activity recap, progress, new-summary CTA
│   │   ├── popup-model.ts
│   │   ├── foreground.ts               # focused/idle-aware sampling
│   │   └── relay.ts                    # authenticated WebSocket + local tool handlers
│   ├── mcp-server/                      # optional ChatGPT MCP/OAuth relay
│   └── web/
│       ├── src/routes/                  # landing + dashboard routes
│       ├── src/lib/home-data.ts         # extension transport + in-memory derivation
│       └── src/components/              # landing, dashboard, and UI components
├── packages/shared/src/
│   ├── events/                         # ingest validation, metadata, TalaDB domain adapter, historical buffer experiment
│   ├── pages/                          # sanitized page observations and bounded evidence reads
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
  // SW telemetry (Phase 2). Indices fixed — ever. Historical rows
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
| `TAB_REMOVED` | `chrome.tabs.onRemoved` | actual removal window ID |
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
  id: string;       // native UUID or document-instance UUID + sequence; historical IDs preserved
  type: TabEventType;
  tabId: number;
  windowId: number;
  timestamp: number; // Date.now() at capture
  url?: string;      // new writes are minimized/redacted before pipeline admission
  favicon?: string;  // legacy field; omitted from new writes
  metadata?: { x?: number; y?: number; scrollY?: number; previousWindowId?: number; enabled?: boolean; state?: number };
  source?: { instanceId: string; sequence: number; documentId?: string };
}
```

IDs are generated once at capture and reused for retries. Committed duplicates are validated in TalaDB, including after restart; conflicting reuse is rejected, not overwritten. Historical IDs need no migration. Same-source timestamp ties use sequence, never UUID lexical order; independent sources have no global causal order.

### Collection details

- `SCROLL` and `KEY_ACTIVITY` are Pacer-throttled at the content-script boundary (currently 150ms).
- `SCROLL` observes `window` plus nested elements with `overflow-y: auto|scroll` and `scrollHeight > clientHeight`.
- `CLICK`, `PAGE_VISIBLE`, and `PAGE_HIDDEN` are emitted directly.
- Chrome tab lifecycle and navigation events are not throttled.
- URL/title/favicon values are no longer retained in the in-memory `tabMeta` sidecar. Lifecycle events use the Chrome snapshot available at capture.

### Metrics and UI boundary

`StatsSnapshot` is an internal engineering/transport-health contract. Popup and dashboard also fetch persisted events for local derivation; presentational components do not render the raw stream. Raw event totals must not appear as user-facing activity/action/visit counts, per [PRODUCT.md](../PRODUCT.md).

`StatsSnapshot` exposes health, collector/pending/active/held/outstanding rows, pending bytes and oldest age, observed/selected/queued/persisted/duplicate/ignored/coalesced/rejected counters, retry/failure counts, last commit/error code, and 128 bounded batch timing samples. Counters reset on worker activation, not lifetime loss totals. Compatibility `buffer*` fields mean queue admission budget/occupancy/peak, `eventsProcessed/totalEvents` mean committed inserts, `droppedEvents` means admission rejections. See the exact type in `packages/shared/src/lib/protocol.ts`.

`GET_COUNTS` obtains authoritative committed event/page counts from TalaDB. Popup/Home show plain degraded-state feedback; raw pipeline totals are not activity counts. Read failures are explicit, not empty history or zero counts; readers retain last successful data.

---

## 4. Event Transport and Persistence

### Single-worker ingestion and metadata

Native handlers snapshot their own tab/navigation payload or existing metadata before asynchronous policy checks. Page ingress uses validated Chrome sender/document identity, not payload URLs/tab IDs. The normalized row is copied before scheduling; numeric zero/fractional values remain intact. Foreground/tracking rules apply to new capture, not known replay. Async eligibility checks precede FIFO collection, so there is no claim of global causal order.

### Bounded Pacer stages

`apps/extension/ingestion/event-pipeline.ts` owns 2,048 outstanding rows / 4 MiB conservative payload accounting across eligibility, collector, pending, active and held batches. Reserve 128 rows / 256 KiB for native/boundary events within that total. Each normalized payload is limited to 32 KiB; each in-flight ID permits four response waiters. Interaction overload receives retryable/busy, never eviction or persisted success.

`Batcher` collects at most 128 rows / 25 ms from first item. Function-valued remaining wait prevents later arrivals extending the deadline; semantic boundaries flush promptly. Synchronous transfer goes to `AsyncQueuer` FIFO, concurrency 1, wait 0. Never writer-flush: installed Pacer flush can bypass concurrency. No idle collection timer, drain polling, dedicated transport worker, SAB or Atomics in production bundles. Timing values are provisional scheduling targets, not durability guarantees.

### TalaDB persistence and failure ownership

`apps/extension/tabs/storage-owner.ts` hosts one OPFS-backed TalaDB database in an extension offscreen document. Events and page observations are envelopes in one `records` collection, separated by `recordKind`; source IDs and replay identities remain in the payload. One serialized owner mutation lane normalizes and deduplicates input, checks existing identities and page budgets, then calls atomic `records.insertMany()` for accepted rows. Conflicting reuse rejects before insert; matching replay never overwrites. ACK follows the durable call, then releases capacity.

The existing writer retries classified transient failures three times (exponential 100 ms base, 1 s cap, 0.2 jitter). Permanent failure/exhaustion stops new starts and retains one bounded immutable held batch. Pending work remains owned; responses are not persisted ACKs. Recovery retries held work first after cooldown via suitable events/alarm, or explicit internal `RETRY_INGEST`. OPFS errors fail closed; an ambiguous owner response is reconciled by stable identity after reopening, not assumed uncommitted. The migration-only native IndexedDB reader imports old `tabot_events` profiles in verified batches and retires the database after verification; it is not a live write/read fallback. One profile passed manual full-Chrome-restart verification. Per-profile upgrade and live search validation remain for human QA; no additional profile migration was attempted.

### Protocol, readers and lifetime

Protocol v1 requires stable document-instance UUID + sequence, preserved capture timestamp, type/numeric metadata allowlists and Chrome sender checks. Five-minute replay age / five-second future skew bound input; unseen messages delayed over ten seconds lack historical foreground proof and are ignored. Source outbox caps 256 events / 512 KiB, four active sends and three attempts; hidden boundaries flush pending trailing samples first. Old protocol receives reload-required; invalidated content contexts still require page reload.

`persisted` means commit or identical committed replay; `ignored`, `retryable` and `rejected` never mean durable. Queues, timers, held work and callbacks disappear on worker termination. Live page retry can recover an ambiguous ACK; native Chrome events have no general replay. Committed history survives ordinary restarts under browser storage guarantees, not deletion/uninstall/quota or universal hardware fsync. No exactly-once, physical-interaction losslessness or shutdown-flush guarantee.

`GET_STATS` is a cheap synchronous scheduler snapshot. `GET_COUNTS` returns committed event/page counts; `GET_EVENTS` returns committed event rows. Dashboard `SEARCH_HISTORY` is user-triggered and reads current TalaDB rows, returning bounded URL-grouped citations from event metadata and already-redacted page excerpts. It is restricted to Tabot's GitHub Pages path and `localhost:3000`/`:3001`; unauthorized origins return `unauthorized-sender`, query failures return `search-unavailable`. Dashboard/popup preserve last successful snapshots and show degraded status; storage-read failures remain explicit, never zero/empty fallback. No history or page excerpt leaves the device; MCP authorization/sanitization is unchanged and reads committed event rows without flushing ingestion. Full flow and failure ownership: [data-flow.md](./data-flow.md).

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

All layers use **lazy derivation**. No sessions, contexts, memories, retrieval, or live-context tables exist in TalaDB. Persisted records remain the only durable source of truth.

### Shared constraints

- No LLM, semantic search, embeddings, vector database, user-intent inference, cross-device correlation, content semantics, or application identity beyond domains.
- New algorithms must remain pure at their core and use only the minimal storage adapter they need.
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

Historical rows are re-derived locally; no derivation-field migration is needed beyond the one-time storage import. Old traces lack periodic samples and sometimes focus/visibility evidence: duration remains an estimate, never extrapolated to now or across event gaps of five minutes or longer. Existing downloaded exports must be generated again to receive corrected durations; missing historical attention cannot be reconstructed exactly.

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
pnpm --filter @tabot/shared run swSemantics
pnpm --filter @tabot/shared run swDerivation
pnpm --filter @tabot/shared run swGraph
pnpm --filter @tabot/shared run swEpisodes
pnpm --filter extension check:popup

pnpm --filter extension check:activityRelay
pnpm --filter mcp-server check:activitySurface
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

Do not add derived TalaDB collections, event caches/indexes, semantic enrichment or additional telemetry merely for convenience. Existing dashboard routes, popup messages and assistant handlers are already implemented; the evidence gate is a requirement for expanding capabilities, not a claim that those surfaces are absent.

---

## 13. Deferred Product-quality Evaluation

This evaluation is not required to consider the TalaDB migration implementation complete. Run it before claiming representative real-browsing usefulness or expanding AI-facing behavior.

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

The current ChatGPT integration serves requested, sanitized activity summaries, bounded recurring-pattern evidence and origin-only metrics (§16), not raw history or the whole live snapshot. Sessions are inspectable locally but have no dedicated MCP tool. Source inspection and deterministic checks do not establish representative real-browsing usefulness. This product-quality evaluation is deferred; it does not block the implemented storage migration.

---

## 14. Constraints and Out of Scope

1. Existing service worker owns bounded ingestion and serial atomic writes; no second capture worker.
2. Metadata snapshots are immutable before asynchronous admission; retries never re-enrich stored events.
3. TalaDB persists raw normalized records in batches on OPFS; derived data is lazy and rebuildable. Native IndexedDB is retained only as a migration reader for legacy profiles.
4. Dashboard and popup do not render raw event streams; they show aggregates plus derived views.
5. Derived output never names a task, intent, or content meaning.
6. The optional Cloudflare relay authenticates ChatGPT requests and routes them to the user's live extension; it does not store raw events or derived browser history. There is no Tabot account, cloud sync, or multi-user history store.
7. No Tabot-hosted LLM, embeddings, vector database, cross-device identity, content capture, predictive context, or automation is implemented. Local text search over derived contexts is available through MCP.
8. Additional persistence caches, collection or semantic capabilities require demonstrated need. Existing derived UI routes/runtime messages are current code, not deferred work.

---

## 15. Service Worker Telemetry (Phase 2 final)

Phase 2 ran a Service Worker (SW) telemetry experiment and concluded **KEEP WITH REDUCTION**: one SW signal survives, four were retired, the `downloads` permission was removed. Raw events remain the source of truth; SW rows flow through the same bounded ingest → atomic Dexie → pure-derivation path as Phase 1 events.

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

- Source: `chrome.windows.onFocusChanged`; requires `windows` permission. `windowId = -1` is the no-window sentinel; `previousWindowId` is ordinary numeric metadata (historically SAB slot 3).
- **Session layer:** a focus row cannot itself open a session or reset its inactivity clock; a focus-only trace yields 0 sessions. The foreground prefilter uses focus state to reject activity in unfocused windows and close observed dwell. Correcting previously admitted background activity can change derived sessions; focus regain alone never proves continued work.
- **Meaningful events:** classified contextual; never forms a transition (no URL).
- **Graph layer:** `applyFocusContinuity` (in `sw-graph.ts`) may only **decorate an existing same-session edge** with a strengthened weight when a causal focus sandwich is present (departure w→x, return x→w chained via `previousWindowId` inside the anchor span). Chains where `previousWindowId === -1`/`WINDOW_ID_NONE` are excluded (focus loss/regain is not an excursion return). SW adds zero nodes/edges/counts.
- **Episode layer:** no SW terms in the boundary scorer — no focus boost; evidence is a causal record only.

Historical Phase 2 analysis (before schema 9 foreground filtering): SW telemetry added **0** sessions, anchors, graph edges, episodes, contexts, or memories; only graph evidence counts changed where genuine cross-window continuity occurred.

### SW checks

```bash
pnpm --filter @tabot/shared run swSemantics    # taxonomy + firewall classification
pnpm --filter @tabot/shared run swDerivation   # Pipeline A vs B comparison
pnpm --filter @tabot/shared run swGraph        # focus continuity (-1 chains excluded)
pnpm --filter @tabot/shared run swEpisodes     # focus-only burst -> 0 sessions
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
  -> local TalaDB / shared derivation / sanitization or aggregate projection
  -> correlated bounded result -> ChatGPT
```

Production configuration targets `https://tabot-mcp.shanvit7.workers.dev/mcp`; development targets `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`. Extension `PLASMO_PUBLIC_MCP_RELAY_URL` uses the matching origin, without `/mcp`; `PLASMO_PUBLIC_HOME_URL` controls dashboard links. `TABOT_AUTH_SECRET`, `TABOT_EXTENSION_ID` and dashboard `VITE_TABOT_EXTENSION_ID` must match their environment. `wrangler.toml` and `wrangler.dev.toml` use separate Workers/Durable Objects/secrets. These are configured targets, not evidence that production has the current source or seven discovered tools.

`pnpm dev` invokes the MCP source watcher, which **deploys to the dev Worker on startup/change**; it is not a localhost tunnel or a harmless offline check. `dev:local` runs Wrangler locally and cannot serve ChatGPT without a public route. No custom `mcp.tabot.ai` domain/named tunnel is configured in the documented setup. Operational commands live in the [relay README](../apps/mcp-server/README.md); production deploy requires explicit approval.

### Runtime connection destination and onboarding

Web dashboard and extension popup use shared `resolveChatGptConnectUrl()` at runtime. It fetches `GET /client-config` from the Worker with a 3-second timeout. The endpoint returns `{ marketplaceUrl: string | null }`; an absent or invalid `CHATGPT_MARKETPLACE_URL` returns `null` and selects the prefilled setup prompt. Configured destinations are accepted only for HTTPS `chatgpt.com` URLs. `/client-config` is public and cached for 60 seconds; other Worker routes remain `no-store`. The response contains no secrets or browser data.

The prompt guides users through account setup: ChatGPT Plugins → top-right **Add** → **Add custom MCP server**; enter Name `Tabot`, a discovery-oriented description, production MCP Server URL, and OAuth; acknowledge the risk notice and authorize. Server registration and adding/enabling the resulting plugin on the ChatGPT account are treated as separate steps. The prompt does not claim completion until the plugin is available. The current prompt fallback is also used on timeout, fetch failure, `null`, or rejected config URL.

Marketplace rollout requires setting `CHATGPT_MARKETPLACE_URL` in the production Worker and deploying that Worker. Web and already-installed extension clients switch after their short config cache expires; no client rebuild or extension redeploy is required. No feature-flag dependency is used. Source and checks are implemented, but live ChatGPT form behavior, account-level plugin installation and production marketplace rollout still require manual verification.

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

Server entry is `apps/mcp-server/src/index.ts`; schemas are in `apps/mcp-server/src/mcp/schema/`, auth code in `apps/mcp-server/src/auth/`, and shared configuration in `apps/mcp-server/src/config.ts`. Extension relay dispatch/projections are in `apps/extension/relay/relay.ts`. Tools return one JSON text content block; relay failures become MCP `isError` results. `get_session` and `get_page_context` do not exist. Local `LiveBrowserContext` APIs are not directly exposed by MCP.

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

After Worker tool/schema/auth changes, deploy the intended environment explicitly and refresh ChatGPT discovery. Existing access/refresh grants can still represent a connection to older deployed code. The runtime onboarding CTA is wired, but real prompt-prefill behavior, successful OAuth/tool retrieval, account-level plugin availability and production marketplace switching remain unverified.

## 17. Readiness, Product Surfaces and Release Gate

Readiness is deterministic: `duration >= 10 minutes` AND `totalEventCount >= 10` AND (`domainCount >= 2` OR `sessionCount >= 2` OR `totalInteractionCount >= 5`). Shared core is `isAiReadyEvidence`; context and episode wrappers reuse it. It gates MCP discovery and popup readiness, **not** exact-ID access or a claim that a topic/intent is known.

Tabot's activity-derived reminders and notification heuristics have been removed. Readiness and recurring-pattern derivation remain for on-demand discovery; they do not create obligations or contact the user. ChatGPT-owned scheduled check-ins are a proposed direction, not a current capability: verify unattended custom-connector invocation and delivery before building or promising it. Until then, use a plain reminder and user-initiated lookup without implying fresh background evidence.

Home maps and session inspection, Activities range/site metrics, recurring-pattern discovery/actions, popup activity summaries and session-count progress are implemented. Inspector mounts one `react-call` root, projects aggregate session evidence, separates browser/extension sources and shows no event counters or technical footer. The explicit shared-gate readiness indicator on Home is **absent**. Use internal `context` names only for contracts, not UI labels.

The old plan’s fake topic labels, event-count examples, new-memory popup counts and deterministic “first memory forming” progress are not implementation requirements. Local review remains primary and ChatGPT optional; no extra providers, centralized history, semantic inference, universal PII detector, native app or telemetry rewrite is needed. Preserve meaningful sparse re-engagement, honest empty states, privacy-first selected retrieval and evidence before interpretation.

The extension package/manifest and MCP package/protocol are prepared at **0.2.2**. Production MCP Worker is deployed; local builds do not prove a Chrome Web Store release. PR #19 must merge before dashboard deployment and the extension upload workflow; review and publish the resulting store draft manually.

Release requires normal-user connection without MCP setup, real browsing and evidence-grounded ChatGPT results, production ID/origin/base-path/tool-version agreement, offline/restart/credential acceptance, and a decision on supported user-directed scheduled checks. See [system.md → status and acceptance](./system.md#v02-status-and-acceptance). Measure first useful activity → review → authorized assistant use → return, not raw collection volume. No implemented product-loop analytics is claimed.

**Audit evidence:** non-UI logic/relay checks pass locally; they use constructed/mocked data and do not validate production ChatGPT. Real-browser consent/retrieval, production deployment and complete release acceptance remain unverified. UI review belongs to the user.

---

## 18. History

- `2026-08-22` - Consolidated initial collection, SAB, Dexie, and dashboard documentation into `tech.md`.
- `2026-08-24` - Added the implemented deterministic derived layer: sessions, contexts, memories, retrieval, and live browser context; merged metrics into this document and retired split specification files.
- `2026-08-28` - Rewrote the derived-layer sections to match the V6/V7 implementation: added the meaningful-event, activity-anchor, activity-graph, and episode stages; contexts are now built from episodes with trajectory-coherence segmentation; memories use behavioral fingerprints rather than exact domain signatures; sessions retain full event sequences; added a companion `system.md` walkthrough.
- `2026-09-13` - Synthesized the Phase 2 SW experiment into §15 (KEEP WITH REDUCTION): `SW_WINDOW_FOCUS` retained as the only SW signal; popup/toggle/download/lifecycle retired to diagnostic; `downloads` permission dropped; retired `docs/sw-events.md`, `docs/sw-inventory.md`, `docs/sw-phase.md`, `docs/sw-step11-report.md` folded in here and `system.md`.
- `2026-10-09` - Audited and absorbed the v0.2 product plan into this specification and `system.md`; documented all seven MCP tools, actual OAuth/relay/privacy/readiness contracts and current UI behavior. Corrected stale package paths, result-vs-read bounds and deferred-surface claims. Kept production/live acceptance and absent features separate from implementation.
- `2026-10-20` - Added the off-by-default visible page-excerpt path, local consent/deletion/retention controls, ingestion redaction and strict assistant isolation. Real-browser acceptance and the evidence-backed workflow UI remain release gates.
- `2026-10-28` - Replaced the active Dexie event store with TalaDB/OPFS, added verified legacy import and offscreen ownership, and recorded one user's successful full-browser-restart check. Broader qualification remains open.
- `2026-10-28` - Removed per-origin page-capture consent and seven-day expiry. Eligible visible excerpts now capture while global tracking is active; 25 MiB storage budget and sensitive-page/form exclusions remain.

---

## 19. Automatic Page Observation Path

### Automatic capture and extraction

Page extraction follows the global tracking toggle; there is no per-origin consent list. It runs automatically on eligible HTTP(S) pages while tracking is enabled, but not while hidden/unfocused, in incognito, or on auth/credential routes and password-manager hosts. Tracking pause cancels timers/observers and purges queued excerpt payloads. Page capture does not grant assistant access.

The content script waits one continuous second after the initial foreground viewport or after scroll settling (250 ms settle + one second dwell). Trusted clicks and Enter/Space activation on non-editable targets can nominate bounded visible context immediately. A per-document five-second send ceiling applies; the DB transaction independently enforces the same-resource rate limit and cumulative budgets. Same-document route changes reset dwell. Visible DOM mutations restart dwell only when bounded geometry checks find changed text within the viewport; this is not proof of reading.

`visible-excerpts.ts` walks at most 2,000 DOM nodes, 8,000 words and 100,000 source characters per extraction; it persists no more than four segments of 1,000 characters each. It checks each word's Range geometry, viewport bounds, ancestor clipping and topmost element. Editors, inputs, hidden/aria-hidden content and unsupported geometry are excluded. Entire text-node values are never read; only complete words whose rendered ranges pass visibility checks are assembled. If visibility is uncertain, skip rather than capture the ancestor. These DOM checks are best-effort browser evidence, not proof that a person read or understood text.

### Ingestion, privacy and identity

`TABOT_PAGE_OBSERVATION` is a separate schema, never an event `type`. Worker ingress validates same-extension top-frame sender, Chrome tab/window/document identity, current URL, eligible site, message allowlist, UUID, timestamp, byte/segment limits and foreground eligibility. It builds a versioned allowlisted record, removes URL credentials/query/fragment, redacts supported URL-path PII and excerpt text, and drops malformed/oversized input. OpenRedaction detects selected email/phone/card/IBAN patterns; targeted patterns also redact credential assignments, bearer strings, JWT-like values and bounded PEM blocks. This is not universal PII/secret detection. Detector failures reject observations; raw text never enters collector/held rows, logs, telemetry or export.

An installation-local Web Crypto HMAC signs immutable capture identity and raw route resource identity under separate domain labels. Only signatures are stored; they remain sensitive metadata, not anonymization. Replay comparison precedes current focus/eligibility checks so identical committed retries succeed without rewriting first evidence. Same-ID/different-payload is rejected. New page records are privacy-processed before the shared bounded writer and revalidated at the serialized TalaDB owner mutation boundary.

### Storage and read boundary

TalaDB stores event/page envelopes in one OPFS-backed `records` collection. Page observations retain sanitized route, opaque `pageKey`, HMAC replay identity, sender tab/window/document IDs, trigger, sanitized segments, privacy provenance and coverage flags. The single offscreen owner serializes mutations and atomically inserts both record kinds through `insertMany()`; no second writer or durable raw queue. Per-resource UTC-day ceiling is 32 KiB; per-origin UTC-hour ceiling is 128 KiB; serialized sanitized allocation is counted. Resource budget accounting has a 1,000-row fail-closed guard. Budget/rate failure returns ignored, not persisted. The migration-only native IndexedDB reader imports and verifies legacy profiles before retiring `tabot_events`.

Page observations have no time-based expiry. A Chrome alarm enforces the 25 MiB storage budget by deleting oldest rows in bounded 500-row batches, repeating each minute while over budget and otherwise every six hours. Page deletion endpoints are internal extension-page messages only. Deleting stored rows flushes the collector, waits up to 15 seconds for the shared pipeline to drain, then deletes in bounded transactions; capture continues afterward while tracking remains enabled. The popup shows metadata-only site summaries and delete controls. Existing event history is not rewritten or deleted by this feature.

`GET_EVENTS`, event-derived sessions/contexts/metrics, popup refresh and assistant tools never include page bodies. Page metadata and selected-observation reads are internal extension-page messages only. No dashboard or assistant endpoint reads page observations. Page capture remains local-only; no assistant schema/grant change exists.
