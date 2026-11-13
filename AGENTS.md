# Agents — Coding Conventions

This file documents conventions and domain context for **Tabot** — a Chrome activity data layer for AI-assisted work, built as an extension and web dashboard with an optional MCP/OAuth relay.

**Tabot is in early beta.** The product direction is to make browser activity useful to an AI assistant through reusable contexts and user-directed workflows. Current beta features are narrower; do not describe planned contexts or automations as shipped. Chrome events, automatically captured/redacted page excerpts, user-authored notes and search indexes remain local in TalaDB/OPFS. The extension service worker validates and admits bounded work → Pacer batching + serial writer → offscreen TalaDB owner → atomic event/page/search-job commit → local indexing. Dashboard reads through allowlisted Chrome messaging; it never opens extension OPFS directly. The optional relay routes authorized requests to the live extension and stores connection/OAuth state, not browser history/tool results. Requested assistant results leave the device; requested note text/title use selected local patterns for payment-card PANs, CVV/expiry, bank/payment and some tax/business identifiers. Email, phone and Indian tax PAN are not covered; detection is not exhaustive. See `apps/mcp-server/README.md`.

---

## ⚠️ Golden Rule: No Direct Commits

**Never commit directly to the repo.** All changes must be presented to the user for review and approval before any commit is made. The agent stages edits, presents the diff, and waits for the user to confirm before committing.

---

## 🏗️ Project Overview

This is a **pnpm monorepo** with three apps and a shared package:

- `apps/extension/` — Plasmo Chrome extension (captures browser events)
- `apps/web/` — TanStack Start dashboard (Home, Assistant and Settings)
- `apps/mcp-server/` — Cloudflare MCP/OAuth relay for optional ChatGPT connection
- `packages/shared/` — Shared types and utilities

### Architecture

```text
Chrome Extension (Plasmo)
  → Chrome lifecycle + foreground signals; bounded visible excerpts and user-authored notes
  → existing MV3 service worker: validate, redact/minimize, snapshot, bounded admission
  → Pacer Batcher (128 rows / fixed 25 ms window) → AsyncQueuer (FIFO, concurrency 1)
  → offscreen TalaDB owner: deduplicate + atomic event/page/search-job insertMany → OPFS commit → persisted ACK
  ├→ local search indexer + packaged embedding worker → TalaDB FTS/vector indexes
  ├→ popup + TanStack Start Home through extension messaging
  └→ optional authorized extension WebSocket ↔ MCP/OAuth relay ↔ ChatGPT
```

### Key Files

- `docs/tech.md`, `docs/system.md`, `docs/data-flow.md` — current contracts, product walkthrough and failure ownership
- `PRODUCT.md` — product vision, current beta scope, future direction and user-facing language
- `apps/mcp-server/README.md` — relay setup, deployment and ChatGPT connection
- `apps/extension/background.ts`, `apps/extension/ingestion/`, `apps/extension/storage/owner.ts` — extension ingress, bounded writer and sole TalaDB owner
- `apps/extension/dashboard/history.ts` — dashboard request validation and local storage projections
- `apps/extension/relay/relay.ts` — authorized MCP dispatch and result projections
- `apps/web/src/routes/`, `apps/web/src/components/features/home/` — Home, Assistant and Settings surfaces
- `apps/web/src/lib/history.ts` — browser-only extension messaging client
- `packages/shared/src/` — shared domain types, validation and pure helpers
- `apps/web/src/styles/globals.css` — web theme and utilities

### Domain Context

- **Events**: Chrome tab lifecycle, navigation and bounded interaction/foreground signals; never typed values or form data. `NOTE_SAVED` records successful explicit note creation, not note text.
- **Page excerpts**: Separate, automatic while tracking is enabled, foreground-only and bounded. Redaction occurs before persistence; excerpts do not become visits or behavior metrics.
- **Notes**: User-authored/editable content in separate local collection. Distinct from automatic excerpts and deterministic derivations.
- **Ingestion**: `apps/extension/ingestion/event-pipeline.ts` owns bounded memory, FIFO writes, retry/held failures; queued never means durable.
- **Identity/ACK**: Stable source IDs; replay-safe atomic insert of event/page rows and search jobs; persisted ACK only after OPFS commit.
- **Service worker**: Ephemeral scheduler state; no production SAB, dedicated transport worker or drain polling. Search embedding worker is separate from ingestion transport.
- **TalaDB (OPFS)**: Current source of truth for events/pages/notes and rebuildable search data; IndexedDB is migration-only.
- **Search**: Local lexical + full-text/vector search. Packaged embeddings and indexes never go to the relay. Embedding failure degrades to keyword search.
- **Dashboard**: Reads through sender-allowlisted Chrome messaging; no direct OPFS access. Read failure is unavailable/error, never empty history.
- **MCP**: Eight read-only tools. Activity/site projections omit page excerpts; note tools can return explicitly requested note text/title after selected sensitive-pattern redaction. Email and phone remain; never imply complete secret detection.
- **Product boundary**: Contexts and user-directed automations are product direction, not complete beta features. Never label raw events as contexts or claim intent inference, autonomous actions or productivity measurement. `BrowserContext` is an internal derivation contract, not proof of a shipped context workspace.

---

## 🧠 Agent Skill Index

Skills in `.agents/skills/` are shared discovery/install locations. App-level `AGENTS.md` files point agents to relevant skills; do not relocate skill directories under apps unless all supported agents discover nested skills. Keep general tools (for example `agent-browser`) and repo-wide workflows indexed here.

- General browser automation: `.agents/skills/agent-browser/SKILL.md`
- Shared repo workflows: `.agents/skills/changesets/`, `.agents/skills/codebase-design/`, `.agents/skills/improve-codebase-architecture/`
- Web UI skills: indexed in `apps/web/AGENTS.md`
- Extension skills: indexed in `apps/extension/AGENTS.md`
- Video skills: indexed in `videos/AGENTS.md`

## 🧭 Agent Working Practices

- **Read before changing.** Check this file, relevant app `AGENTS.md`, `PRODUCT.md`, the owning implementation and its callers. Trace the whole path before editing; docs can lag source, so verify contracts against code.
- **Reuse before adding.** Search `packages/shared/src/`, existing app utilities and message contracts first. Prefer one existing helper over a new wrapper, dependency or parallel abstraction.
- **Keep ownership clear.** Only `apps/extension/storage/owner.ts` owns TalaDB writes. Route service-worker work through the bounded ingestion pipeline and storage RPC; never open a second writer or make the dashboard write the database directly.
- **Validate at boundaries.** Validate Chrome message sender/payload, dashboard origin, MCP arguments, URLs and user note text before use. Return explicit unavailable/error results; never convert read failures into empty history or success ACKs.
- **Preserve privacy boundaries.** Minimize/redact before persistence; project only required fields to dashboard/MCP; never log raw URLs, titles, excerpts, note text, credentials or full tool results. Do not claim redaction is complete.
- **Preserve durability semantics.** Queued is not persisted. Stable IDs must survive retries; ACK only after commit or matching committed replay. Keep failure ownership, bounded queues and explicit retry outcomes.
- **Keep derived behavior pure.** Reuse shared deterministic derivation; keep I/O in adapters. New metrics must not count excerpts/notes as browser visits or claim inferred intent.
- **Smallest correct change.** No speculative abstraction/config/dependency. Prefer deletion/reuse; document a real performance/scale ceiling and upgrade condition when choosing a bounded shortcut.
- **Leave a runnable check** for non-trivial logic, trust-boundary validation or privacy changes. Prefer existing package `check:*` scripts; run targeted checks and relevant lint/build, report what was not run.
- **No direct commits.** Present diff and wait for explicit user approval before any commit.

## ♻️ Common Utilities — Reuse These

Import shared public APIs from `@tabot/shared` or its declared subpaths; do not deep-import private package files or recreate their behavior.

| Need | Existing utility | Guidance |
| --- | --- | --- |
| HTTP requests/timeouts/errors | `apiClient` from `@tabot/shared/api` | Reuse in web/extension/relay clients; do not hand-roll `fetch` wrappers. |
| Extension tracking messages | `createTrackingClient` from `@tabot/shared/tracking` | Use shared read/set parsing and transport contract. |
| Browser-only web ↔ extension RPC | `apps/web/src/lib/history.ts` | Use for library/search/notes/purge/tracking; never send browsing data through TanStack server functions. |
| Dashboard request/result validation | `isDashboard*` from `@tabot/shared/dashboard`; `isLibraryRequest` / `isLibraryResponse` from `@tabot/shared/library`; `isDashboardSender` from `apps/extension/dashboard/sender.ts` | Reuse at sender and receiver; incompatible responses are failures, not empty results. |
| Site/page/note search and grouping | `browseLibrary`, `rankLibrarySites` from `@tabot/shared/library`; shared history-search helpers | Preserve shared normalization/ranking/result semantics; do not create a second history search implementation. |
| Note validation/domain/session association | `validateNoteText`, `deriveSiteDomain`, `noteMatchesDomain`, `sessionForNote`, `searchNoteRows` from `@tabot/shared` | Reuse for popup, dashboard and relay paths. |
| URL privacy/canonical identity | `sanitizeUrlForIngestion`, `sanitizeEventForIngestion`, `canonicalPageUrl`, `safeRecallUrl` from `@tabot/shared` | Do not parse/redact persisted URLs ad hoc or use raw URLs as page identity. |
| Sensitive-data redaction / derived projection | `sensitiveDataRedactor`, `sanitizeDerived` from `@tabot/shared` | Redact recognized credentials and selected financial/admin identifiers (including payment-card PANs); project allowlisted data. Email, phone and Indian tax PAN are not covered. Do not add handwritten detection regexes or assume all secrets are detectable. |
| Telemetry | `createTelemetry` / `createPostHogTransport` from `@tabot/shared/telemetry` and `/telemetry/posthog` | Use allowlisted route/error events; never add autocapture or browsing payloads. |
| Assistant connection parsing | `parseAssistantConnections` from `@tabot/shared/assistant-connections` | Keep unknown separate from disconnected; OAuth grant state does not prove live socket/tool readiness. |
| MCP schemas/dispatch | `apps/mcp-server/src/mcp/schema/`, `apps/mcp-server/src/mcp/tools.ts` | Extend existing schema/dispatch/projection path; never return database rows directly. |
| Logging/read failures | `logger`, `readFailure` from `@tabot/shared` | Use structured allowlisted codes; never swallow storage errors into empty results. |

Check `packages/shared/package.json` `exports` before importing. Within an app, use its `~/` alias where configured; shared package imports use declared `@tabot/shared` exports.

---

## 🧹 Code Style (Enforced by Biome)

### ES6+ Syntax Only

- **Arrow functions over `function` keyword** — `const fn = () => {}` not `function fn() {}`
  - Exceptions: class methods (`class Foo { method() {} }`) are allowed
- **`const` over `let`**
- **No `var`**
- **Template literals over string concat**
- **No double equals** — use `===` / `!==`

### Imports

- **Path aliases** — within apps that configure it, use `~/` for app source instead of deep `../../` imports; shared package internals may use local relative imports.
  - `~/*` maps to the app's `./src/*`; import shared APIs through declared `@tabot/shared` package exports.
- **No `.js` extensions** in TypeScript imports
- **Organize imports** automatically on save (Biome `assist/organizeImports`)
- **Single quotes** for strings, including import paths
- **Semicolons** always

### Formatting

| Setting | Value |
|---------|-------|
| Indent style | tabs |
| Indent width | 2 |
| Line width | 120 |
| Quotes | single |
| Semicolons | always |

### No Inline Style Props

- **Style with Tailwind `className`, never the `style` prop** — static styling (colors, sizes, positions, gradients, shadows, typography) goes in Tailwind classes, including arbitrary values (`bg-[radial-gradient(...)]`, `w-[172px]`)
- **Exception: runtime-computed values only** — per-frame animation values (Remotion `interpolate`/`spring`), or values derived from runtime data (per-item colors, dynamic delays) may stay in `style`. Keep `style` to those dynamic keys only; every other key belongs in `className`

---

## 🔧 Tooling

### Biome

- Config: [`biome.json`](./biome.json)
- Run: `pnpm lint`
- Auto-fix: `pnpm lint:fix`
- Format only: `pnpm format`

### Husky (pre-commit hook)

- Runs `pnpm lint-staged` before every commit
- `lint-staged` runs `biome check --write` on staged JS/TS files
- Config: [`.husky/pre-commit`](./.husky/pre-commit)

### TypeScript

- Config: [`tsconfig.json`](./tsconfig.json)
- Module: `ESNext`, resolution: `bundler`
- Path alias `~/*` → `./src/*`

---

## 🚫 What Not To Do

- ❌ **No direct commits** — always confirm with the user before committing
- ❌ No `function` keyword declarations (use arrow functions or class methods)
- ❌ No `var`
- ❌ No `.js` extensions in import paths
- ❌ No deep relative imports like `../../types` (use `~/types` instead)
- ❌ No double equals (`==`)
- ❌ No raw event/page records in presentational UI — pass validated library/search/note projections
- ❌ No raw browser-history uploads to the MCP relay — only bounded projected activity/site results or explicitly requested redacted note content leave on authorized tool calls
- ❌ No inline `style` props for static styling — use Tailwind `className` (dynamic runtime values are the only exception)
