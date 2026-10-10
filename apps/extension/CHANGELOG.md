# extension

## 0.2.0

### Minor Changes

- a17b306: Give Tabot a clearer map of your browsing, time spent actively using sites, and recurring patterns. You can ask ChatGPT about a time period, site, or pattern; your browsing history stays on your device, and only the summary you request is shared. The update also refreshes the popup, notifications, exports, and getting-started experience.

## Unreleased

- Count only foreground browsing time. Background refreshes, hidden tabs, idle/lock, and sleep no longer extend active duration. Episode/context duration sums active time across sessions; elapsed coverage is separately exposed as `wallDuration`.
- Add the `idle` permission to stop attention sampling when the device is idle or locked. Existing local history is re-derived without a database migration; re-export old downloads for corrected, conservatively estimated durations.

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
