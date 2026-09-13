---
'extension': patch
---

Service-worker telemetry is collapsed to a single attribute: window focus, the
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
