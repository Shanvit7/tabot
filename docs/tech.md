# Tabot technical architecture

This document records the current implemented architecture and trust boundaries. It is based on the source tree, not a claim that a particular release or hosted deployment has been verified. Product direction is in [PRODUCT.md](../PRODUCT.md); runtime walkthrough is [system.md](./system.md); detailed ingestion failure ownership is [data-flow.md](./data-flow.md).

## 1. System boundary

Tabot is a local-first Chrome extension and browser dashboard. The extension is the only owner of local browser data. The dashboard is a UI client; the optional Cloudflare MCP service is an authorization/request relay.

```text
Chrome events + content script
  → extension background service worker
  → bounded ingestion and serial writes
  → offscreen TalaDB owner (OPFS)
  → local search indexing and local reads
       ├→ popup
       ├→ dashboard via allowlisted Chrome messaging
       └→ authorized MCP call via extension WebSocket
            ↔ Cloudflare Worker / OAuth relay ↔ ChatGPT
```

No dashboard or relay process opens the local database. There is no cloud history database, cross-device sync, Tabot-hosted LLM, or remote embedding API. Local data remains on-device except for explicitly requested result projections sent to an assistant and user-initiated exports.

## 2. Runtime ownership

| Component | Owns |
|---|---|
| `apps/extension/background.ts` | Chrome event listeners, extension message routing, capture policy, bounded ingestion pipeline, foreground/tracking coordination, error reporting, relay startup. |
| `apps/extension/contents/tabot.ts` | Eligible-page signal sampling and bounded visible excerpt requests; never captures typed/form values. |
| `apps/extension/ingestion/` | Ingress validation, stable capture identity, bounded collection and serial writer. |
| `apps/extension/storage/owner.ts` | Sole active TalaDB owner; database initialization, migration, atomic record writes, notes, search jobs/indexes, local queries and storage projections. Runs in the offscreen document. |
| `apps/extension/storage/search-embedding.worker.ts` | Local embedding work, separate from the service-worker ingestion transport. |
| `apps/extension/dashboard/` | Validates dashboard senders and requests; returns allowlisted library/search/preview/note results. |
| `apps/extension/relay/relay.ts` | Installation credentials, authenticated WebSocket, reconnect/heartbeat, request correlation, local query and privacy-safe result projection. |
| `apps/web/src/lib/history.ts` | Browser-only dashboard-to-extension client. No browsing data is sent through TanStack server functions. |
| `apps/mcp-server/` | OAuth, MCP schemas/dispatch, installation routing and relay transport. Does not persist browser history or tool results. |
| `packages/shared/src/` | Shared types, validation, URL/privacy helpers, local search/library logic, telemetry contract and PostHog transport. |

## 3. Capture and admission

Chrome APIs provide tab lifecycle, committed navigation, window focus and foreground eligibility signals. The content script sends bounded page signals and visible text observations from eligible pages. The capture path excludes incognito, configured sensitive/auth surfaces, form/editor content and non-foreground pages. It records no key values, typed text, form contents, screenshots, or whole-page DOM snapshots.

Page observations are distinct records from browser events. The shared page-observation contract caps records at 32 KiB, four text segments, and 1,000 characters per segment. Shared redaction/minimization runs before admission and is repeated at the storage boundary. Per-resource/day and per-origin/hour budgets are enforced; retained excerpts are subject to a 25 MiB oldest-first budget, not a timed-expiry policy. These controls are not a guarantee that every sensitive string is detected.

`apps/extension/ingestion/event-pipeline.ts` bounds all outstanding work to 2,048 rows / 4 MiB, reserves 128 rows / 256 KiB for higher-priority signals, batches up to 128 records over a fixed 25 ms collection window, and writes FIFO with concurrency one. Transient DB errors receive up to three attempts. Queued/admitted work is not durable; only a committed write or matching committed replay receives a persisted ACK. Worker termination can discard in-memory queue and retry state.

## 4. Local persistence and search

The offscreen owner opens TalaDB database `tabot_events` on OPFS and rejects a non-OPFS or non-durable storage backend. One owner mutation lane validates identities and commits accepted records using TalaDB `insertMany`.

| Collection | Contents |
|---|---|
| `records` | Event envelopes, page-observation envelopes, and durable search-job envelopes. Event/page kinds are distinguished in the envelope. |
| `notes` | Editable user-authored page notes, stored separately from captured excerpts. |
| `search_passages` | Rebuildable text passages and local vectors used for full-text/vector search. |
| `search_embeddings` | Reusable local embedding cache. |
| `meta` | Migration and indexing progress metadata. |

TalaDB indexes support record kind, timestamp, source identity, page/site lookup, full-text queries, passage full-text/vector search and note lookup. Indexed search state can be rebuilt; events, page observations and notes are the user data. IndexedDB is a legacy-profile import source, not a live fallback or second writer.

The embedding model is packaged and executed locally by a dedicated worker. Search keeps a lexical/full-text path when embedding is unavailable. Search terms and excerpts stay in the browser for dashboard reads. A search/indexing error degrades indexing/search availability and is not presented as a successful index operation.

## 5. Dashboard and popup read path

The web dashboard uses `apps/web/src/lib/history.ts` to send validated messages to the extension. The extension checks sender origin and request shape before reading storage. Current browser UI includes the workspace search/review surface, assistant connection/setup, settings, privacy information and mobile gate; popup provides page-note and tracking/data controls. Exact routes and UI behavior should be maintained alongside route source, not inferred from older product screens.

Read failures remain explicit unavailable/error results. They must never be converted into empty search results or zero counts. The dashboard cannot access OPFS directly and does not use a TanStack server function to move history off-device.

## 6. Optional MCP path

An authorized read-only MCP request follows:

```text
ChatGPT → Cloudflare MCP/OAuth Worker → installation-bound request
  → authenticated extension WebSocket → local TalaDB query
  → local sanitization/projection → correlated response → ChatGPT
```

The eight current tools are `search_activity`, `find_activity_matches`, `get_activity_timeline`, `search_notes`, `get_page_notes`, `list_sites`, `list_site_pages`, and `get_site_notes`. The extension performs local search and returns bounded projections. Activity/site results omit raw event rows, page paths/titles and excerpt bodies. Explicitly requested note content can leave the device after selected-pattern redaction. The redactor does not cover email, phone or Indian tax PAN and cannot guarantee detection of every sensitive value.

The relay stores OAuth/installation routing state and ephemeral request state, not browser history or results. Tool calls require Chrome and the extension to be connected. OAuth grant, Worker health, and source configuration do not prove live extension connectivity, tool discovery, production parity, or successful end-user use. See [MCP server operations](../apps/mcp-server/README.md).

## 7. Privacy and diagnostics

- Minimize and redact new URLs/content before persistence; validate again at trust boundaries.
- Keep excerpts separate from event reads and assistant activity projections.
- Project allowlisted fields; never log raw URLs, titles, excerpts, note text, credentials or full MCP results.
- Requested note text/title is a distinct user-directed sharing path; selected-pattern redaction is not complete secret detection.
- Optional PostHog uses the shared allowlisted transport for dashboard route views and sanitized errors, plus extension runtime errors and search-indexing failures. It does not capture browsing payloads. Local builds require `VITE_POSTHOG_ENABLED=true` or `PLASMO_PUBLIC_POSTHOG_ENABLED=true` plus a project key; local flags default off. Production workflows set flags on.

## 8. Checks

Useful targeted checks for these contracts:

```bash
pnpm --filter @tabot/shared check:telemetry
pnpm --filter @tabot/shared check:privacy
pnpm --filter @tabot/shared check:historySearch
pnpm --filter @tabot/shared check:library
pnpm --filter @tabot/shared check:notes
pnpm --filter extension check:ingest
pnpm --filter extension check:storageOwner
pnpm --filter extension check:dashboardSender
pnpm --filter extension check:dashboardHistory
pnpm --filter extension check:searchEmbedding
pnpm --filter extension check:pageCapture
pnpm --filter web check
pnpm --filter web build
pnpm --filter extension build
```

These checks exercise source-level contracts. They do not establish per-profile migration success, real browsing quality, live PostHog receipt, production deployment parity, or successful ChatGPT setup and use.
