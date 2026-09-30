# Home: observed connections

## Goal
Resume an observed context or hand its exact ID to connected ChatGPT. Do not present telemetry, sessions, patterns, and export at once.

## Visual grammar
- `/home`: bounded TanStack Charts force layout, at most 5 recent contexts, 7 sites, 2 recurrent memories. Context↔site edges mean membership in `context.domains`; memory↔context edges mean `memory.contextIds` includes ID. No generic site↔site or inferred-topic links. Selected context ring; a native selector drives exact detail and URL. Chart is explanatory, not the sole interaction control.
- `/activities`: time-series of recorded browser moments (not productivity). Period selector affects chart only; context selector exposes exact sites, counts, duration; session evidence behind a disclosure. A force graph here would imply event relationships that raw counts cannot prove.
- `/memories`: bar chart shows separate occurrence counts for recurrent patterns. Selector opens observation, last-seen and supporting context ID. Pattern strength/confidence is not shown as an objective score. Force graph of all memories would obscure comparison and wrongly suggest associations between patterns.
- Export: `<details>` closed on Home; sanitized JSONL is downloaded locally, manually uploaded by user. No automatic upload. ChatGPT exact-ID handoff remains distinct and gated by readiness/settling rules. Missing requested IDs never fall back.

## UI constraints
White canvas; neutral surface around charts; ink, green and lime only. Compact nav Home / Activity / Memories; no homepage KPI grid, preview lists, or decorative artwork. Keyboard-operable selectors and links; descriptions explain mark meaning without color; empty/missing-extension states are explicit. Only `/home?context=<id>` is supported; extension notification and popup open `/home`.

TanStack Charts is pre-alpha in this repo (`^0.16.0`). Do not add new chart packages. Bound graph before synchronous force settlement; dynamic-import graph and charts off initial Home shell. Validate with real local browser data before release.
