# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Non-technical office workers who spend their workday across Chrome tabs, alongside founders, operators, researchers, marketers, designers, support staff, and developers. The user is human; the term "digital worker" is wrong (it implies an AI agent) and must not be used in product copy.

## Product Purpose

Tabot is a Chrome extension and web dashboard that record browser activity locally and make it visible as maps of visited sites and how browsing connects over time. People can look back at where they browsed, then ask ChatGPT about their activity through an optional connection. Success: users can see and understand their browsing trail without rebuilding it from memory.

## Positioning

Tabot collects browser activity on the user's device, visualizes it as an explorable activity map, and lets the user ask ChatGPT what happened through an optional, authorized connection. Tabot reports observed sites, visits, and patterns; it does not claim to know intent or productivity. Downloads are secondary: a user-controlled copy for review or audit, not the main product experience. No cloud history sync or Tabot account is needed for local recording and review.

## Operating Context

- **Capture:** Chrome extension (Manifest V3, Plasmo). Chrome tab/window/navigation APIs + content scripts: tab lifecycle, navigation (URL sidecar), page visibility, scroll, clicks, key-occurrence.
- **Transport:** `SharedArrayBuffer` ring buffer (10,000 × 32-byte slots) + `Atomics`; background service worker is sole producer.
- **Persistence:** Dexie 4.x over IndexedDB (`tabot_events`), fully local.
- **Derivation:** pure, lazy, at read time — events → sessions → anchors → temporal graph → episodes → contexts → memories → retrieval → live browser-context snapshot (graphology).
- **Surfaces:** extension popup (pipeline stats) and local web dashboard (stats, charts, sessions, activity summaries, export).
- **Export:** canonical format is JSONL with a manifest — human inspectable, scriptable, reproducible, agent-usable. It is a secondary user-controlled copy for review or audit, not the primary product experience. Schema is documented as evolving while the project is experimental.
- **Development:** pnpm monorepo. `pnpm dev`, `pnpm dev:web`, `pnpm dev:extension`, `pnpm lint`, `pnpm format`, `pnpm knip`.

## Capabilities and Constraints

- **Local browser record.** Raw browser activity and its visual derivations stay on-device. No cloud history sync or Tabot account is required. If the user connects ChatGPT’s Tabot plugin and asks a question, ChatGPT requests a selected, sanitized result (such as an activity summary, pattern details, or activity metrics) from the extension. The online MCP connection service routes requests and results and stores connection/OAuth state, not browser history or tool results.
- **Never recorded:** typed text, key values, form values, passwords, DOM snapshots, page content, screenshots.
- **Raw events are immutable source data.** Every derived object is disposable and rebuildable from raw events; changing a derivation algorithm never requires data migration.
- **Deterministic and bounded:** same input produces same output; all derived/retrieval reads have practical caps.
- **Evidence first:** derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them. Evidence signals, not confidence claims.
- **Event taxonomy:** `behavioral` / `contextual` / `diagnostic`. Diagnostic events never influence derivation. SW telemetry reduced in Phase 2 to a single contextual signal, `SW_WINDOW_FOCUS` — it is never a session boundary and only strengthens existing graph edges.
- **Overflow:** a full ring buffer rejects the event and increments a visible `droppedEvents` counter.
- **Status:** experimental, MIT, v0.1.x. Roadmap is deliberately narrow: stabilize telemetry/export format, improve activity summaries, evaluate AI inference against real examples.

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
5. **Make browsing visible.** Local collection and clear visualization are the core experience; ChatGPT is an optional way to ask about that activity. Downloads exist for review and audit.

## Product Decisions

### 2026-10-09 — Never show raw activity/event counts

Raw event counts (for example, “3,799 activities”) are implementation-dependent and do not help people understand their browsing. Never show or relay raw activity/event counts in user-facing surfaces, including the popup, dashboard, notifications, or ChatGPT context/memory results. Do not relabel event counts as “actions” or “visits.” Use human-interpretable evidence such as time, places, or recurring patterns only when it answers a clear user question; otherwise omit the metric. Event counts may remain internal for derivation and readiness checks.
