# Tabot — Export & Evaluation Spec

Milestone plan (from `docs/export-prompt-spec.md`). Makes the telemetry and the derived
intelligence observable, exportable, and ready for real-world evaluation — **without adding
intelligence**. Extension stays the single source of truth for raw telemetry.

---

## Operating Principles

1. **Extension = source of truth** for raw events. Never derive in the background.
2. **Reuse `@tabot/shared` pure functions** in the web layer. No new derivation logic.
3. **No new telemetry, cloud, LLM, or background derivation** in this milestone.
4. **JSONL + manifest is canonical.** CSV is optional convenience only, and only if trivial.
5. **Derived layers are disposable** — always rebuildable from raw events.

---

## Part A — Data Transport: `GET_EVENTS`

The web app must read raw events before it can derive or export.

### 1. Protocol

Add to `packages/shared/src/protocol.ts`:

```ts
export const MSG = {
  // ...existing...
  GET_EVENTS: "GET_EVENTS", // NEW
};

export interface GetEventsMessage {
  type: typeof MSG.GET_EVENTS;
  limit?: number;   // max events to return (default: all)
  since?: number;   // epoch ms — return events with timestamp >= since
}
```

Response: `StoredTabEvent[]` (already exported from `@tabot/shared`).

### 2. Background handler

Add to `apps/extension/background.ts`, in **both** the internal
`chrome.runtime.onMessage` and external `chrome.runtime.onMessageExternal` listeners
(the dashboard uses the external path):

```ts
if (message?.type === MSG.GET_EVENTS) {
  getDb()
    .then((db) => getAllEvents(db, message.limit, message.since))
    .then((events) => sendResponse(events))
    .catch(() => sendResponse([]));
  return true; // async
}
```

Lazy note: `getAllEvents` already exists in `@tabot/shared` (`db.ts`) — no new
read logic. If a `since` filter needs a Dexie index query, use the existing
`getAllEvents` shape and extend it with one optional `since` param. No new deps.

### 3. Web client helper

One function in the web app (alongside the existing `tryGetStats` in `metrics.tsx`),
handling both the external-ID and no-ID message paths, with the same 800ms
timeout + null fallback pattern. `ponytail:` — lives in the route until the page
needs more shared transport, then promote to `~/utils/`.

---

## Part B — Metrics Page → Browser-Activity Explorer

Revamp `apps/web/src/routes/metrics.tsx` into tabbed sections. Same polling
(1s for pipeline stats, longer for derived layers) — no realtime fan-out.

### Sections

| Tab | Content | Source |
|---|---|---|
| **Pipeline** | Existing raw stats + breakdown + buffer (keep as-is) | `GET_STATS` / `GET_COUNTS` (existing) |
| **Sessions** | Recent sessions: start/end, duration, domains, interaction/nav/switch counts | `sessionize` over `GET_EVENTS` events |
| **Contexts** | Recent contexts: primary domain, session count, domains, recurrence | `buildContexts` over sessions |
| **Memories** | Recurrent + single memories: signature, strength, observation, staleness | `buildMemories` over contexts |
| **Live Context** | Current URL/tab, interaction intensity, related contexts/memories | `buildLiveContext` + `getCurrentBrowserContext` |
| **Export** | Trigger + format picker (JSONL canonical, CSV optional) | Part C |

### Data flow in the web app

```
GET_EVENTS ──► StoredTabEvent[]
                 ├─ sessionize()        → Session[]
                 ├─ buildContexts()     → BrowserContext[]
                 │                        └─ buildMemories() → Memory[]
                 └─ buildLiveContext()  → LiveBrowserContext
```

All pure functions already exist in `@tabot/shared` (`sessions.ts`, `contexts.ts`,
`memories.ts`, `live-context.ts`, `retrieval.ts`). `ponytail:` keep a lazy
in-memory derivation in the route (or a tiny hook) — no derived-layer persistence
in V1; rebuild on demand from fetched events.

---

## Part C — Portable Export

### Canonical format: JSONL + manifest

One self-describing, line-delimited dataset. Every record is one JSON object per
line; the manifest is the first line and is authoritative about schema versions.

```
{
  "manifest": {
    "format": "tabot-export",
    "version": 1,
    "exportedAt": "2026-08-25T12:00:00.000Z",
    "source": "tabot-web@0.0.1",
    "telemetrySchemaVersion": 1,   // raw event schema
    "derivationSchemaVersion": 1,  // sessions/contexts/memories schema
    "thresholds": {                // derivation params, for reproducibility
      "session": { "inactivityThresholdMs": 300000, "visibilityGapThresholdMs": 120000 },
      "context": { "gapThresholdMs": 1800000, "overlapThreshold": 1 },
      "memory": { ... }
    },
    "counts": {
      "events": 1234, "sessions": 56, "contexts": 12, "memories": 4
    },
    "coverage": { "firstEventAt": "...", "lastEventAt": "..." }
  }
}
{"type": "event", "id": "...", "ts": 1724512345678, "tabId": 5, "windowId": 1, "eventType": "NAVIGATION", "url": "https://github.com/..."}
{"type": "event", ...}
{"type": "session", "id": "...", "start": ..., "end": ..., "durationMs": ..., "eventCount": ..., "interactionCount": ..., "domains": ["github.com", ...], "tabSwitchCount": ...}
{"type": "context", "id": "...", "start": ..., "end": ..., "sessionCount": 3, "primaryDomain": "github.com", "domains": [...]}
{"type": "memory", "id": "...", "kind": "recurrent", "signature": "github.com+slack.com", "strength": 6, "observation": "visited github.com and slack.com across 3 activity periods", "contextIds": [...]}
```

- **Manifest is mandatory.** It carries schema + threshold versions so the dataset
  stays reproducible and independently analyzable — matching the prompt's
  "capture derivation/schema version and enough metadata" requirement.
- **Preserve existing shared types/semantics.** The export serializes the canonical
  shapes from `@tabot/shared` (`StoredTabEvent`, `Session`, `BrowserContext`,
  `Memory`, `LiveBrowserContext`) directly — no second derived-data model, no
  reshaped convenience records. Schema-version fields in the manifest describe
  these types, they do not redefine them.
- **Event lines carry full canonical event data** (id, tab, window, ts, type, url,
  metadata) — this is the raw telemetry, kept intact.
- Derived lines reference events via their ids where natural (session → events in
  `eventSequence` ids; context → sessionIds; memory → contextIds), so provenance
  is traceable.

### Optional: CSV convenience

Only if trivial — e.g. flatten sessions or contexts to one row each. Never
canonical. Skipped entirely if it costs more than ~20 lines.

### Implementation (web layer, no deps)

```ts
// serialize
const dataset = [manifestLine, ...eventLines, ...sessionLines, ...];
const blob = new Blob([dataset.join("\n")], { type: "application/x-ndjson" });
const url = URL.createObjectURL(blob);
// trigger download: <a download="tabot-export-2026-08-25.jsonl" href={url}>
```

`Blob` + `URL.createObjectURL` is native — no library needed. File name includes
date. Single "Export" button on the Export tab.

---

## Part D — Acceptance Criteria

1. `GET_EVENTS` returns raw `StoredTabEvent[]` to the web app (internal + external paths).
2. Metrics page shows Pipeline, Sessions, Contexts, Memories, Live Context, Export.
3. Derived tabs render real data from the shared pure functions — not empty states.
4. Export produces a JSONL dataset: manifest line + events + sessions + contexts + memories.
5. Manifest includes: export timestamp, source version, telemetry + derivation schema versions, thresholds, counts, coverage.
6. Re-import test: consuming the JSONL with the same threshold constants reproduces identical derived layers (rebuildability).
7. Optional CSV (if built) is clearly marked non-canonical.
8. No new telemetry, cloud storage, LLM, or background derivation introduced.

---

## Definition of Done

- [ ] `GET_EVENTS` wired (protocol + background internal/external + web client helper)
- [ ] Metrics page revamped with 6 sections
- [ ] JSONL export works, manifest correct
- [ ] Optional CSV (only if trivial)
- [ ] Rebuildability spot-checked (AC 6)
- [ ] `pnpm lint` green, `tsc --noEmit` green

---

## Out of Scope (this milestone)

- No LLM, no intent, no semantic enrichment (future phases)
- No cloud backend / sync (V1 stays local)
- No background derivation in the extension
- No derived-layer persistence in the web app
- No charts/visualizations beyond simple lists (can add later if evaluation needs them)
