# Tabot system overview

Tabot is a Chrome extension with a browser dashboard. It records a bounded set of browser activity and visible-page evidence locally, then lets the user search and review that data or explicitly request supported results through ChatGPT. Reusable contexts and user-directed automations are product direction, not shipped capabilities.

This document describes the current source architecture. It does not claim a particular deployment, extension-store release, or live ChatGPT connection has been verified.

## Runtime architecture

```text
Chrome APIs + eligible page content scripts
  → MV3 background service worker
  → validate, minimize, redact, bound admission
  → Pacer batcher → serial writer
  → offscreen TalaDB owner → OPFS
       ├→ local full-text/vector search indexer
       ├→ popup and dashboard via validated extension messaging
       └→ optional authorized MCP request via extension WebSocket
             → Cloudflare Worker → ChatGPT
```

The extension owns capture, local storage, local search, and result projection. The dashboard is a browser-only client of extension messaging; it never opens extension OPFS. The optional relay authenticates and routes requests to the connected extension. It stores authorization and connection state, not browser history or tool results.

## What runs locally

- **Capture:** Chrome tab, navigation, focus, and foreground signals; bounded visible text excerpts from eligible pages; and user-authored page notes. Capture is controlled by the extension's tracking setting and page/site policy.
- **Storage:** TalaDB on OPFS is the active source of truth for browser records, notes, and local search data. A single offscreen document owns database access. IndexedDB is used only to import legacy profiles.
- **Search:** local lexical/full-text and vector search. The extension packages its embedding model and runs indexing locally; embedding failure falls back to keyword search.
- **Review:** the popup handles current-page notes and recording controls. The web dashboard searches and browses retained sites/pages/notes, displays a selected excerpt, and edits saved notes.

Automatic excerpts are bounded, redacted before persistence, and not returned in assistant activity results. Tabot does not record typed values or form contents, and does not collect screenshots or whole-page snapshots. Redaction is pattern-based and not exhaustive. Email, phone, and Indian tax PAN are not covered by the shared sensitive-data redactor.

## Data flow and durability

The service worker validates incoming Chrome messages and snapshots capture metadata before asynchronous work. A bounded Pacer batcher feeds one FIFO writer (maximum 128 records per batch, 25 ms collection window, concurrency one). The offscreen owner validates and deduplicates records, then commits accepted event/page records and search jobs atomically. An ACK means the commit succeeded or the same record was already committed; queue admission is not durability.

The writer retries transient storage failures and keeps bounded held work after terminal failure. Queues and retry state are in memory and can be lost when Chrome terminates the worker. Committed records remain subject to browser storage guarantees. Read failures are shown as unavailable/error, not converted to empty history. See [data flow and failure ownership](./data-flow.md) for detailed limits and recovery behavior.

## Assistant connection

The optional integration consists of eight read-only MCP tools for searching activity, finding/timing related activity, browsing sites/pages, and searching or retrieving notes. ChatGPT initiates each request; the extension executes it against local data and returns a bounded projection. Activity results omit raw event records, page paths/titles, and excerpt bodies. Explicitly requested note text/title may leave the device after selected-pattern redaction. Email, phone, and other undetected sensitive content may remain.

The Cloudflare Worker handles OAuth and routes authorized requests over an authenticated WebSocket to a live extension. It does not run the local search or reason over browser data. Chrome must be open with the extension connected to answer a tool request. A configured destination or successful OAuth grant alone does not prove a live socket, tool discovery, deployment parity, or useful assistant result. Operational setup is in [the MCP server README](../apps/mcp-server/README.md).

## Product boundaries

The current beta provides local browser-data capture, search/review, saved notes and excerpts, and the optional ChatGPT integration. It does not provide a task-understanding workspace, assistant-driven browser actions, or an automation engine. Do not describe raw event volume as visits, productivity, or intent. See [PRODUCT.md](../PRODUCT.md) for positioning and future direction.
