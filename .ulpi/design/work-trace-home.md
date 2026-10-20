# Home: find and return

## Approved job
Non-technical Chrome users want to recover a past browsing trail, not interpret a graph. User approved retrieval-first Home after rejecting the graph-first experience. Mode: Operate. First success: recognize and open one useful past activity without ChatGPT or graph knowledge.

## Surface contract
- **Thesis:** utility before interpretation; search and recent activity replace the graph as the primary experience.
- **Own-world:** retain white canvas, ink/green tokens and IBM Plex; one tinted recent-activity surface, then ruled earlier entries. No KPI grid, inferred project labels, productivity judgment, streaks or decorative charts.
- **First viewport:** task heading, visible website-name search, most recent activity with View activity action. Three earlier entries follow. Captured favicons only when available; no placeholder icon strip.
- **Journey:** search all recorded activity → choose exact activity → see its websites and dates → optionally reopen a website homepage → return with query/results intact. Evidence is aggregate domains and timestamps, not raw event objects or page content.
- **Form:** user-selected retrieval structure within incumbent visual system; no new visual identity or concept roll. Tailwind and installed components only.

## Behavior and states
- Empty query: newest website-bearing activity by end time, then three earlier entries. Show earlier activity progressively reveals eight more.
- Search: every case-insensitive word must match website names/hosts; works with one character and across all dates. Initially at most eight results; more remain reachable. Clearing restores four recent entries. No undocumented topic/page-content search.
- `/home?context=<id>`: light exact-ID detail, independent of search and graph caps. Missing ID shows explicit unavailable state; an internal-browser-only record remains addressable but has no website links. Never substitute another activity.
- Website links accept HTTP(S) only and canonicalize to origins; no credentials, paths or query strings reach links. Ports remain distinct. Copy explicitly distinguishes homepages from previous pages. New tabs use noopener/noreferrer and accessible labels.
- Selection moves focus to detail heading; returning restores search focus. Search remains in memory during same-route navigation; refresh starts a new search. URL retains exact activity ID, not query text.
- First run: browse normally in Chrome, then return; no fabricated history. Loading uses plain status text, not an animated map. Existing extension-required redirect and degraded snapshot warning remain.
- No results: short recovery hint and Clear search. More results, cross-midnight dates, long hosts and missing favicons must remain usable.
- Explore connections is a native disclosure, closed initially. Only opening it imports graph code and projects sessions. Closing unmounts it. Independent Today / 7 days / 30 days / All time control; empty range offers All time. Scoped error boundary prevents optional graph failure from taking down retrieval.
- Assistants and collapsed export remain secondary. Naming/saving activities is not part of this implementation; do not imply either exists.

## Accessibility and responsive rules
Visible search label, 16px search text, 44px+ controls, native links/disclosure/select, live search status, stable keyboard focus, no color-only evidence. Layout stacks on narrow screens without document overflow. No ambient animation on retrieval surfaces; graph retains reduced-motion and explicit replay behavior.

## Boundaries
No capture/schema changes, cloud sync, new dependencies, exact-page restore, AI-inferred task names or persistence for saved activities. Preserve existing graph membership semantics and separate Activity/Recurring patterns routes. Review screenshots use labeled synthetic aggregates, not private history; real-user validation remains necessary before release.

## Verification
`pnpm --filter web check:home`, `check:graph`, TypeScript and Vite build. Browser checks: desktop/mobile presentation, search and return, safe homepage links, empty/missing records, pagination, graph lazy load/unmount, and closed-graph network absence.
