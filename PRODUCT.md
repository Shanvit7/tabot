# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Human workers who work in Chrome — the browser is their operating plane. Founders, operators, researchers, marketers, designers, support staff, developers: people whose work happens across tabs. The user is human; the term "digital worker" is wrong (it implies an AI agent) and must not be used in product copy.

## Product Purpose

Tabot is a privacy-first, local-first work-memory layer: a Chrome extension plus web dashboard that collect browser activity, keep it local, and deterministically derive browser context (sessions, activity episodes, contexts, behavioral memories). It turns the user's local browser activity into structured data the user owns, so work can be picked up later — by the user, an AI assistant they choose, or any future tool — without rebuilding context from scratch. Success: the user sees where their work happened, where they left off, and can hand that data to whatever they want.

## Positioning

Tabot does the end user's basic data collection. What the data is used for is the user's use case — it is up to them; Tabot makes no claims about intent or productivity. The main feature from Tabot's side is **sharing this data**: local, portable, user-controlled export that any tool can consume. No cloud, no Tabot backend, no opinion on the user's intelligence layer. User's data → user's context → user's choice of tool.

## Operating Context

- **Capture:** Chrome extension (Manifest V3, Plasmo). Chrome tab/window/navigation APIs + content scripts: tab lifecycle, navigation (URL sidecar), page visibility, scroll, clicks, key-occurrence.
- **Transport:** `SharedArrayBuffer` ring buffer (10,000 × 32-byte slots) + `Atomics`; background service worker is sole producer.
- **Persistence:** Dexie 4.x over IndexedDB (`tabot_events`), fully local.
- **Derivation:** pure, lazy, at read time — events → sessions → anchors → temporal graph → episodes → contexts → memories → retrieval → live browser-context snapshot (graphology).
- **Surfaces:** extension popup (pipeline stats) and local web dashboard (stats, charts, sessions, contexts, export).
- **Export:** canonical format is JSONL with a manifest — human inspectable, scriptable, reproducible, agent-usable. Schema is documented as evolving while the project is experimental.
- **Development:** pnpm monorepo. `pnpm dev`, `pnpm dev:web`, `pnpm dev:extension`, `pnpm lint`, `pnpm format`, `pnpm knip`.

## Capabilities and Constraints

- **100% local.** No backend, authentication, cloud sync, LLM, embeddings, productivity scoring, or semantic task/intent inference. This is a hard product boundary, not a roadmap item to quietly relax.
- **Never recorded:** typed text, key values, form values, passwords, DOM snapshots, page content, screenshots.
- **Raw events are immutable source data.** Every derived object is disposable and rebuildable from raw events; changing a derivation algorithm never requires data migration.
- **Deterministic and bounded:** same input produces same output; all derived/retrieval reads have practical caps.
- **Evidence first:** derived values retain IDs, domains, timestamps, counts, similarity, staleness, and recurrence data that support them. Evidence signals, not confidence claims.
- **Event taxonomy:** `behavioral` / `contextual` / `diagnostic`. Diagnostic events never influence derivation. SW telemetry reduced in Phase 2 to a single contextual signal, `SW_WINDOW_FOCUS` — it is never a session boundary and only strengthens existing graph edges.
- **Overflow:** a full ring buffer rejects the event and increments a visible `droppedEvents` counter.
- **Status:** experimental, MIT, v0.1.x. Roadmap is deliberately narrow: stabilize telemetry/export format, improve derived-context usefulness, evaluate AI inference against real examples.

## Brand Commitments

- **Name:** Tabot.
- **Binding copy:** "Private, local browser activity timeline. Thinking across tabs." (extension description; user-confirmed).
- **Terminology rule:** the user is a human worker who works in Chrome. Never "digital worker" — that term belongs to AI agents.
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
5. **Sharing is the feature.** Portable, inspectable, tool-agnostic export is the main thing Tabot gives the user.
