# Chrome Web Store — Tabot

Draft permission/privacy update for the unreleased foreground-time fix and authorized activity-metrics and recurring-pattern tools. Last updated: October 7, 2026. Current package version: 0.1.3. No store submission or publication performed.

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

Existing icon: `apps/extension/assets/icon-128.png`. Existing screenshots: `apps/extension/store-assets/`. Refresh Activities screenshots to show the period/site assistant actions and keyboard-accessible place selector; update duration examples if screenshots include old inflated durations. Refresh Recurring patterns screenshots for the connected-only overview action and selected-pattern action. Asset dimensions and submission readiness not validated in this task.

Before submission: verify live privacy-policy URL, publisher/contact details, full listing copy, disclosure-form categories (including browsing history, user activity, and optional authentication), screenshot dimensions, release version, and Chrome's new-permission upgrade prompt. Existing store status is not established here.

## Version history

| Version | Changes | Status |
| --- | --- | --- |
| Unreleased | Foreground-only context durations; stop on idle/lock and sleep; add `idle` permission; export derivation schema 9; authorized site-level activity metrics and Activities assistant actions; recurring-pattern discovery and bounded occurrence evidence with Recurring patterns assistant actions (no additional permissions for either integration). | Draft |
