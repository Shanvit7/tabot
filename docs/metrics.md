# Metrics — Events Captured & Associated Data

What Tabot tracks and what data each event carries, as implemented. This only lists what is **available** from the current pipeline — nothing inferred, no derived/analysis fields.

Source of truth:
- Event types: `packages/shared/src/events.ts` (`EVENT_TYPES`)
- Persistence schema: `packages/shared/src/db.ts` (`StoredTabEvent`)
- Page-event collection: `apps/extension/contents/tabot.ts`
- Tab/navigation collection + drain: `apps/extension/background.ts`

---

## All event types (10)

Each of the 10 tracked events is captured either by the background service worker (tab/navigation lifecycle) or by the content script (in-page activity).

| Event type | Source / trigger | Metadata attached |
|---|---|---|
| `TAB_CREATED` | `chrome.tabs.onCreated` | none |
| `TAB_ACTIVATED` | `chrome.tabs.onActivated` | none |
| `TAB_UPDATED` | `chrome.tabs.onUpdated` | none |
| `TAB_REMOVED` | `chrome.tabs.onRemoved` | none (windowId = 0 sentinel) |
| `NAVIGATION` | `chrome.webNavigation.onCommitted` (frameId 0) | none |
| `PAGE_VISIBLE` | content script `visibilitychange` (→ visible) | none |
| `PAGE_HIDDEN` | content script `visibilitychange` (→ hidden) | none |
| `SCROLL` | content script window + nested scrollable elements | `scrollY` |
| `CLICK` | content script global `click` listener | `x`, `y` |
| `KEY_ACTIVITY` | content script global `keydown` (throttled) | none |

---

## Data associated with every stored event

Every event is persisted to IndexedDB (`StoredTabEvent`) with these fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | `"${timestamp}-${tabId}-${logicalIndex}"` (primary key) |
| `type` | string | One of the 10 event types above |
| `tabId` | number | Chrome tab ID the event occurred in |
| `windowId` | number | Chrome window ID (0 for `TAB_REMOVED` / `NAVIGATION` / page events in some paths — see notes) |
| `timestamp` | number | Event time, ms since epoch (`Date.now()` on capture) |
| `url` | string (optional) | Page URL, enriched at drain time from in-memory `tabMeta` if known |
| `metadata` | object (optional) | Per-type numeric fields — see below |

Only `TAB_CREATED`, `TAB_UPDATED`, and `TAB_REMOVED` update the in-memory `tabMeta` map (also holds `title`, not persisted) that supplies the `url` enrichment.

### `metadata` per type

| Type | `metadata` fields |
|---|---|
| `SCROLL` | `scrollY` (viewport or nested-container scroll offset at event time) |
| `CLICK` | `x`, `y` (client coordinates) |
| all others | no metadata |

---

## IndexedDB structure (`tabot_events` DB)

Dexie table `events` — schema (`packages/shared/src/db.ts`):

```ts
events: "id, timestamp, type, tabId"
```

- `id` is the primary key (inbound, auto-keyed by Dexie).
- Indexed (queryable via `where()`): `timestamp`, `type`, `tabId`.
- `windowId`, `url`, `metadata` are stored but **not indexed**.

The `metadata` object is limited to `{ x?, y?, scrollY? }` — all numbers.

---

## Collection notes (implementation details)

- **SCROLL**: throttled at 150 ms (Pacer). Fires on the window viewport and on any nested element whose `overflowY` is `auto`/`scroll` and is actually scrollable (`scrollHeight > clientHeight`). `scrollY` is the scroll offset of the scrolling node (viewport = `documentElement.scrollTop`, nested = `el.scrollTop`).
- **CLICK**: fires for every `click` event on the document, unthrottled. Coordinates are `clientX`/`clientY`.
- **KEY_ACTIVITY**: fires on `keydown`, throttled at 150 ms. **No key value / char / code is captured** — only that activity occurred.
- **No text, input contents, passwords, or DOM snapshots are ever captured.**
- **PAGE_VISIBLE / PAGE_HIDDEN**: based on `document.visibilitychange` — no `vocabulary` of why, just the state transition.

---

## Aggregate counters (`StatsSnapshot`)

The dashboard/popup only consume aggregated counts — a running sum per event type plus pipeline health numbers. These are derived from the same 10 event types:

`totalEvents`, `tabCreated`, `tabActivated`, `tabUpdated`, `tabRemoved`, `navigation`, `pageVisible`, `pageHidden`, `scroll`, `click`, `keyActivity`, `eventsProcessed`, `droppedEvents`, `bufferCapacity`, `bufferOccupancy`, `peakBufferOccupancy`, `lastProcessedAt`.

No per-event raw data leaves the extension; the UI sees only these counts.
