# Tabot — Setup

## 1. Project Goal

Tabot is an engineering-first Chrome extension + web dashboard project for collecting and processing browser activity events at high volume.

The long-term purpose is to build a structured representation of a user's digital workflow. That data may later be used to identify recurring workflows and recommend or configure automation, including an AI tooling stack.

**V1 does not implement workflow intelligence or automation.**

### V1 outcome

V1 should prove one complete pipeline:

```text
Chrome Extension
    ↓
Browser activity events
    ↓
SharedArrayBuffer + Atomics
    ↓
Web Worker
    ↓
Event aggregation
    ↓
TanStack Start dashboard
```

The first version is **not** a productivity product. It is an engineering prototype that proves the event pipeline works reliably.

---



## 2. Stack

- **Chrome Extension:** Plasmo
- **Web App:** TanStack Start
- **Language:** TypeScript
- **Package Manager:** pnpm
- **Worker:** Web Worker
- **Concurrency / memory:** `SharedArrayBuffer`, `Atomics`
- **Local event store:** RxDB
- **UI:** React
- **Styling:** Tailwind CSS
- **Charts:** Tanstack Charts
- **Backend:** None
- **Database:** None

---



## 3. Monorepo Structure

```text
tabot/
├── apps/
│   ├── extension/
│   │   ├── background.ts
│   │   ├── workers/
│   │   │   └── event-worker.ts
│   │   ├── popup.tsx
│   │   └── ...
│   │
│   └── web/
│       ├── src/
│       │   ├── routes/
│       │   ├── components/
│       │   └── ...
│       └── ...
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── events.ts
│       │   ├── buffer.ts
│       │   ├── protocol.ts
│       │   └── db.ts
│       └── package.json
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

The exact Plasmo-generated structure can differ. Do not fight the framework unnecessarily; keep the conceptual separation above.

---



## 4. V1 Event Model

Collect real browser activity events from the user's Chrome session.

The extension is the local data source. V1 should not use synthetic data as its primary source.

Synthetic event generation is allowed only as a development/load-testing mechanism for validating the high-volume processing path.

### Events

```ts
type TabEventType =
  | "TAB_CREATED"
  | "TAB_ACTIVATED"
  | "TAB_UPDATED"
  | "TAB_REMOVED";
```

Each event should retain enough information to reconstruct browser activity later:

```ts
interface TabEvent {
  type: TabEventType;
  tabId: number;
  timestamp: number;
  windowId: number;
  url?: string;
}
```

`url` is useful because the eventual analytical unit is the user's digital workflow. It allows later processing to derive domains, sessions, sequences, and workflow patterns.

For V1, do not put variable-length strings directly into the `SharedArrayBuffer`.

The shared-memory representation should use fixed-size numeric fields. URL/title metadata can be maintained outside the binary event ring buffer and associated with the tab ID.

---



## 5. SharedArrayBuffer Design

Use a fixed-size ring buffer.

Conceptually:

```text
SharedArrayBuffer
┌─────────────────────────────────────────────┐
│ Control Region                              │
│                                             │
│ writeIndex                                  │
│ readIndex                                   │
│ capacity                                    │
├─────────────────────────────────────────────┤
│ Event Region                                │
│                                             │
│ [event 0] [event 1] [event 2] ... [event N]│
└─────────────────────────────────────────────┘
```

The control region is accessed through an `Int32Array`.

Example:

```ts
const control = new Int32Array(buffer, 0, CONTROL_SLOTS);
```

Use `Atomics` for shared index operations.

The event region should use typed arrays rather than allocating JavaScript objects for every event.

---



## 6. Producer / Consumer



### Producer

The extension background context receives Chrome events.

Its job is deliberately small:

1. Receive Chrome event.
2. Convert it into the numeric event representation.
3. Reserve a ring-buffer slot.
4. Write the event.
5. Notify the worker.

Conceptually:

```text
Chrome event
    ↓
encode
    ↓
reserve slot with Atomics
    ↓
write event
    ↓
Atomics.notify()
```

Do not perform aggregation in the background context.

---



### Consumer

The Web Worker owns event processing.

Its job:

1. Wait for new events.
2. Read events from the ring buffer.
3. Decode them.
4. Update in-memory aggregates.
5. Periodically publish an aggregated snapshot.

Conceptually:

```text
Atomics.wait()
    ↓
read events
    ↓
aggregate
    ↓
publish snapshot
```

The worker should absorb bursts of events without blocking the extension UI.

---



## 7. V1 Event Storage and Aggregation

Raw events must be persisted locally in V1.

The `SharedArrayBuffer` is **only a transient high-speed ingestion buffer**. It is not the event store.

After the Worker consumes events from the ring buffer, it batches them and writes them to **RxDB**, which acts as Tabot's local event database.

```text
Chrome event
    ↓
SharedArrayBuffer
    ↓
Atomics
    ↓
Worker
    ↓
batch
    ↓
RxDB
    ↓
local event history
```



### RxDB event document

A stored event should contain at minimum:

```ts
interface StoredTabEvent {
  id: string;
  type: TabEventType;
  tabId: number;
  windowId: number;
  timestamp: number;
  url?: string;
}
```

The `id` should uniquely identify the event.

RxDB should retain the raw normalized events so that future versions can reconstruct:

- sessions
- domain timelines
- tab sequences
- workflow patterns

V1 aggregation can still maintain lightweight in-memory counters for the dashboard:

```ts
interface EventStats {
  totalEvents: number;
  tabCreated: number;
  tabActivated: number;
  tabUpdated: number;
  tabRemoved: number;
}
```

The purpose of V1 aggregation is to prove that raw browser telemetry can be processed and persisted without pushing every event into the UI.

Do not attempt to infer productivity, workflow quality, or automation opportunities yet.

Track:

```ts
interface EventStats {
  totalEvents: number;
  tabCreated: number;
  tabActivated: number;
  tabUpdated: number;
  tabRemoved: number;
}
```

Also maintain:

```ts
interface WorkerStats {
  eventsProcessed: number;
  lastProcessedAt: number;
}
```

The dashboard should eventually receive something like:

```json
{
  "totalEvents": 12432,
  "tabCreated": 312,
  "tabActivated": 4821,
  "tabUpdated": 6912,
  "tabRemoved": 387,
  "eventsProcessed": 12432
}
```

This is enough for V1.

---



## 8. Extension UI

The popup should be intentionally minimal.

Display:

```text
Tabot

Events captured
12,432

Events processed
12,432

Worker status
● Running

Last event
2 seconds ago
```

Add a small control:

```text
[ Generate Test Events ]
```

This is important for development.

The button should generate a configurable burst of synthetic events so the pipeline can be tested without manually opening thousands of tabs.

For example:

```text
Generate:
[ 10,000 ] events
```

---



## 9. TanStack Start Dashboard

The web app is the visual surface for the processed data.

V1 only needs:

### Overview

```text
Tabot

┌─────────────────┐
│ Events          │
│ 12,432          │
└─────────────────┘

┌─────────────────┐
│ Processed       │
│ 12,432          │
└─────────────────┘

┌─────────────────┐
│ Worker          │
│ Running         │
└─────────────────┘
```

Then an event breakdown:

```text
TAB_ACTIVATED     4,821
TAB_UPDATED       6,912
TAB_CREATED         312
TAB_REMOVED         387
```

Do not build authentication, database persistence, user accounts, or a complicated dashboard in V1.

---



## 10. Communication Between Extension and Web

The extension is the source of truth for browser activity and live event processing.

RxDB is the source of truth for the persisted local event history.

The TanStack Start dashboard is a hosted web application. It does not have direct access to `chrome.storage`, the extension worker, RxDB, or the SharedArrayBuffer.

Communication therefore happens through the browser's extension messaging/connection mechanism.

The basic flow is:

```text
TanStack Start Dashboard
        │
        │ request stats
        ▼
Tabot Extension
        │
        │ read aggregated state
        ▼
Web Worker
        │
        │ process events
        ▼
SharedArrayBuffer
```

The dashboard receives a periodic or on-demand aggregated snapshot rather than every raw event.

Example:

```text
Dashboard
    │
    │ "GET_STATS"
    ▼
Extension
    │
    │ query RxDB / read local aggregate
    ▼
Extension
    │
    │ { totalEvents: 12432, ... }
    ▼
Dashboard
```

The dashboard should **never consume the raw high-volume event stream**.

If the dashboard later needs historical event data, the extension can expose explicit query operations through the same messaging bridge. The hosted TanStack Start server still does not receive or persist browser activity data.

The hosted TanStack Start server is only responsible for serving the application in V1. It does not need an API endpoint or database for browser activity data.

This keeps the data path local:

```text
Chrome activity
    ↓
Extension
    ↓
Worker
    ↓
Aggregated state
    ↓
Extension ↔ Hosted Dashboard
```

No browser activity data needs to be uploaded to Tabot's infrastructure.

---



## 11. Local Development

Install dependencies:

```bash
pnpm install
```

Run the extension:

```bash
pnpm --filter extension dev
```

Run the web app:

```bash
pnpm --filter web dev
```

Build everything:

```bash
pnpm build
```

The exact commands can be adjusted to match the generated Plasmo and TanStack Start projects.

---



## 12. Chrome Extension Development

Build the Plasmo extension:

```bash
pnpm --filter extension build
```

Then:

1. Open Chrome.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Load the generated extension build.
5. Open the Tabot popup.
6. Trigger browser activity.
7. Confirm events are captured.
8. Generate synthetic events.
9. Confirm worker processing.

---



## 13. V1 Definition of Done

V1 is complete when all of these work:

- [ ] Plasmo extension loads in Chrome.
- [ ] Chrome tab events are captured.
- [ ] Events are encoded into a fixed-size binary representation.
- [ ] `SharedArrayBuffer` is used as the event buffer.
- [ ] `Atomics` controls producer/consumer indexes.
- [ ] Web Worker consumes events.
- [ ] Worker maintains event statistics.
- [ ] Worker batches normalized events into RxDB.
- [ ] Raw events persist locally in RxDB.
- [ ] Synthetic event generation can produce a large burst.
- [ ] No raw event objects are pushed through the UI.
- [ ] Aggregated statistics are exposed to the UI.
- [ ] TanStack Start dashboard displays the statistics.
- [ ] A burst of 10,000+ events can be processed successfully.

---



## 14. Explicitly Out of Scope for V1

Do **not** add:

- AI
- Authentication
- Database
- Cloud data storage
- Remote event ingestion
- User accounts
- Payments
- Productivity scoring
- ML classification
- Complex analytics
- Backend API for browser data
- Redis
- Kafka
- Vector database
- Server-side event ingestion
- Multi-user architecture

The goal is to make the **browser → shared memory → worker → aggregation → UI** pipeline solid first.

---



## 15. Storage Architecture

V1 has three distinct layers:

```text
1. SharedArrayBuffer
   Transient high-speed ring buffer
              ↓
2. Web Worker
   Decode / normalize / batch
              ↓
3. RxDB
   Persistent local event history
```

Do not confuse the roles:

- **SharedArrayBuffer:** transports events between producer and consumer.
- **Atomics:** coordinates access to the shared ring buffer.
- **Worker:** processes and batches events.
- **RxDB:** persists the normalized raw events locally.
- **TanStack Start:** displays derived state through extension messaging.

No raw browser activity is uploaded to a Tabot server in V1.

## 15. Engineering Principle

Tabot V1 should demonstrate one idea clearly:

> **Collect real browser telemetry, process it off the main/UI thread using shared memory and worker-based concurrency, and reduce the raw event stream into structured local state that can later support digital-workflow analysis.**

The eventual direction is:

```text
Browser events
    ↓
Sessions / sequences
    ↓
Digital workflow representation
    ↓
Workflow intelligence
    ↓
Automation recommendations / configuration
```

V1 stops at the structured event-processing layer.

Everything above that is future work.