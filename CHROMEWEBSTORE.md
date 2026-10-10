# Chrome Web Store — Tabot

Draft permission/privacy update for the 0.2.0 extension release, including foreground-time tracking and authorized activity-metrics and recurring-pattern tools. Last updated: October 10, 2026. Prepared manifest version: 0.2.0. No store submission or publication performed.

## Store listing

- Name: Tabot
- Short description: Private, local browser activity timeline. Thinking across tabs.
- Category: Productivity
- Language: English
- Single purpose: Turn local browser activity into structured browsing context that users can review and share.
- Feature update: Context durations count foreground browsing, excluding hidden tabs, idle/lock, sleep, and gaps between browsing stretches. Elapsed coverage remains separately available. Activities shows observation-based estimates and can send a selected period or site's aggregate metrics to an authorized ChatGPT connection. Recurring patterns can ask the connected assistant to discover repeated browsing patterns or explain selected evidence.

## Permissions justification

| Permission | Type | User-facing reason |
| --- | --- | --- |
| `storage` | permission | Save tracking preferences, assistant connection settings, and the last foreground observation locally. |
| `tabs` | permission | Identify the selected tab and its URL for the local browsing timeline. |
| `webNavigation` | permission | Record main-frame page navigation for browsing context. |
| `windows` | permission | Distinguish the focused browser window from background/minimized windows so browsing time is not inflated. |
| `idle` (new) | permission | Stop counting browsing time when the device is idle or locked; no keyboard values or typed text are collected. |
| `alarms` | permission | Check foreground browsing periodically and check when completed contexts are ready. |
| `notifications` | permission | Notify users when a completed browsing context is ready to review or share. |
| `<all_urls>` | host permission | Observe page visibility and interaction signals across the websites included in the user's local browsing timeline. |

## Privacy and data use

- URLs, tab/window IDs, timestamps, and interaction signals remain local as raw events. URLs themselves can contain sensitive information.
- Foreground sampling adds timestamps and browser focus/idle state, not page contents, typed text, screenshots, or keystroke values. Idle state is used to decide whether to sample, not saved as a new raw event type.
- The last foreground observation is saved in session storage to survive service-worker restarts. Browsing events remain in local IndexedDB.
- The optional authorized ChatGPT connection returns sanitized derived context or site-level aggregate metrics for a requested time range. Metrics contain HTTP(S) origins, estimated time, visits, active days, and aggregate site-to-site transitions, never raw events, page paths, query strings, credentials, or favicons. Origins (including identifying subdomains) are not anonymized. Raw history is not uploaded or persisted by the relay. A user-initiated export shares the selected context with its chosen recipient.
- Authorized pattern discovery returns bounded derived summaries; selected-pattern lookup adds occurrence timestamps, supporting context identifiers and origin-only sequences, not raw events or page URLs. Confidence describes heuristic similarity, not user intent or productivity. Discovery uses recent derived contexts and is not exhaustive history.
- Historical active-time estimates cannot reconstruct attention when old visibility/focus evidence is absent. Existing downloads must be exported again to receive the fix.

## Assets and publication requirements

Existing icon: `apps/extension/assets/icon-128.png`. Existing screenshots: `apps/extension/store-assets/`. Refresh Activities screenshots to show the period/site assistant actions and keyboard-accessible place selector; update duration examples if screenshots include old inflated durations. Refresh Recurring patterns screenshots for the connected-only overview action and selected-pattern action. Refresh popup screenshots: white/green browser-activity interface with plain office-friendly language explaining recorded visits and movement between sites, review, and user-chosen sharing (not bookmarks or saved page contents), captured site favicons, a bounded site map and expandable full-site list, scoped dashboard links, and compact pause/resume. Popup has no activity counts, duration metrics, or technical readiness tags; its Observing indicator uses a clearly visible lime breathing dot on a dark backing with a reduced-motion alternative. Popup content uses one slim, transparent-track scrollbar; expanded site lists do not nest a second scrollbar, and the main content remains keyboard-scrollable. Pause/resume uses a bordered, icon-labeled button. The site map's Activity node uses a compact 56px rounded-square badge with a 20px lime history icon from Lucide rather than a circular medallion; popup icons use the same library. A compact top banner invites users to connect ChatGPT and ask about their browsing only when the existing authorization check confirms disconnection; loading, unknown, and connected states hide it. Its Connect link opens ChatGPT setup in a new tab without sharing activity or granting access automatically. Full provider grids, CLI/export controls, and connector setup panels remain removed from the popup; existing dashboard integrations remain unchanged. Asset dimensions and submission readiness not validated in this task.

Before submission: verify live privacy-policy URL, publisher/contact details, full listing copy, disclosure-form categories (including browsing history, user activity, and optional authentication), screenshot dimensions, release version, and Chrome's new-permission upgrade prompt. Existing store status is not established here.

## Version history

| Version | Changes | Status |
| --- | --- | --- |
| Unreleased | Office-friendly browser-activity popup explaining what is recorded and how users can review or share it, with site favicons, bounded site map, first-run guidance, animated Observing status, and scoped dashboard links; replace bookmark imagery and saved-site wording with Activity and Review activity; remove technical labels and activity/duration metrics; remove popup provider/export/connector panels while adding a compact disconnected-only ChatGPT connection prompt, without changing capture or dashboard integrations. Foreground-only context durations; stop on idle/lock and sleep; add `idle` permission; export derivation schema 9; authorized site-level activity metrics and Activities assistant actions; recurring-pattern discovery and bounded occurrence evidence with Recurring patterns assistant actions (no additional permissions for either integration). | Draft |
