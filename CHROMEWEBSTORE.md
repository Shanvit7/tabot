# Chrome Web Store — Tabot

Draft Chrome Web Store listing and permission/privacy copy for the **0.2.5** extension release. Tabot collects browser activity for local search and review, and exposes eight read-only tools to a connected assistant on explicit request. Reusable contexts and user-directed automations are product direction, not shipped beta features. Last updated: November 15, 2026. Prepared manifest version: 0.2.5 (derived from `apps/extension/package.json`). No store submission or publication performed.

## Store listing

- Name: Tabot
- Short description: Turn your Chrome activity into context for your AI assistant.
- Category: Productivity
- Language: English
- Single purpose: Collect Chrome activity for local search and review, and share supported results with a connected AI assistant only when the user asks.
- Positioning: Tabot is the browser activity layer for your AI assistant. It is not a privacy utility, an employee-monitoring tool, or a productivity scorecard.

## What 0.2.5 ships

- Local search over retained pages, sites and user-written notes. Page search combines keyword and semantic matching; note and site search use keyword matching.
- Eight read-only assistant tools: `search_all`, `search_notes`, `list_sites`, `list_pages`, `get_page_notes`, `get_site_notes`, `find_related_activity`, `get_browsing_timeline`.
- Popup for the current page: note controls, tracking controls, local capture management, elapsed tracked time.
- Local storage moved to TalaDB on OPFS, with verified one-time import from earlier IndexedDB history.
- Not in this release: reusable contexts, user-directed automations, browser actions, productivity measurement.

## Permissions justification

No new permissions versus 0.2.2; the `idle` permission shipped in 0.2.1. Chrome should not show a new-permission upgrade prompt — verify against the actual 0.2.2 listing before submission.

| Permission | Type | User-facing reason |
| --- | --- | --- |
| `storage` | permission | Save tracking preferences, assistant connection settings, and the last foreground observation locally. |
| `tabs` | permission | Identify the selected tab and its URL for the local browsing timeline. |
| `webNavigation` | permission | Record main-frame page navigation for browsing context. |
| `windows` | permission | Distinguish the focused browser window from background/minimized windows so browsing time is not inflated. |
| `idle` | permission | Stop counting browsing time when the device is idle or locked; Tabot does not collect general keystrokes or form values. |
| `alarms` | permission | Retry interrupted local writes and enforce the local page-evidence storage budget. |
| `offscreen` | permission | Host TalaDB's local database worker from an extension-owned page; browser activity stays on device. |
| `<all_urls>` | host permission | Observe page visibility and interaction signals across the websites included in the user's local browsing timeline. |

## Privacy and data use

- Page titles and short visible excerpts are captured automatically on eligible visible pages while tracking is active. Titles are trimmed and bounded to 512 characters. Capture is filtered locally for selected patterns (credentials, tokens, connection strings, payment-card PANs, CVV/expiry, bank/payment and some tax/business identifiers) before persistence. **Detection covers selected patterns and is not exhaustive; email, phone and Indian tax PAN are not covered.** At most four short visible fragments are saved after page settle, viewport dwell, or a trusted interaction; Tabot does not snapshot pages, capture form or editor values, or run in incognito.
- Page excerpts have no time-based expiry. Oldest excerpts are removed only when the 25 MiB local page-evidence cap is exceeded. The popup can delete excerpts by site or all at once; capture continues while tracking is active.
- Event URLs are minimized before persistence: credentials, fragments and arbitrary query parameters are removed, and selected sensitive patterns are redacted from retained paths. On recognized search pages, only the search phrase is retained locally after pattern redaction. Older history may predate this protection and is not silently rewritten or deleted.
- Browser events, automatic excerpts, notes, search indexes and embeddings stay on-device in TalaDB on OPFS, hosted by the extension's offscreen database owner. Existing IndexedDB history is imported and verified before retirement; a migration-only reader remains for profiles that have not upgraded. Search indexes and embeddings are rebuildable; if embedding is unavailable, search degrades to keyword matching.
- **Nothing is uploaded automatically.** Authorized assistant requests return only their documented projections: origins, timestamps, counts, opaque references and explicit match conditions. Page paths, page titles, excerpt bodies and raw events are never returned to assistants.
- Note text and note titles leave the device **only** on explicit note tool calls, after the same selected sensitive-pattern filtering. Filtering is not a guarantee of complete secret removal.
- The optional relay stores connection and OAuth state only — not browser history or tool results. Origins, including identifying subdomains, are not anonymized in returned results.
- If PostHog is configured, the dashboard sends route pageviews and the extension sends only generic unhandled-error and local search-indexing-failure event names with platform and release. No URL, page content, note text, error message or stack is included. PostHog still receives network request metadata; configure its IP/privacy settings and disclose analytics before publication.
- Deleted or unpurged-but-uncaptured activity is simply unavailable. No result means no matching retained activity, not proof of absence.

## Assets and publication requirements

Existing icon: `apps/extension/assets/icon-128.png`. Existing screenshots: `apps/extension/store-assets/`.

Screenshots must be refreshed — current assets show contexts, recurring patterns, activity metrics and export panels that this release does not ship. Replace with:

1. Landing/dashboard Home showing local search across pages, sites and notes.
2. A search result set with site and note groupings.
3. The popup: current-page note controls, tracking state with elapsed time, pause/resume, captured-site list, excerpt deletion controls.
4. ChatGPT connected, with one read-only tool result in the conversation.

Do not show contexts, automations, productivity scores, or any invented metric.

Before submission: verify the live privacy-policy URL, publisher/contact details, screenshot dimensions, disclosure-form categories (browsing history, user activity, optional authentication), the 0.2.5 version field, and whether Chrome shows a new-permission prompt. Existing store status is not established here.

## Version history

| Version | Changes | Status |
| --- | --- | --- |
| 0.2.5 | Landing, Home, assistant-connection guidance and popup rebuilt around browser activity as a data layer for AI-assisted work; local keyword + semantic page search and keyword note/site search; eight read-only assistant tools, replacing the legacy context/pattern/metric tool surface; local storage moved from IndexedDB to TalaDB on OPFS with verified import, replay-safe writes and rebuildable indexes. No new permissions, no automatic uploads. | Draft |
| 0.2.2 | Fix recurring-pattern assistant lookup so MCP results match the dashboard across all retained browsing stretches, preserve pattern IDs as new occurrences arrive, and keep visits separated across long inactivity gaps. No new permissions or raw-history uploads. | Released |
| 0.2.1 | Office-friendly browser-activity popup with site favicons, bounded site map, first-run guidance and scoped dashboard links; foreground-only durations; stop on idle/lock and sleep; add `idle` permission. | Released |
