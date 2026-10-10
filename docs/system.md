# Tabot System Overview

Tabot is a local-first Chrome extension plus browser dashboard. It records a small set of browser-activity signals, stores normalized events in IndexedDB, and deterministically derives sessions, activity episodes, contexts, and recurring behavioral patterns.

This walkthrough reflects current working-tree code, including staged changes, audited on 2026-10-09. [`tech.md`](./tech.md) is the technical source of truth. Release gaps and acceptance criteria appear below. Together they absorb the former v0.2 product plan. **Implemented in source does not mean deployed, production-verified or release-complete.**

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

## Product loop and boundaries

The intended experience is **install → browse normally → review an activity summary → optionally connect ChatGPT → ask about that activity → return to useful new activity**. Sessions, summaries, recurring patterns, notifications and scoped assistant actions support one loop, not separate telemetry dashboards.

- Local recording and review work without an assistant. ChatGPT is the only connected provider implemented; Claude/Gemini tiles are disabled.
- User-facing copy says **activity** / **activity summary**, never **context**. Internal `BrowserContext`, tool names and `?context=` links remain technical contracts. [PRODUCT.md](../PRODUCT.md) governs current vocabulary and decisions, overriding obsolete plan examples.
- Lead with sites, time, connections and recurrence—not raw event counters. Event totals remain internal readiness/derivation inputs, not “activities,” “actions” or “visits” in UI or ChatGPT summary results.
- Do not manufacture a topic, intent, first memory, progress percentage, ETA, productivity score or immediate value at install. An empty record is valid.
- Notifications describe observed evidence, stay sparse and open selected activity rather than dump history. ChatGPT controls its answer; Tabot neither infers tasks nor guarantees a useful next step.
- Manual JSONL download is a separate user-controlled review/audit path, not the primary assistant handoff; it is never automatically uploaded.

## Capture

The content script and Chrome APIs collect these signals:

| Event | Source | Captured data |
| --- | --- | --- |
| `TAB_CREATED` | `chrome.tabs.onCreated` | tab and window IDs |
| `TAB_ACTIVATED` | `chrome.tabs.onActivated` | tab and window IDs |
| `TAB_UPDATED` | `chrome.tabs.onUpdated` | tab and window IDs |
| `TAB_REMOVED` | `chrome.tabs.onRemoved` | tab ID; window ID is `0` sentinel |
| `NAVIGATION` | `chrome.webNavigation.onCommitted`, main frame | tab ID and URL sidecar |
| `PAGE_VISIBLE`, `PAGE_HIDDEN` | page visibility plus foreground/idle sampling | event only |
| `SCROLL` | viewport and discovered nested scroll containers | scroll offset |
| `CLICK` | document click | client coordinates |
| `KEY_ACTIVITY` | document keydown | event only |
| `SW_WINDOW_FOCUS` | `chrome.windows.onFocusChanged` | window ID focus transition (see SW telemetry section) |

`SCROLL` and `KEY_ACTIVITY` are throttled to 150 ms by TanStack Pacer before messaging the background worker. Key values, text, form values, DOM, screenshots, and page content are never recorded.

Content scripts send `TABOT_PAGE_EVENT` messages. They never touch shared memory. Background service worker is sole producer and owns tab URL/title metadata in an in-memory sidecar.

Foreground capture checks the selected tab in the focused, non-minimized window, with a 30-second alarm sample and immediate focus/tab/idle samples. Idle (60 seconds without system input) or lock ends attention. The last sample is stored in `chrome.storage.session`; delayed samples after sleep close at the last observation, not wake time. Only foreground navigation and interactions enter the behavioral capture path.

Derived `duration` means foreground milliseconds; `wallDuration` means elapsed coverage. Episodes may group multiple sessions, but their duration never includes intervening gaps. Historical events are re-derived locally, conservatively when focus/visibility samples are missing. No database migration is needed. Re-export old downloads to get schema 9 durations.

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

- **Never activity itself.** A focus row cannot open a session or reset its inactivity clock. A focus-only trace yields **0 sessions**. Schema 9 uses its state to reject background-window activity and stop foreground dwell; removing false evidence may change derived boundaries.
- **No episode-boundary score boost.** The episode scorer has no SW terms; focus evidence is a causal record, not a scoring input.
- **Graph continuity evidence only.** `applyFocusContinuity` decorates an *existing* same-session edge with a strengthened weight when a causal focus sandwich is present (departure window w→x, return x→w chained by `previousWindowId`). Chains involving `previousWindowId === -1` (browser focus loss/regain) are excluded. Evidence requires behavioral anchors on both sides — it can never create a node, edge, or episode, only strengthen an existing trajectory.

Historical Phase 2 result, before schema 9 foreground filtering: SW telemetry added **zero** sessions, episodes, contexts, or memories; only graph evidence counts changed where cross-window continuity genuinely occurred.

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

`packages/shared/src/events/buffer.ts` defines a 10,000-slot `SharedArrayBuffer` ring buffer. Each 32-byte slot stores fixed-width numeric data only:

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

`id` is `${timestamp}-${tabId}-${logicalIndex}`. URLs, captured favicon sidecars, window IDs and event metadata are stored but intentionally unindexed. Old `tabot_rxdb` storage is deleted on first Dexie open.

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

## Dashboard and popup

- **Home (`/home`)** leads with a local activity/site/pattern map, range/search controls, selected-summary details, scoped ChatGPT handoff and collapsed **Download your data**. `?context=<id>` selects an internal summary ID when still present.
- **Activities (`/activities`)** shows estimated browsing time, visits, active days and transitions. Assistant actions target the displayed period or selected HTTP(S) origin.
- **Recurring patterns (`/recurring-patterns`)** shows recurrent memories and supporting activity. There is no current `/memories` route. Its overview assistant action is connected-only; a selected-pattern action otherwise routes to Home’s connection section.
- **Browsing sessions:** select an activity on Home, then a session card. A `react-call` inspector opens a native desktop dialog/full-screen mobile sheet with date/time, **Time in Chrome**, **Tabs used**, **Websites**, first/last site observations and related activity links. Browser/extension/unknown sources remain separate from websites. No raw events, page URLs or tab IDs reach this inspector; internal event totals are not displayed. A session can contribute to several summaries, so session totals are not selected-summary totals. Site observation spans are not per-site dwell. No technical disclaimer footer is shown.
- **Popup:** derives the full local record, features recent activity, counts new AI-ready activity summaries since the previous popup visit and reviews the newest one. First visit establishes a baseline without counting old history as new. Before readiness, it can show today’s browsing-session count and honest guidance. Pause/resume and recording-loss feedback remain; pipeline counters are not the main surface. Connected users get a scoped **Ask ChatGPT** action; disconnected users get **Connect ChatGPT**; unknown is not disconnected.

`use-home-data.ts` polls stats every second and persisted events every five seconds, deriving locally. Popup activity refreshes every ten seconds. No history upload is needed to render these views. The dashboard reads the extension through messaging; its web origin does not directly share the extension’s IndexedDB origin.

The manifest permits `https://shanvit7.github.io/*`, `http://localhost/*` and production/dev relay origins through `externally_connectable`. Set the published extension ID as GitHub Actions variable `TABOT_EXTENSION_ID`; the dashboard receives `VITE_TABOT_EXTENSION_ID`. ID, dashboard origin and deployed consent-page configuration must agree. Configuration alone does not prove production connectivity.

## Optional ChatGPT MCP integration

The extension owns browser context, the Hono/Cloudflare Worker owns authentication and routing, and ChatGPT owns reasoning. The Worker is independently deployable from the dashboard. Configuration targets `https://tabot-mcp.shanvit7.workers.dev/mcp` (production) and `https://tabot-mcp-dev.shanvit7.workers.dev/mcp` (development); the extension connects to the matching Worker origin, not `/mcp`. No custom `mcp.tabot.ai` domain is declared in current Wrangler configuration. Development uses a separate Worker, not a named tunnel; the relay README documents the DNS-zone prerequisite for a named tunnel. Current deployment/secrets/account state was not verified in this audit. See [MCP setup and troubleshooting](../apps/mcp-server/README.md) for dev commands, secrets, tunnel alternatives, and connection instructions.

### Authorization and installation binding

The background starts the relay independently of dashboard or ChatGPT consent. With no saved credential, it registers a random installation ID and server-signed credential in `chrome.storage.local`, then connects outbound. Registration/heartbeats can occur before a user connects ChatGPT; registration sends no browser-history payload. The ID alone grants no access. Credentials are scoped by relay origin so the dev and production installations stay separate; reconnect reads existing credentials after service-worker or Chrome restarts rather than silently registering a replacement. An invalid or expired saved credential fails to reconnect and needs explicit repair.

ChatGPT is the OAuth client; Tabot does not receive the user's ChatGPT account identity or require a Tabot account. OAuth discovery, dynamic client registration, authorization-code + PKCE (S256), token refresh, and revocation live on the Worker. During **same-Chrome-profile** consent, the Worker creates a short-lived, single-use authorization transaction bound to client, redirect URI, PKCE challenge, and state. Its consent page contacts the configured Tabot extension through `chrome.runtime.sendMessage`; the extension authenticates approval directly to the Worker, without exposing its credential to page JavaScript. Only then does the Worker issue an authorization code and bind the grant to that installation. Without the extension enabled in the authorizing profile, connection cannot complete; there is no account login, pairing code, QR, or cross-device fallback. The published extension ID and `externally_connectable` origin must match the deployed Worker (and the unpacked dev ID and dev origin must match for development).

A single auth Durable Object persists client registrations, short-lived consent transactions and codes, and hashed access/refresh tokens bound to an installation; it stores no browser context. Access tokens authorize `/mcp`; the token's installation binding, **not** a caller-supplied installation ID, selects the destination. Installation credentials authenticate the outbound extension WebSocket. One installation Durable Object owns that live socket and only in-flight request state; it uses hibernation-compatible heartbeat responses. It never writes tool results or browser history to storage.

### Tool execution and privacy boundary

An authenticated MCP call travels `ChatGPT → /mcp → installation Durable Object → extension WebSocket → local Dexie/query → sanitizeDerived → bounded result → ChatGPT`. The **seven** read-only tools registered and handled in code are:

| Tool | Local result |
| --- | --- |
| `search_context(query, hours?)` | Local token/substring search over AI-ready domains/sequence keys; optional 1–168-hour overlap filter, maximum 8 results. Not semantic/page-content search. |
| `get_recent_context(hours)` | Maximum 20 AI-ready summaries overlapping the last 1–168 hours; derive before filtering to preserve matching lookup IDs. |
| `get_current_context()` | Latest AI-ready summary overlapping the last 24 hours, or `found: false`; not proof of the user’s present task/live attention. |
| `get_context(id)` | Exactly one derived summary, including a thin/non-ready summary explicitly requested by ID; missing means `found: false`, never all history. |
| `get_memory(id)` | One pattern with bounded origin-only supporting occurrences and actual summary lookup IDs, or `found: false`. |
| `list_recurring_patterns(limit?)` | Recurrent-only discovery, newest first; default 10, maximum 20, from up to 500 recent contexts built from up to 500 recent sessions—not exhaustive history. |
| `get_activity_metrics(from, to, origin?)` | Origin-only aggregates for `[from, to)` in Unix milliseconds; optional exact HTTP(S) origin. Summary remains whole-period after site filtering. |

`get_session(id)` and `get_page_context()` were conceptual suggestions, not registered tools. Inspectable sessions are local UI, not an MCP session API. The local live-context snapshot is not directly exposed as a tool.

Tool descriptions distinguish observed activity from inferred intent. The extension sanitizes context/memory data, then projects IDs, duration, sites, session/occurrence counts and observed summaries, without raw event totals. Metrics use a strict origin-only aggregate projection. No tool streams raw events, page paths, queries, credentials, content, favicons or the local database. Origins/subdomains remain visible; covered PII redaction is not universal detection of names or sensitive enterprise hosts. Sanitized results **do leave the device** for ChatGPT on request. The Worker forwards them without persisting browser history or tool results. Do not log browsing payloads, raw URLs, page titles, memory text, or full responses; keep operational logging to status, latency, and request correlation where needed.

### Connection lifecycle and limits

The extension sends correlated request/response messages over an authenticated outbound WebSocket, heartbeats every 25 seconds, and retries interrupted connections with bounded exponential backoff. A request to an offline installation returns a clear error; a live request has a 10-second timeout, and disconnects fail pending calls. Schemas bound query/ID lengths, hours, pattern counts and metric inputs. Pattern/metric results have explicit caps and truncation within 60,000 characters; the installation Durable Object rejects frames over 64,000 characters. Context lookup/search can derive full local history before selecting results: output caps do not guarantee bounded derivation cost. Presence and pending requests are ephemeral; Chrome must be open with the extension connected to answer a tool call. `/health` verifies the Worker is reachable, **not** the extension or ChatGPT tool discovery. For connection verification and Refresh after server changes, follow the [relay README](../apps/mcp-server/README.md).

**Connected means an unexpired OAuth access or refresh token exists for this installation.** It does not establish a live socket, discovered tools, current production code or useful ChatGPT answers. **Connect ChatGPT** currently opens `https://chatgpt.com/plugins?search=Tabot`; documented development setup needs Developer mode and manual MCP URL entry. This audit does not establish a working non-technical production connection flow.

Other providers, native MCP servers, accounts, cloud history/embeddings, task inference, custom MCP UI and cross-device pairing are excluded, not hidden capabilities.

## AI readiness and notifications

`isAiReadyEvidence` in `packages/shared/src/recall/retrieval.ts` requires **10 minutes foreground duration**, **10 events**, plus at least one of **2 domains**, **2 sessions**, or **5 interactions**. This internal heuristic is not probability of intent or a validated usefulness score. Search/recent/current discovery applies it; exact-ID lookup does not. Discovery does not require notification settlement.

`background.ts` installs a **15-minute alarm** and persists notification state in `chrome.storage.local`. It runs while tracking is enabled, selects a new ready context or newly seen recurrent memory, and can use a qualifying episode inside the selected context for wording. Episodes alone are not an independent source. Candidates must end at least **30 minutes** ago, be within **24 hours**, and exceed the high-water mark. At most one notification every **6 hours**. First-run marks start at current time, preventing historical backfill. The newest context/memory candidate wins; recurring-memory qualification does not independently apply the context readiness gate.

A new meaningful insight opens the extension popup automatically; if Chrome cannot open the popup, the system notification is the fallback. At Chrome startup, an unread AI-ready summary can reopen the popup once per local day, only when no notification was sent in the previous six hours. Empty and already-viewed startup reminders are suppressed. The development build separately opens the popup every 15 seconds to cycle preview states. Clicks on the system-notification fallback open the associated summary on Home; its button uses connection state saved when created. MCP reads and derivation do not directly emit notifications.

## v0.2 status and acceptance

| Area | Code status | Still required |
| --- | --- | --- |
| Capture/derivation | Local sessions, episodes, contexts, memories, views and export implemented. | Representative browsing validation, without inferred task claims. |
| MCP/OAuth | Seven tools, installation-bound OAuth and correlated dispatch implemented; local/mock checks pass. | Production ID/origin/version parity, refresh/discovery, same-profile consent and successful authorized retrieval. |
| Non-technical connection | Connect links/status exist; developer setup documented. | Prove normal users connect without entering an MCP URL or understanding MCP. Production completion is unverified. |
| Dashboard | Activity/pattern maps, scoped handoffs and session inspector implemented. | Explicit shared-gate readiness indication on Home is **not implemented**. UI review belongs to the user. |
| Popup | New ready-summary count, session-count progress and scoped CTA implemented. | Live first-run and re-engagement acceptance; summary counts are not new memories/raw events. |
| Notifications | Settlement, freshness, cooldown and selected-ID actions implemented. | Real-browsing calibration, sparse delivery, click/prefill/offline acceptance. Fallback title still says “Context ready”; align remaining copy with PRODUCT.md. |
| First run | Honest empty guidance, local-observation copy and session progress exist. | Notification-expectation guidance and complete install-to-first-use acceptance; no fake ETA or “memory forming” promise. |
| Startup reminder | Not implemented. | If retained for v0.2, reuse meaningful unseen candidates, high-water marks and cooldown; no empty or duplicate alarm/startup reminders. |
| Release | Extension `0.1.3`; MCP package/protocol `0.2.0`. | Minor extension release through Changesets, notes, builds, user review and explicit deploy approval. Server version is not extension release completion. |

Manual/live acceptance, not source/checkmark inference:

1. Fresh-profile install communicates local recording and honest empty/progress states.
2. Normal browsing yields inspectable activity, sessions and supported recurring patterns without invented tasks.
3. Meaningful settled activity produces a sparse notification; click opens the exact summary and disconnected users reach connection first.
4. Non-technical ChatGPT connection works. Notification/popup/dashboard prompts retrieve the selected summary/pattern or displayed metric range, not all history.
5. ChatGPT answers usefully from evidence; actual tool traffic excludes raw events and sensitive URL components. Startup reminders, if implemented, are useful and deduplicated.
6. Offline extension, reconnect, Chrome/service-worker restart, missing IDs and expired credentials fail honestly without silently changing installation identity.

Measure first useful summary → user reviews it → authorized ChatGPT use → return engagement, not event/memory volume. No product-loop analytics is claimed here. Other providers, raw-history AI dumps, centralized history, native companions, generic profiles, broad PII detection and telemetry rewrites remain out of scope.

## Checks

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
