# extension

## 0.2.5

### UX revamp, local storage change and product pivot

Tabot now leads with browser activity as a data layer for AI-assisted work. The landing page, Home, assistant connection guidance and popup are rebuilt around that: find retained pages, sites and notes locally, review what you have been doing, and connect ChatGPT when you want help with it.

- Search retained pages with local keyword and semantic matching, and notes and sites with keyword matching. Long result lists stay responsive.
- Connect ChatGPT to eight read-only tools, including unified search, related activity and a chronological browsing timeline. Requested note text and titles are filtered for selected sensitive patterns first; email, phone and Indian tax PAN are not covered, and detection is not exhaustive.
- Move local storage from IndexedDB to TalaDB on OPFS. Existing IndexedDB history is imported and verified before retirement, writes are replay-safe with persisted acknowledgement, and local search indexes are rebuildable.
- Browser events, automatic excerpts, notes and search indexes stay on your device. Only the bounded results of tool calls you request leave it.
- Reusable contexts and user-directed automations remain product direction, not shipped beta features.

## 0.2.2

### Patch Changes

- 4ba4d22: Fix recurring-pattern results so dashboard links resolve consistently and visits separated by long inactivity gaps remain distinct.

## 0.2.1

### Patch Changes

- Guide people through adding Tabot in ChatGPT, with marketplace switching controlled remotely so future approval does not require another extension update.
- Count foreground browsing time only; hidden tabs, idle/lock, sleep, and gaps no longer inflate active duration.
- Add the `idle` permission to stop attention sampling while the device is idle or locked. Existing local history is re-derived without migration; re-export old downloads to get corrected conservative duration estimates.

## 0.2.0

### Minor Changes

- a17b306: Give Tabot a clearer map of your browsing, time spent actively using sites, and recurring patterns. You can ask ChatGPT about a time period, site, or pattern; your browsing history stays on your device, and only the summary you request is shared. The update also refreshes the popup, notifications, exports, and getting-started experience.

## 0.1.3

### Patch Changes

- 490bf03: Add a share-first dashboard with full activity and memory views, and protect exported context with local PII redaction.

## 0.1.2

### Patch Changes

- 812e96b: Service-worker telemetry is collapsed to a single attribute: window focus, the
  only SW signal that survived — four SW signal types were tried (popup opens,
  tracking toggles, downloads, worker lifecycle) and all four are retired as
  diagnostic, invisible to sessions, contexts, and memories. Window focus is kept
  but only as cross-window continuity evidence at the graph layer — never a
  session boundary, never a context driver. Result: popup polling, toggle noise,
  and download telemetry no longer fragment or pollute your activity.
  
  Share Context is now the first thing the popup shows. Pick a period (Today by
  default, plus last 7 days or all time), tap a target, and Tabot downloads that
  period's activity as a JSONL file to drop into the AI of your choice.
  Re-sharing identical data is skipped via a content-hash checkpoint, so you never
  re-download the same file. Live focus, browsing stretches, and most-visited
  replace the old raw counters. Dashboard export presets now list All time before
  Custom.
