# Tabot — Tech Spec (V1)

> **Single source of truth.** Consolidates `setup.md` + `event-model-sab-spec.md` + `persistence-dashboard-spec.md`. Those three are deprecated — delete after review. All persistence references are Dexie (IndexedDB); legacy `tabot_rxdb` IndexedDB is deleted on first open.

---

## 1. Goal

Engineering-first Chrome extension + web dashboard for high-volume browser activity collection. Long-term direction is digital-workflow representation → workflow intelligence → automation. **V1 proves the pipeline only** — no AI, auth, cloud, or productivity scoring.

### V1 pipeline

```text
Chrome Extension (Plasmo)
  ↓ Browser activity events
SharedArrayBuffer + Atomics (10k ring buffer, 32-byte slots)
  ↓ batch / normalize
Dexie (IndexedDB) — local event history (bulkPut)
  ↓ aggregation
StatsSnapshot
  ↓ chrome.runtime messaging (GET_STATS / GET_COUNTS)
Popup + TanStack Start dashboard (externally_connectable)
```

Data path stays local. No browser activity is uploaded. Dashboard never consumes the raw stream — only aggregated snapshots.

---

## 2. Stack

- **Extension:** Plasmo (MV3, `chrome-mv3` target, service worker `static/background/index.js`)
- **Web:** TanStack Start + React 19 + Tailwind CSS + Tanstack Charts
- **UI:** BoldKit (Neubrutalism)
- **Lang / pkg:** TypeScript (ESNext, `bundler`), pnpm workspaces
- **Concurrency:** `SharedArrayBuffer`, `Atomics` (Int32Array)
- **Shaping:** TanStack Pacer (content-script boundary only)
- **Persistence:** Dexie 4.x → IndexedDB (`tabot_events`, table `events`). DB name `tabot_events`; legacy `tabot_rxdb` deleted via `indexedDB.deleteDatabase("tabot_rxdb")` on first `createEventsDb()`.
- **Backend:** None. **DB (server):** None.

---

## 3. Monorepo Structure

```text
tabot/
├── apps/
│   ├── extension/
│   │   ├── background.ts              # single SAB producer + drain + Dexie batch + messaging
│   │   ├── contents/tabot.ts          # content script — page activity (Pacer-throttled)
│   │   ├── popup.tsx                  # full StatsSnapshot + Dexie count (1s poll)
│   │   └── package.json               # manifest: permissions [tabs, webNavigation], host_permissions [<all_urls>], externally_connectable
│   └── web/
│       ├── src/routes/index.tsx       # dashboard overview + breakdown + Dexie count
│       ├── src/components/ui/         # BoldKit components
│       └── src/styles/globals.css
├── packages/shared/
│   ├── src/
│   │   ├── events.ts                  # EVENT_TYPES registry + TabEvent
│   │   ├── buffer.ts                  # SAB layout + pushEvent/encode/decode
│   │   ├── protocol.ts                # MSG + StatsSnapshot + createEmptyStats
│   │   ├── metadata.ts                # tabMeta sidecar (tabId → url/title)
│   │   ├── db.ts                      # TabotDatabase (Dexie) + bulkInsertEvents/countEvents
│   │   ├── logger.ts                  # shared logger (warn/info/debug/error)
│   │   └── index.ts                   # barrel
│   └── package.json                   # dexie ^4.4.5
├── docs/tech.md                       # ← this file
└── README.md
```

Plasmo structure may vary — keep the separation, don't fight the framework.

---

## 4. Event Model

Collect **real browser activity only**. No synthetic events in the product path.

### Sources

| Source | Types | Freq |
|---|---|---|
| `chrome.tabs` | `TAB_CREATED`, `TAB_ACTIVATED`, `TAB_UPDATED`, `TAB_REMOVED` | low/med |
| `chrome.webNavigation.onCommitted` (frameId 0) | `NAVIGATION` | med |
| Content script | `PAGE_VISIBLE`, `PAGE_HIDDEN` | low |
| Content script (throttled) | `SCROLL`, `CLICK`, `KEY_ACTIVITY` | high/med |

`KEY_ACTIVITY` = occurrence only. **Never store key, text, input, password, DOM snapshot.**

### Registry (additive — never renumber)

```ts
// packages/shared/src/events.ts
export const EVENT_TYPES = {
  TAB_CREATED: 0, TAB_ACTIVATED: 1, TAB_UPDATED: 2, TAB_REMOVED: 3,
  NAVIGATION: 4,
  PAGE_VISIBLE: 5, PAGE_HIDDEN: 6,
  SCROLL: 7, CLICK: 8, KEY_ACTIVITY: 9,
} as const;
export type TabEventType = keyof typeof EVENT_TYPES;
```

### Normalized model

```ts
interface TabEvent {
  type: TabEventType;
  tabId: number;
  windowId: number;
  timestamp: number;          // Date.now()
  metadata?: { x?: number; y?: number; scrollY?: number };
}
```

Variable-length strings (`url`, `title`) never enter the SAB — see §6 sidecar. `metadata` is bare numbers only (`scrollY` for SCROLL, `x/y` for CLICK).

```ts
interface StoredTabEvent {
  id: string;                 // `${timestamp}-${tabId}-${logical}` — never slot-based (slot is reused)
  type: TabEventType;
  tabId: number;
  windowId: number;
  timestamp: number;
  url?: string;               // resolved from tabMeta at drain time
  metadata?: { x?: number; y?: number; scrollY?: number };
}
```

No eviction in V1 — retain raw normalized events for future sessions/domain timelines/sequences.

---

## 5. Rate Shaping (Pacer)

At the **content-script boundary**, not inside SAB:

```text
SCROLL       → throttle 100–250ms
KEY_ACTIVITY → throttle 100–250ms
CLICK / PAGE_VISIBLE / PAGE_HIDDEN → emit directly
chrome.tabs / webNavigation → no throttling
```

Pacer owns shaping only — not sync, buffering, persistence, or ordering.

---

## 6. Metadata Sidecar

```ts
// packages/shared/src/metadata.ts
export interface TabMeta { url?: string; title?: string; lastSeen: number; }
export const tabMeta = new Map<number, TabMeta>();
// updateMeta(id, {url/title}), getMeta(id), removeMeta(id)
```

- Updated from `chrome.tabs.onCreated/onUpdated` + `webNavigation.onCommitted`.
- Not part of the sync protocol; in-memory for V1.
- Resolved at persist time: `enriched = docs.map(d => meta?.url ? {...d, url: meta.url} : d)`.
- `TAB_REMOVED` uses `windowId 0` sentinel; sidecar entry removed.

---

## 7. SharedArrayBuffer Design

Fixed-size ring buffer. No variable-length fields. No per-event allocation on the hot path.

### Event slot — 8 × Int32 = 32 bytes

```text
┌────────┬────────┬──────────┬───────┬────────┬───────┬────────┬────────┐
│ type   │ tabId  │ windowId │ flags │ tsHigh │ tsLow │ value0 │ value1 │
└────────┴────────┴──────────┴───────┴────────┴───────┴────────┴────────┘
```

| slot | field | meaning |
|---:|---|---|
| 0 | `type` | `EventTypeToValue[type]` |
| 1 | `tabId` | chrome tab id |
| 2 | `windowId` | chrome window id |
| 3 | `flags` | reserved (0) |
| 4 | `tsHigh` | `Math.floor(ts / 2**32)` |
| 5 | `tsLow` | `ts | 0` |
| 6 | `value0` | `scrollY` or `x` or 0 |
| 7 | `value1` | `y` or 0 |

`SCROLL → value0=scrollY`, `CLICK → value0=x, value1=y`, others 0. Decode timestamp: `tsHigh * 2**32 + (tsLow >>> 0)`.

```ts
export const EVENT_SLOT_SIZE = 8;
export const CONTROL_SLOTS = 4;
```

### Control region — 4 × Int32

```ts
export const WRITE_INDEX = 0;     // monotonic logical write
export const READ_INDEX = 1;      // monotonic logical read
export const CAPACITY = 2;        // 10_000
export const PUBLISHED_INDEX = 3; // published (fully written) — consumer reads this
export const DEFAULT_CAPACITY = 10_000;
export const BUFFER_BYTE_SIZE = (CONTROL_SLOTS + DEFAULT_CAPACITY * EVENT_SLOT_SIZE) * 4; // 320,016
```

```text
SharedArrayBuffer
┌───────────────────────────────────────┐
│ CONTROL  [writeIndex, readIndex, capacity, publishedIndex]
├───────────────────────────────────────┤
│ EVENT REGION  slot 0 … slot N (mod capacity)
└───────────────────────────────────────┘
```

### Indexing

- Logical indexes monotonic — never reset. Physical slot = `logical % capacity`.
- Occupancy = `writeIndex - readIndex`. Full when `>= capacity`. Real ring buffer — never increment-then-undo.
- `PUBLISHED_INDEX` is the consumer's truth. `WRITE_INDEX` alone does not prove the event is fully written.

### Producer (single — `background.ts`)

Background is the **only producer**. Content scripts never touch the SAB.

```text
Chrome event / TABOT_PAGE_EVENT → push(type, tabId, windowId, metadata)
  → pushEvent(control, events, capacity, {type, tabId, windowId, timestamp, metadata})
  → check write-read < capacity else droppedEvents++
  → encode numeric fields
  → Atomics.store(WRITE_INDEX, idx+1); Atomics.store(PUBLISHED_INDEX, idx+1); scheduleDrain()
```

Ordering: `check capacity → write fields → publish → notify/drain`. No multi-producer reservation.

```ts
// background.ts drain scheduling — service workers cannot Atomics.wait
scheduleDrain() // queueMicrotask(run) + sync continue if more remains
// fallback: 50ms burst poll after batch, 200ms interval poll
```

> Spec ideal was `Atomics.wait/notify`; reality is polling because MV3 service workers lack `Atomics.wait`. Tech stays allocation-free; revisit Blob Worker if needed.

### Consumer (inline drain in `background.ts`)

Ponytail: no Blob Worker (`URL.createObjectURL` unavailable in service workers) — inline drain keeps SAB semantics.

```ts
const read = Atomics.load(control, READ_INDEX);
const published = Atomics.load(control, PUBLISHED_INDEX);
const available = published - read;
if (available <= 0) return 0;
const count = Math.min(available, MAX_BATCH_SIZE); // 512
for (let i=0;i<count;i++) { logical=read+i; slot=logical%capacity; decode type/tabId/windowId/tsHigh/tsLow/value0/value1; increment per-type counters; build StoredTabEvent id=`${ts}-${tabId}-${logical}` }
Atomics.store(control, READ_INDEX, read+count);
update occupancy/peak/lastProcessedAt/droppedEvents;
enrich with tabMeta url; getDb().then(db => bulkInsertEvents(db, enriched)).catch(e => logger.warn("bulkInsert failed", {error:e}))
```

- Advance `READ_INDEX` only after the batch is read.
- Persist async — do not block drain on `bulkPut`.

### Encode / Decode

```ts
export function encodeEvent(events: Int32Array, slot: number, event: TabEvent) {
  const base = slot * EVENT_SLOT_SIZE;
  Atomics.store(events, base+0, EventTypeToValue[event.type]);
  Atomics.store(events, base+1, event.tabId);
  Atomics.store(events, base+2, event.windowId);
  Atomics.store(events, base+3, 0);
  Atomics.store(events, base+4, Math.floor(event.timestamp / 2**32));
  Atomics.store(events, base+5, event.timestamp | 0);
  Atomics.store(events, base+6, event.metadata?.scrollY ?? event.metadata?.x ?? 0);
  Atomics.store(events, base+7, event.metadata?.y ?? 0);
}
export function decodeEvent(events: Int32Array, slot: number): TabEvent {
  const base = slot * EVENT_SLOT_SIZE;
  const typeVal = Atomics.load(events, base+0);
  const tsHigh = Atomics.load(events, base+4), tsLow = Atomics.load(events, base+5);
  return { type: ValueToEventType[typeVal], tabId: Atomics.load(events, base+1), windowId: Atomics.load(events, base+2), timestamp: tsHigh * 2**32 + (tsLow>>>0) };
}
```

---

## 8. Drop Accounting & Stats

Dropped events are first-class. `pushEvent` returning `false` increments `droppedEvents`.

```ts
// packages/shared/src/protocol.ts
export interface StatsSnapshot {
  totalEvents: number;
  tabCreated: number; tabActivated: number; tabUpdated: number; tabRemoved: number;
  navigation: number;
  pageVisible: number; pageHidden: number;
  scroll: number; click: number; keyActivity: number;
  eventsProcessed: number; droppedEvents: number;
  bufferCapacity: number; bufferOccupancy: number; peakBufferOccupancy: number;
  lastProcessedAt: number;
}
export const createEmptyStats = (capacity: number): StatsSnapshot => ({ ... });
```

- Producer owns `droppedEvents`; consumer owns per-type counts + `eventsProcessed` + occupancy/peak.
- `getMergedStats()` merges live occupancy (`Atomics.load(control,0)-Atomics.load(control,1)`) with `latestStats`.
- Dashboard must surface `Dropped / Occupancy / Peak`.
- `100k processed / 0 dropped` ≠ `100k processed / 18k dropped`.

---

## 9. Dexie (IndexedDB) Persistence

**Boundary:** downstream of SAB, not on the hot path. Batch only.

```text
SAB → drain (bounded 512) → StoredTabEvent[] → bulkPut → IndexedDB
```

### Schema

```ts
// packages/shared/src/db.ts
export interface StoredTabEvent { id: string; type: TabEventType; tabId: number; windowId: number; timestamp: number; url?: string; metadata?: {x?:number; y?:number; scrollY?:number}; }
// ponytail: kept for compat — Dexie uses stores() string, not JSON schema
export const storedTabEventSchema = { version:0, primaryKey:"id", required:["id","type","tabId","windowId","timestamp"], indexes:["timestamp","type","tabId"], ... } as const;

export class TabotDatabase extends Dexie {
  events!: Table<StoredTabEvent, string>;
  constructor(name="tabot_events") { super(name); this.version(1).stores({ events: "id, timestamp, type, tabId" }); }
}
const DB_NAME = "tabot_events";
export const createEventsDb = (): Promise<TabotDatabase> // singleton, deletes legacy tabot_rxdb, open()
export const bulkInsertEvents = (db: TabotDatabase, docs: StoredTabEvent[]) => db.events.bulkPut(docs) // BulkError partial → logger.warn, successes committed
export const countEvents = (db: TabotDatabase) => db.events.count()
export const getAllEvents = (db: TabotDatabase) => db.events.toArray()
```

### Policy

- `bulkPut` per batch (not per event). `MAX_BATCH_SIZE=512` / `BATCH_PERSIST_SIZE` single constant.
- Advance `READ_INDEX` before `await bulkPut` — never stall drain. Errors via `logger.warn`.
- `url` resolved from `tabMeta` at drain time; `metadata` optional numbers only.
- Legacy cleanup: `indexedDB.deleteDatabase("tabot_rxdb")` on first open.
- Dexie requires `indexedDB` in global scope — background service worker satisfies it. If a future Blob worker lacks it, isolate Dexie init to the context that has it.

---

## 10. Protocol & Messaging

### Internal protocol

```ts
export const MSG = { BUFFER_READY: "BUFFER_READY", STATS_UPDATE: "STATS_UPDATE", STOP: "STOP" } as const;
// PROCESS_BATCH not needed — wakeup is via control state (polling in MV3)
interface BufferReadyMessage { type: typeof MSG.BUFFER_READY; buffer: SharedArrayBuffer; capacity: number; }
```

### Extension ↔ UI

Single channel, no new transport. Never push raw events — only `StatsSnapshot` / counts.

```ts
// background.ts — both chrome.runtime.onMessage and onMessageExternal
if (message?.type === "GET_STATS") { sendResponse(getMergedStats()); return false; }
if (message?.type === "GET_COUNTS") {
  getDb().then(db => countEvents(db)).then(dexieCount => sendResponse({ dexieCount, rxdbCount: dexieCount }));
  return true; // async
}
if (message?.kind === "TABOT_PAGE_EVENT") { push(t, tabId, windowId, metadata); return false; }
```

- Sync handlers (`GET_STATS`, `TABOT_PAGE_EVENT`) return `false`; only async `GET_COUNTS` returns `true`. Guard every `sendResponse` in `try{}`; `message?.type` null-safe.
- Popup (`chrome.runtime.sendMessage`) and dashboard (`chrome.runtime.sendMessage(extensionId, ...)`) share the contract. Dashboard reads `extensionId` from `localStorage["tabot_extension_id"]` if needed and degrades gracefully when not installed.
- `externally_connectable` in manifest: `["http://localhost:3000/*", "https://tabot.example/*"]` (update when origin is known). Requires `permissions: [tabs, webNavigation]` + `host_permissions: ["<all_urls>"]`.

---

## 11. Extension Wiring

**Background (`background.ts`):** single SAB producer. Subscribes `chrome.tabs.onCreated/onActivated/onUpdated/onRemoved` + `chrome.webNavigation.onCommitted` (frameId 0), maintains `tabMeta`, pushes to SAB, drains via polling, enriches + `bulkPut` to Dexie, serves `GET_STATS`/`GET_COUNTS` on both `onMessage` and `onMessageExternal`.

**Content script (`contents/tabot.ts`):** collects `scroll`/`click`/`keydown`/`visibilitychange`, Pacer-throttles high-freq, sends `{kind:"TABOT_PAGE_EVENT", type, metadata}` — never writes SAB.

**Logger:** `packages/shared/src/logger.ts` — `logger.warn/info/debug/error` with `[Tabot]` prefix; used in `db.ts` (`createEventsDb failed`, `bulkPut partial/failed`, `countEvents failed`) and `background.ts` (`bulkInsert failed`).

---

## 12. UI Surfaces

### Popup (`apps/extension/popup.tsx`)

Minimal + full `StatsSnapshot`:

- `Events captured` (`totalEvents`), `Events processed` (`eventsProcessed`), `Worker status: Running`, `Last event` (ago)
- Breakdown: 10 types in 2-col grid
- Metrics: `Dropped / Occupancy N/Capacity / Peak` + `Dexie (IndexedDB) persisted: dexieCount`
- Polls `GET_STATS` + `GET_COUNTS` every 1s via `fetchStatsHelper(setStats, setDexieCount)` (extracted helper; handles `dexieCount ?? rxdbCount` compat). BoldKit-like inline theme.

### Dashboard (`apps/web/src/routes/index.tsx`)

Scope: `setup.md` §9 + full breakdown.

- Overview cards: `Events` / `Processed` / `Dropped` / `Dexie (IndexedDB)` count
- Breakdown: 10 types (5-col grid), `Occupancy / Peak / Last event`
- Header: `Connected / No extension` dot (lime vs zinc)
- Fallback when `chrome.runtime.sendMessage` absent: placeholder + hint + extension-ID input (`localStorage["tabot_extension_id"]` → Save)
- Actions: `Refresh`
- Reads `GET_STATS` + `GET_COUNTS` (compat `dexieCount ?? rxdbCount`) on 1s poll.

No auth, no backend API, no cloud DB. Dashboard polls; no push needed for V1.

---

## 13. Storage Architecture

```text
1. SharedArrayBuffer   Transient ring buffer (10k × 32B)
        ↓
2. Background drain    Decode / normalize / batch (512) + tabMeta enrich
        ↓
3. Dexie (IndexedDB)   Persistent local history — DB tabot_events, table events (id PK, indexes timestamp/type/tabId)
```

Roles: SAB transports, Atomics coordinates, background drains+batches, Dexie persists, dashboard reads derived state.

---

## 14. File Map

```text
packages/shared/src/db.ts              Dexie TabotDatabase + createEventsDb/bulkInsertEvents/countEvents/getAllEvents
packages/shared/src/index.ts           barrel
apps/extension/background.ts           SAB + drain + Dexie batch + messaging (inline, no Blob worker)
apps/extension/contents/tabot.ts       content script + Pacer
apps/extension/popup.tsx               popup UI
apps/extension/package.json            manifest + dexie dep + externally_connectable
apps/web/src/routes/index.tsx          dashboard route
```

---

## 15. Local Development

```bash
pnpm install
pnpm --filter extension dev        # Plasmo dev
pnpm --filter web dev              # TanStack Start (port 3000)
pnpm build                         # both
pnpm lint / pnpm lint:fix          # Biome
pnpm --filter extension build      # chrome-mv3 prod → apps/extension/build/chrome-mv3-prod
pnpm --filter extension exec tsc --noEmit
```

Chrome: `chrome://extensions` → Developer mode → Load unpacked `build/chrome-mv3-prod` → popup + service-worker console → `http://localhost:3000` shows Dexie count.

---

## 16. Constraints

1. Single producer — content scripts never write SAB.
2. No variable-length strings in SAB; `url` in `tabMeta`, resolved at persist time.
3. No key contents / typed text / password / DOM snapshot — `KEY_ACTIVITY` occurrence only.
4. `Atomics` coordinates ring buffer; `READ_INDEX` advances only after batch read.
5. Pacer only at content-script boundary for high-freq shaping.
6. Dexie (IndexedDB) is downstream, batched (`bulkPut`) — never on hot SAB path.
7. UI never consumes raw stream — only `StatsSnapshot` (+ optional `dexieCount`).
8. No synthetic events in product path — real browser activity only.
9. `chrome.runtime.onMessage` async contract: sync → `return false`, async `GET_COUNTS` → `return true`.
10. Service workers cannot `Atomics.wait` — polling (microtask + 50ms burst + 200ms fallback) is the wakeup.
11. No backend / auth / cloud ingestion.

---

## 17. Definition of Done

- [ ] Plasmo extension loads in Chrome.
- [ ] `chrome.tabs` + `webNavigation` events captured; content script captures `PAGE_VISIBLE/HIDDEN/SCROLL/CLICK/KEY_ACTIVITY` (Pacer-shaped).
- [ ] Content scripts never write SAB; background is single producer.
- [ ] 10 event types, fixed 32-byte slots, `SharedArrayBuffer` ring buffer with monotonic logical indexes + modulo physical slots.
- [ ] Producer publishes only after fully written; consumer reads only via `publishedIndex`.
- [ ] Polling wakeup (not tight loop); overflow detected; `droppedEvents` counted and surfaced.
- [ ] Bounded batches (512) decoded, per-type stats + `eventsProcessed/droppedEvents/occupancy/peak/lastProcessedAt` maintained.
- [ ] Batch persist to Dexie via `bulkPut` (not per-event); `url` from `tabMeta`; no variable strings in SAB.
- [ ] `packages/shared/src/db.ts` exposes `StoredTabEvent` + `TabotDatabase` + `createEventsDb`/`bulkInsertEvents`/`countEvents`.
- [ ] `GET_STATS` returns `StatsSnapshot` consistent with `GET_COUNTS` (`dexieCount`) and in-memory aggregation.
- [ ] Popup shows full breakdown + `dropped/occupancy/peak` + Dexie count; polls `GET_STATS`/`GET_COUNTS` (1s).
- [ ] Dashboard shows overview cards + breakdown + dropped/occupancy + Dexie count via `externally_connectable` (graceful fallback).
- [ ] No raw events through messaging or to hosted server.
- [ ] `pnpm lint` + `pnpm --filter extension exec tsc --noEmit` + `pnpm --filter extension build` pass; manual load shows live browsing events in both surfaces.

### Legacy checks (from split specs — already covered above, kept for traceability)

Event+SAB: all 10 types, Pacer shaping, binary slots, monotonic ring, `publishedIndex`, bounded batches, downstream batch persistence, no raw events to dashboard, sustained real-browsing stream.

Persistence+Dashboard: `db.ts` valid, `bulkPut` batching, `GET_STATS`/`GET_COUNTS` wired, `externally_connectable`, popup + dashboard DoD, no cloud.

---

## 18. Engineering Principle

> **Collect real browser telemetry, process it off the main/UI thread using shared memory and worker-based concurrency, and reduce the raw event stream into structured local state that can later support digital-workflow analysis.**

Next layer (out of V1): `Dexie (IndexedDB) (local history) → sessions / sequences → digital workflow representation → workflow intelligence → automation recommendations`.

---

## 19. Out of Scope (V1)

AI, auth, cloud storage, remote ingestion, user accounts, payments, productivity scoring, ML, complex analytics, backend API for browser data, Redis/Kafka/vector DB, server-side ingestion, multi-user. Prove `browser → shared memory → local persistence → aggregation → UI` first, with real high-volume activity.

---

## 20. History

- `2026-08-22` — Consolidation. Dexie replaces RxDB (source of truth). Service-worker polling model documented (no `Atomics.wait`). `tech.md` supersedes the three docs.
