# Tabot Page Notes Plan

## Requirement

From product (shanvit, 31/10):

> Whenever you are on some page that you are researching or working on, you can have notes added, and later you can search about the notes.

Decisions so far:

- Every note is **tied to the page the user is on** when they write it. The popup always shows which page that is.
- Every note is **timestamped** and records its **website and subdomain**.
- Saving a note is also recorded as its own **activity event** (`NOTE_SAVED`), so the note falls inside the user's browsing session.
- Links that differ only by **tracking parameters** (`utm_*`, `fbclid`, `gclid`, …) count as the **same page**.
- Notes are **searchable from Home page search**.
- MCP stays **read-only**. There is no `add_note` tool.
- **The extension popup is replaced completely.** The new popup has only:
  1. A header with the logo, then the tracking timer and the Start/Stop tracking button, matching the one on Home.
  2. The notes area for the current page underneath.

## Execution status

Implemented in working tree: canonical page identity shared with capture, OPFS notes storage, save/edit/delete in the replaced popup, NOTE_SAVED session activity, Home search results, and read-only `search_notes` / `get_page_notes` MCP tools with PII redaction. Extension/shared checks, MCP checks, and extension/web TypeScript checks pass. No commit made.

Deferred from original proposal: session-inspector note panel/clickable session navigation, note anchors/timeline output for MCP, and note-aware storage budgeting/export. Notes include derived session summary in Home/MCP search results; MCP notes remain separate read-only tools. Session UI needs a product decision; export/budgeting need existing mechanisms identified first. Semantic note search remains out of scope until lexical search proves insufficient.

## How the current system works (relevant parts)

| Concern | Today | Where |
| --- | --- | --- |
| Popup | 756-line React popup: activity summary, sites, assistant connect, retry, tracking toggle | `apps/extension/popup.tsx`, `popup/model.ts`, `popup/model.check.mts` |
| Popup styling | Tailwind CLI builds `popup.css` → `popup.tailwind.css` (predev/prebuild scripts) | `apps/extension/package.json:23–26` |
| Home tracking control | `TrackingDuration` ("Tracking for 1h 02m 09s" / "Tracking paused") + toggle; reads `GET_TRACKING`, `GET_COUNTS.firstEventTimestamp`, writes `SET_TRACKING` | `apps/web/src/components/home/reading-desk.tsx:45–100, 381–420`, `apps/web/src/lib/history.ts:110–151` |
| Tracking state | `tabot_tracking_enabled` / `tabot_tracking_resumed_at` in `chrome.storage.local`; `SET_TRACKING` / `GET_TRACKING` handlers | `apps/extension/background.ts:99–128, 353–363` |
| Event ingestion | `push(type, tabId, windowId, …, timestamp, snapshot)` → `sanitizeEventForIngestion` → `pipeline.ingest(row, capturePolicy)`. The capture policy ignores events while tracking is paused | `apps/extension/background.ts:~170–215` |
| Event types | `EVENT_TYPES` numeric enum (0–14); `TabEventMetadata` holds per-type fields | `packages/shared/src/events/events.ts` |
| Sessions | Built at read time by `sessionize(events)`; `id = ${start}-${end}-${activeTabId}`; only `SW_WINDOW_FOCUS` is skipped | `packages/shared/src/sessions/sessions.ts:73,121,292` |
| Page identity | `captureIdentity(["page-resource:v1", documentUrl])`, the raw URL | `apps/extension/ingestion/page-ingress.ts:118–125` |
| URL sanitizing | `sanitizeUrlForIngestion` drops credentials, query (except search-engine `q`), hash; redacts PII | `packages/shared/src/privacy/ingest.ts:39` |
| Storage owner | Offscreen TalaDB/OPFS; RPC `methods[method](...args)`; collections `records`, `search_passages`, `search_embeddings`, `meta` | `apps/extension/storage/owner.ts:312–328, 886` |
| Home search | `SEARCH_HISTORY` → `readDashboardHistory` → `db.searchHistory` → `{ results, searchStatus }` | `apps/web/src/lib/history.ts:90`, `apps/extension/dashboard/history.ts`, `reading-desk.tsx` |
| MCP | Worker `registerTool` → extension WebSocket `handlers`; tools `search_activity`, `find_activity_matches`, `get_activity_timeline` (read-only) | `apps/mcp-server/src/index.ts`, `src/mcp/tools.ts`, `src/mcp/schema/tools.schema.ts`, `apps/extension/relay/relay.ts:397` |

Constraints: data stays on the device (local-first); only sanitized data leaves the device, and only on an authorized tool call; "Saved" is shown only after the write commits; a failed read shows an error, not an empty list; AGENTS.md code style.

## Page identity: canonical URL

New shared helper used by **both** page capture and notes:

```ts
// packages/shared/src/privacy/canonical-url.ts
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src)$/i;

export const canonicalPageUrl = (raw: string): string => {
	const url = new URL(raw);
	url.hash = '';
	for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
	return url.toString();
};
```

- `pageKey = captureIdentity(["page-resource:v1", canonicalPageUrl(url)])`.
- `page-ingress.ts:120` switches to the canonical URL too, so notes and captured pages share a key. Meaningful query strings (`youtube.com/watch?v=…`) are kept, so different videos stay separate pages.
- Popup lookup falls back to exact sanitized URL + host + title when pageKey misses, covering query/tracking drift; identical-title query variants can still collide.
- Pages captured earlier under a tracking-parameter URL keep their old key. This only applies going forward; nothing is migrated.
- `ponytail:` fixed denylist. Add parameters as they show up.
- Check: `canonical-url.check.ts`, where `?utm_source=x&v=1#a` becomes `?v=1`.

## Data model

### Note record (new `notes` collection)

Notes live in their own collection, separate from `records`, because users can edit and delete them, while `records` is append-only telemetry.

```ts
export type PageNote = {
	id: string;            // crypto.randomUUID()
	text: string;          // 1–4,000 chars, stored as typed
	createdAt: number;     // timestamp
	updatedAt: number;
	url: string;           // sanitizeUrlForIngestion(canonicalPageUrl(tab.url)): display/open
	origin: string;        // https://docs.example.com
	host: string;          // docs.example.com (subdomain kept)
	site: string;          // host without leading "www."
	title: string | null;  // tab title at save, ≤300 chars
	favicon: string | null;
	pageKey: string;       // shared with page captures (see above)
	tabId: number;
	windowId: number;
	eventId: string | null;// source id of the NOTE_SAVED event; null if event persistence failed
};
```

Indexes: `pageKey`, `host`, `createdAt`.

A note **must** have a page. `SAVE_NOTE` is rejected unless the active tab is `http:`/`https:` and not incognito (the same rule as page capture). There are no notes without a page.

Domain filter: `host === d || host.endsWith("." + d)`, so `example.com` matches `docs.example.com`. No public-suffix-list dependency.

### `NOTE_SAVED` activity event

- `EVENT_TYPES.NOTE_SAVED = 15` (it gets the next free index, so existing indexes don't change). Add `noteId?: string` to `TabEventMetadata`.
- The background emits it **after** the note write commits, with `push("NOTE_SAVED", tabId, windowId, undefined, note.createdAt, { url, favicon }, { noteId })`. The event goes through the normal sanitizer, pipeline and persisted ACK.
- `NOTE_SAVED` is an explicit user action and remains eligible while automatic tracking is paused. If event persistence fails, the note stays saved with `eventId: null` and session association falls back to tab/time.
- Saved only once per note. Edits do not emit a second event, because the session is tied to the moment the note was written.
- `sessionize` counts `NOTE_SAVED` as activity and adds it to `INTERACTION_TYPES`, so writing a note keeps the session going and counts as an interaction. It is a foreground event, so it is added to the foreground-tab check list at `background.ts:200`.
- If the note commits but the event is lost (service worker killed), the note survives and the session falls back to the time rule below. The note is the source of truth; the event only links it to a session.

## Note ↔ session

A session ID can't be stored on the note: sessions are rebuilt every time they're read, and the ID changes while the session is still growing. So the session is looked up when needed:

```ts
export const sessionForNote = (note: PageNote, sessions: Session[], events?: StoredTabEvent[]) =>
	// 1. exact: the session that contains the note's NOTE_SAVED event
	(note.eventId && sessions.find((s) => sessionContainsEvent(s, note.eventId))) ||
	// 2. fallback (paused / event lost): same tab, time inside the session span
	sessions.find((s) => note.createdAt >= s.startTimestamp && note.createdAt <= s.endTimestamp && s.tabs.some((t) => t.tabId === note.tabId)) ||
	undefined; // UI: "Not part of a recorded session"
```

Because `NOTE_SAVED` is emitted even while automatic tracking is paused, the session span normally covers the note. The tab/time fallback applies only when event persistence failed or the event is unavailable.

## Storage owner methods (`owner.ts` + `events/db.ts`)

| Method | Behavior |
| --- | --- |
| `listPageNotes(pageKey)` | Newest first, max 50 |
| `saveNote(input)` | Validate; insert, or update `text` and `updatedAt` by `id`; returns the committed note |
| `linkNoteEvent(id, eventId)` | Sets `eventId` after the `NOTE_SAVED` ACK |
| `deleteNote(id)` | `deleteOne`; the `NOTE_SAVED` event stays as historical activity (it holds only `noteId`, no text) |
| `searchNotes(query, { from?, to?, domain?, limit })` | Case-insensitive word match over `text`, `title`, `host`, `url`; ranked by words matched, then `createdAt`; max 20 |
| `listNotesBetween(from, to)` | For the session inspector |

`ponytail:` v1 search reads every note. To upgrade, run notes through the existing `search-job` embedding pipeline.

Planned but deferred: account for note bytes in storage budgeting and include notes in data export.

## Background messages (`apps/extension/background.ts`)

Popup (internal sender only):

- `GET_ACTIVE_PAGE`: reads the active tab and returns `{ eligible, reason?, url, host, title, favicon, pageKey, notes }`. One call fills the whole popup.
- `SAVE_NOTE { tabId, id?, text }`: the background reads the tab itself and never trusts a URL sent by the popup. It refuses if the tab is not eligible or has moved to a different `pageKey` than the one the popup showed. Then it writes the note, emits `NOTE_SAVED`, and links the event.
- `DELETE_NOTE { id }`.
- Existing `GET_TRACKING`, `SET_TRACKING`, `GET_COUNTS` are reused for the header.

Dashboard (external sender, read-only): `SEARCH_HISTORY` gains `notes`; new `GET_SESSION_NOTES { from, to }`.

## New popup (full replacement)

**Delete** everything in the current popup. Remove from `popup.tsx`: activity summary, site list, assistant/ChatGPT/Claude connect, context prompt, retry ingest, history links. Delete `popup/model.ts`, `popup/model.check.mts` and the `check:popup` script. Remove background handlers that only the popup used (`GET_PAGE_CAPTURE_SUMMARIES` and the popup-side `RETRY_INGEST` path; the dashboard ones stay). Assistant connection already lives in the web app (`_workspace.assistant.tsx`).

Layout (about 360px wide):

```text
┌────────────────────────────────────┐
│ [logo]  Tracking for 1h 02m 09s [■]│  ← header: same copy/behavior as Home
├────────────────────────────────────┤
│ [fav] Page title                   │  ← "You're on": current page, always shown
│       docs.example.com/guide/setup │     host + path, subdomain visible
├────────────────────────────────────┤
│ 3 notes on this page               │
│ ┌────────────────────────────────┐ │
│ │ note text…                     │ │  ← newest first; timestamp, edited,
│ │ Today 14:12 · edit · delete    │ │     edit/delete (inline confirm)
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ Write a note…          0/4000  │ │  ← composer; Cmd/Ctrl+Enter
│ └────────────────────────────────┘ │
│                       [Save note]  │
└────────────────────────────────────┘
```

- **Header:** `logo` (`data-base64:~assets/icon.png`), then the timer and Start/Stop button. It uses the same logic as Home's `TrackingDuration`: base is `GET_COUNTS.firstEventTimestamp`, ticks every second while enabled, shows "Tracking paused" when off, and the button sends `SET_TRACKING`. Busy and error states match Home ("Could not read tracking status. Click to retry.").
  - `ponytail:` plain `tabular-nums` text, no animated `Counter`. The extension can't import `apps/web/components`. Move both into a shared UI package only if the animation is wanted.
- **Current page:** always visible, so the user knows which page the note is for. Not eligible (`chrome://`, extension pages, incognito) → "Notes can't be added on this page" and the composer is disabled.
- **Notes list and composer:** as above. A save is confirmed only after the commit; the draft is kept on failure. Read error → error with Retry, never "No notes".
- **While paused:** notes can still be saved. A small hint says "Tracking paused — this note won't be linked to a session."
- **Footer link:** "Search notes on Home" opens `HOME_URL?q=` (this replaces the old history links).
- Pure helpers go in `apps/extension/popup/notes.ts` with `notes.check.mts`; `check:popup` points at it.
- `popup.css` and the Tailwind build stay.

## Home search (`apps/web`)

- `readDashboardHistory` runs `searchHistory` and `searchNotes` in parallel, using the same `from`/`to`/site filters.
- `SEARCH_HISTORY` response gains `notes: NoteSearchResult[]`. The field is additive: older dashboards ignore it, and a missing value is treated as `[]`.
- `NoteSearchResult = { id, text (snippet), createdAt, updatedAt, url, host, site, title, favicon, session: { start, end, durationMs } | null }`. The session is resolved in the extension with `sessionForNote`. No tab IDs or `pageKey` leave the extension; an `isDashboardNoteResult` guard enforces this.
- Reading desk:
  - A **Notes** group above page results: snippet, favicon, host, title, timestamp, session span ("Session 14:02–14:47 · 45 min").
  - Selecting a note opens its page in the reader if that page is in the results, otherwise a note detail with "Open page".
  - Page results with notes get an "N notes" badge.
  - Clicking the session span opens the session inspector.
  - `?q=` from the popup prefills the search.
- Session inspector: "Notes in this session" via `GET_SESSION_NOTES`, filtered with `sessionForNote`. `NOTE_SAVED` shows up in the session's event timeline as "Note added".

## MCP (read-only)

| Tool | Input | Result |
| --- | --- | --- |
| `search_notes` | `query` (1–200), `from?`, `to?`, `site?` (suffix match), `limit?` (1–8), `cursor?` | `{ count, nextCursor, notes: [NoteResult] }` |
| `get_page_notes` | `url` (http/https, ≤2,048) | `{ found, origin, title, notes: [NoteResult] }`. Matched by `canonicalPageUrl` and `pageKey` in the extension |

`NoteResult = { id, text, createdAt, updatedAt, origin, host, title, session: { start, end, durationMs, sites } | null }`.

- `find_activity_matches` / `get_activity_timeline` anchors accept `kind: "note"`. The anchor is the note's `NOTE_SAVED` event when there is one, otherwise its origin and `createdAt`.
- `NOTE_SAVED` appears in `get_activity_timeline` as `note_added` (no text, only `noteId`).
- Privacy: `text` and `title` pass through `piiRedactor.redact`; results include only origin and host, no page path; at most 8 results per call.
- Files: `apps/mcp-server/src/mcp/tools.ts`, `src/mcp/schema/tools.schema.ts`, `src/index.ts`, `apps/extension/relay/relay.ts`.

## Original implementation sequence

1. **Shared:** `canonicalPageUrl`, `PageNote`, `validateNoteText`, `sessionForNote`, `noteMatchesDomain`, `searchNoteRows`; `NOTE_SAVED = 15` with `noteId` metadata; `sessionize` and `INTERACTION_TYPES` updated. Checks: canonical URL, session (exact via event, fallback, none), subdomain matching (`badexample.com` excluded), ranking, `NOTE_SAVED` keeps a session alive.
2. **Page capture:** switch `page-ingress.ts` to `canonicalPageUrl`; update its check.
3. **Storage:** `notes` collection, owner and client methods; check save → list → edit (`createdAt` fixed) → link event → search → delete.
4. **Background:** `GET_ACTIVE_PAGE`, `SAVE_NOTE` (write → event → link), `DELETE_NOTE`, `SEARCH_HISTORY.notes`, `GET_SESSION_NOTES`; remove popup-only handlers. Update `dashboard/sender.check.mts`.
5. **Popup rewrite:** delete the old UI, model and check; build the header, current page and notes UI. Manual QA: note → reopen → shown; same URL with `?utm_source` → same notes; subdomain → separate; `chrome://` → disabled; paused → saved without a session; resume → `NOTE_SAVED` appears in the session; toggle in the popup matches Home.
6. **Home search:** Notes group, badges, session span, inspector notes, `?q=`.
7. **MCP:** two tools, note anchors, `note_added` in the timeline, redaction check.
8. **Docs and release:** `docs/system.md` (event table and stale MCP tool table), `docs/tech.md`, `apps/extension/AGENTS.md` (popup scope), `apps/mcp-server/README.md`, privacy copy, store screenshots (popup changed); changeset for extension, web, mcp-server and shared.

## Open questions

1. **Semantic note search:** v1 matches words only. Join the embedding pipeline when needed.
2. **Note indicator on the page itself** (badge count or content script): out of scope for now.
