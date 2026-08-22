# Tabot

A Chrome extension + web dashboard for collecting and processing browser activity events at high volume. Uses `SharedArrayBuffer` + Web Workers for off-main-thread event processing, with a TanStack Start dashboard for visualization.

## Architecture

```
Chrome Extension (Plasmo)
  → Browser activity events
  → SharedArrayBuffer + Atomics
  → Web Worker (aggregation)
  → Dexie / IndexedDB (local persistence)
  → TanStack Start dashboard
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the web dashboard
pnpm --filter web dev

# Run the Chrome extension (dev mode)
pnpm --filter extension dev

# Build everything
pnpm build
```

## Extension Development

1. `pnpm --filter extension dev`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Load the generated extension build
5. Open the Tabot popup

## Project Structure

```
tabot/
├── apps/
│   ├── extension/    # Plasmo Chrome extension
│   └── web/          # TanStack Start dashboard
├── packages/
│   └── shared/       # Shared types and utilities
└── docs/
    └── setup.md      # Detailed architecture docs
```

## Tech Stack

- **Extension:** Plasmo
- **Web:** TanStack Start + React + Tailwind CSS
- **UI Components:** BoldKit (Neubrutalism design system)
- **Concurrency:** SharedArrayBuffer + Atomics
- **Storage:** Dexie (IndexedDB)
- **Language:** TypeScript
- **Package Manager:** pnpm
