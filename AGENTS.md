# Agents — Coding Conventions

This file documents the conventions and domain context for **Tabot** — a Chrome extension + web dashboard for collecting and processing browser activity events at high volume.

**The product is an engineering prototype.** V1 proves the event pipeline works: Chrome Extension → SharedArrayBuffer + Atomics → Web Worker → RxDB → TanStack Start dashboard. No AI, no auth, no cloud backend.

---

## ⚠️ Golden Rule: No Direct Commits

**Never commit directly to the repo.** All changes must be presented to the user for review and approval before any commit is made. The agent stages edits, presents the diff, and waits for the user to confirm before committing.

---

## 🏗️ Project Overview

This is a **pnpm monorepo** with two apps and a shared package:

- `apps/extension/` — Plasmo Chrome extension (captures browser events)
- `apps/web/` — TanStack Start dashboard (displays aggregated stats)
- `packages/shared/` — Shared types and utilities

### Architecture

```text
Chrome Extension (Plasmo)
  → Browser activity events (TAB_CREATED, TAB_ACTIVATED, TAB_UPDATED, TAB_REMOVED)
  → SharedArrayBuffer + Atomics (ring buffer)
  → Web Worker (aggregation + batching)
  → RxDB (local persistence)
  → TanStack Start dashboard (visualization)
```

### Key Files

- `docs/setup.md` — Full architecture docs, event model, V1 spec
- `apps/web/src/routes/` — Dashboard pages
- `apps/web/src/components/ui/` — BoldKit UI components
- `apps/web/src/styles/globals.css` — Theme + BoldKit utilities

### Domain Context

- **Events**: Tab lifecycle events from Chrome (created, activated, updated, removed)
- **SharedArrayBuffer**: Fixed-size ring buffer for high-speed event transport between producer (extension) and consumer (worker)
- **Atomics**: Coordinates read/write indexes in the shared buffer
- **Worker**: Processes events off main thread, maintains aggregates, batches to RxDB
- **RxDB**: Local event store for persistence (not uploaded anywhere)
- **Dashboard**: Displays aggregated stats only — never consumes raw event stream

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

- **Path aliases** — use `~/` instead of relative `../../` paths
  - `~/*` maps to `./src/*`
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
- ❌ No raw event objects in UI components — only aggregated stats
- ❌ No cloud storage or backend APIs in V1 — everything stays local
