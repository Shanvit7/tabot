# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Non-technical office workers who spend their workday across Chrome tabs, alongside founders, operators, researchers, marketers, designers, support staff, and developers. The user is human; the term "digital worker" is wrong (it implies an AI agent) and must not be used in product copy.

## Product Purpose

Tabot is a Chrome extension and web dashboard that record browser activity locally and help people find their way back to websites they visited. Home leads with recent activity and website-name search; connection maps are optional exploration. People can also ask ChatGPT about their activity through an optional connection. Success: users recover a useful browsing trail without rebuilding it from memory or learning a graph.

## Positioning

Tabot collects browser activity on the user's device, makes recent activity searchable and recognizable, and offers an optional connection map and authorized ChatGPT questions. Tabot reports observed sites, visits, and patterns; it does not claim to know intent or productivity. Downloads are secondary: a user-controlled copy for review or audit, not the main product experience. No cloud history sync or Tabot account is needed for local recording and review.

## Operating Context

- **Capture:** Chrome extension (Manifest V3, Plasmo). Chrome tab/window/navigation APIs + content scripts: tab lifecycle, navigation (URL sidecar), page visibility, scroll, clicks, key-occurrence, and separately consented visible-text excerpts.
- **Transport:** bounded Pacer batching and serial writes in the extension service worker; no SharedArrayBuffer or transport worker.
- **Persistence:** TalaDB 0.12.1 in one OPFS-backed database, fully local; IndexedDB is used only to import legacy profiles.
- **Derivation:** pure, lazy, at read time — events → sessions → anchors → temporal graph → episodes → contexts → memories → retrieval → live browser-context snapshot (graphology).
- **Surfaces:** extension popup (pipeline stats) and local web dashboard (stats, charts, sessions, activity summaries, export).
- **Export:** canonical format is JSONL with a manifest — human inspectable, scriptable, reproducible, agent-usable. It is a secondary user-controlled copy for review or audit, not the primary product experience. Schema is documented as evolving while the project is experimental.
- **Development:** pnpm monorepo. `pnpm dev`, `pnpm dev:web`, `pnpm dev:extension`, `pnpm lint`, `pnpm format`, `pnpm knip`.

## Capabilities and Constraints

- **Local browser record.** Raw browser activity and its visual derivations stay on-device. No cloud history sync or Tabot account is required. If the user connects ChatGPT’s Tabot plugin and asks a question, ChatGPT requests a selected, sanitized result (such as an activity summary, pattern details, or activity metrics) from the extension. The online MCP connection service routes requests and results and stores connection/OAuth state, not browser history or tool results.
- **Never recorded:** typed text, key values, form values, passwords, whole-page snapshots, screenshots.
- **Visible excerpts:** captured automatically while global tracking is active. At most four visible fragments are saved after a one-second foreground dwell or trusted interaction. Capture excludes incognito, authentication routes, editable/form surfaces, and content not confirmed visible. Excerpts stay local and are not included in assistant requests. No time-based expiry; the oldest records are removed only when the 25 MiB storage budget is exceeded. PII detection covers selected patterns, not every name or secret.
- **Evidence boundaries:** raw events stay immutable; page excerpts use a separate local store. Excerpts never inflate visit, duration, session, readiness, or recurring-pattern metrics. Evidence-backed outcome claims must link to observations that support them.
- **Deterministic and bounded:** same input produces same output; all derived/retrieval reads have practical caps.
- **Evidence first:** derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them. Evidence signals, not confidence claims.
- **Event taxonomy:** `behavioral` / `contextual` / `diagnostic`. Diagnostic events never influence derivation. SW telemetry reduced in Phase 2 to a single contextual signal, `SW_WINDOW_FOCUS` — it is never a session boundary and only strengthens existing graph edges.
- **Overflow:** a full bounded ingest queue rejects the event and increments internal `droppedEvents` counter.
- **Status:** experimental, MIT; v0.2.1 release prepared, not deployed. Roadmap is deliberately narrow: stabilize telemetry/export format, improve activity summaries, evaluate AI inference against real examples.

## Brand Commitments

- **Name:** Tabot.
- **Binding copy:** "Private, local browser activity timeline. Thinking across tabs." (extension description; user-confirmed).
- **Audience rule:** the user is a human worker who works in Chrome. Never "digital worker" — that term belongs to AI agents.
- **Binding UI terminology:** say **activity** or **activity summary**, plural **activities** or **activity summaries**. Never label anything **context** or **contexts** in user-facing copy, including headings, buttons, links, accessibility labels, empty states, notifications, onboarding and help. `context` may remain in internal types, variable names, API names and URL parameters; do not expose it as a product label.
- **Plain-language rule:** write for non-technical office workers. Remove technical recording/derivation footnotes that do not help them act; use accurate, short labels such as "First seen" and "Last seen" instead. Do not add boilerplate explaining foreground time, event counts, observation boundaries or how sessions span internal contexts. Keep necessary privacy, security and data-loss warnings.
- **Logo:** `assets/logo.png`; extension icon `apps/extension/assets/icon.png`; web logo `apps/web/public/logo.png`.
- Design tokens (typography, colors, neubrutalist style) live in `PRODUCTS.md`.

## Evidence on Hand

- `README.md` — product narrative, pipeline overview, export summary, can/cannot-know boundary.
- `docs/system.md` — walkthrough of current behavior (source of truth alongside tech.md).
- `docs/tech.md` — technical specification, single source of truth for architecture and derivation.
- Extension manifest permissions: `storage`, `tabs`, `webNavigation`, `windows` (+ `host_permissions: <all_urls>` for URL sidecar).
- Real data exists only as the user's own local browser activity. There are **no** public demo datasets, testimonials, customers, case studies, press, or benchmarks. Do not fabricate any.

## Product Principles

1. **The user owns their data.** Collection is Tabot's job; judgment is the user's.
2. **Local-first is a boundary, not a feature.** Nothing leaves the device unless the user exports it.
3. **Evidence over interpretation.** Report what happened — where, when, how it connected. Never assert what it meant.
4. **Raw events are the only truth.** Everything derived is disposable, rebuildable, deterministic.
5. **Make past browsing useful.** Recent activity and search deliver value before visualization. Connection maps and ChatGPT are optional ways to explore further. Downloads exist for review and audit.

## Product Decisions

### 2026-10-09 — Never show raw activity/event counts

Raw event counts (for example, “3,799 activities”) are implementation-dependent and do not help people understand their browsing. Never show or relay raw activity/event counts in user-facing surfaces, including the popup, dashboard, notifications, or ChatGPT context/memory results. Do not relabel event counts as “actions” or “visits.” Use human-interpretable evidence such as time, places, or recurring patterns only when it answers a clear user question; otherwise omit the metric. Event counts may remain internal for derivation and readiness checks.
