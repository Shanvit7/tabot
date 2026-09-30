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
  ├-> extension popup or local dashboard
  └-> optional: extension relay -> Cloudflare MCP Worker -> ChatGPT
```

Raw telemetry stays on device; the optional ChatGPT integration sends sanitized, derived context on tool requests. The Worker holds OAuth/installation routing state, not browser history. There is no Tabot account, cloud sync, page-content capture, typed-text capture, Tabot-hosted LLM, embedding store, or task/intent inference. See [MCP relay development and connection](../apps/mcp-server/README.md).

Only raw normalized browser events are durable as browser data. Derived results are rebuilt from those events, so changing a derivation algorithm does not require migrating derived tables. The separate relay persists authentication/installation state.

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

`apps/web/src/routes/home.tsx` leads with observed context connections and exact-ID handoff. `/activities` shows recorded activity over time; `/memories` shows recurring patterns. Home includes a collapsed manual export. The web UI requests `GET_STATS` and `GET_EVENTS` from the extension and derives views locally with shared pure functions. It does not send history to a server. The optional ChatGPT relay is independent of Home.

The dashboard must run at an origin allowed by extension `externally_connectable`. Production permits `https://shanvit7.github.io/*`; local development permits `http://localhost:3000/*`. The Chrome Web Store assigns one stable extension ID. Set it as GitHub Actions variable `TABOT_EXTENSION_ID`; deploy passes it to `VITE_TABOT_EXTENSION_ID`, so installed users connect automatically

## Optional ChatGPT MCP integration

The extension owns browser context, the Hono/Cloudflare Worker owns authentication and routing, and ChatGPT owns reasoning. The Worker is independently deployable from the dashboard. The current endpoints are `https://tabot-mcp.shanvit7.workers.dev/mcp` (production) and `https://tabot-mcp-dev.shanvit7.workers.dev/mcp` (development); the extension connects to the matching Worker origin, not `/mcp`. The originally proposed `mcp.tabot.ai` custom domain is **not configured**: this Cloudflare account has no DNS zone, so dev uses a separately deployed Worker rather than a named tunnel. See [MCP setup and troubleshooting](../apps/mcp-server/README.md) for dev commands, secrets, tunnel alternatives, and connection instructions.

### Authorization and installation binding

On first startup the extension registers a random installation ID and server-signed credential, stored in `chrome.storage.local`. The ID alone grants no access. Credentials are scoped by relay origin so the dev and production installations stay separate; reconnect reads existing credentials after service-worker or Chrome restarts rather than silently registering a replacement. An invalid or expired saved credential fails to reconnect and needs explicit repair.

ChatGPT is the OAuth client; Tabot does not receive the user's ChatGPT account identity or require a Tabot account. OAuth discovery, dynamic client registration, authorization-code + PKCE (S256), token refresh, and revocation live on the Worker. During **same-Chrome-profile** consent, the Worker creates a short-lived, single-use authorization transaction bound to client, redirect URI, PKCE challenge, and state. Its consent page contacts the configured Tabot extension through `chrome.runtime.sendMessage`; the extension authenticates approval directly to the Worker, without exposing its credential to page JavaScript. Only then does the Worker issue an authorization code and bind the grant to that installation. Without the extension enabled in the authorizing profile, connection cannot complete; there is no account login, pairing code, QR, or cross-device fallback. The published extension ID and `externally_connectable` origin must match the deployed Worker (and the unpacked dev ID and dev origin must match for development).

A single auth Durable Object persists client registrations, short-lived consent transactions and codes, and hashed access/refresh tokens bound to an installation; it stores no browser context. Access tokens authorize `/mcp`; the token's installation binding, **not** a caller-supplied installation ID, selects the destination. Installation credentials authenticate the outbound extension WebSocket. One installation Durable Object owns that live socket and only in-flight request state; it uses hibernation-compatible heartbeat responses. It never writes tool results or browser history to storage.

### Tool execution and privacy boundary

An authenticated MCP call travels `ChatGPT → /mcp → installation Durable Object → extension WebSocket → local Dexie/query → sanitizeDerived → bounded result → ChatGPT`. The four read-only tools are:

| Tool | Local result |
| --- | --- |
| `search_context(query)` | Search recent derived contexts for a topic. |
| `get_recent_context(hours)` | Contexts from a bounded time window (1–168 hours). |
| `get_current_context()` | Most recent meaningful context, if any. |
| `get_memory(id)` | A derived recurring pattern and evidence, if found. |

Tool descriptions distinguish observed activity from inferred intent. The extension reuses shared derivation/search and sanitization, then projects compact context or memory fields (IDs, time/duration, domains, counts, observations); it does **not** stream raw events, full URLs, page content, or the local database. Sanitized results **do leave the device** for ChatGPT on request. The Worker forwards them without persisting browser history or tool results. Do not log browsing payloads, raw URLs, page titles, memory text, or full responses; keep operational logging to status, latency, and request correlation where needed.

### Connection lifecycle and limits

The extension sends correlated request/response messages over an authenticated outbound WebSocket, heartbeats every 25 seconds, and retries interrupted connections with bounded exponential backoff. A request to an offline installation returns a clear error; a live request has a 10-second timeout, and disconnects fail pending calls. Server tool schemas bound query and memory-ID length and recent-context hours; extension queries and results have additional limits, and the installation Durable Object rejects oversized response frames. Presence and pending requests are ephemeral; Chrome must be open with the extension connected to answer a tool call. `/health` verifies the Worker is reachable, **not** the extension or ChatGPT tool discovery. For connection verification and Refresh after server changes, follow the [relay README](../apps/mcp-server/README.md).

This integration does not add other AI providers, a native MCP server, user accounts, cloud history/embedding storage, task inference, custom MCP UI, or cross-device pairing. Those were excluded from the initial milestone, not hidden capabilities.

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
