# Tabot dashboard

The dashboard is the current beta review surface for Tabot's broader browser activity data layer for AI-assisted work. TanStack Start + React + Tailwind v4. `/home` is the local Home surface; `/` remains the landing page. The shared workspace dock links Home, AI, and Assistant.

## Local setup

1. Install workspace dependencies: `pnpm install`.
2. Build the extension with `pnpm --filter extension build` and load `apps/extension/build/chrome-mv3-prod` unpacked in Chrome. Reload an existing installation after rebuilding.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`. Current extension builds report their runtime ID automatically; `VITE_TABOT_EXTENSION_ID` remains an optional preferred ID and fallback for older builds.
4. Run `pnpm --filter web dev` and open `http://localhost:3000/home` in that same Chrome profile. Refresh the dashboard after installing or reloading the extension.

The extension accepts dashboard reads from localhost ports 3000/3001 and `https://shanvit7.github.io/tabot/`. Other addresses, relay pages, and other extensions are not authorized to read page previews. No new extension permissions are needed.

## Home

- Search retained local evidence with the existing ranked `SEARCH_HISTORY` API (up to 20 URL groups).
- Select a result to read its cited, sanitized capture. Choose other retained page citations under the source disclosure.
- Open the original page in a new tab; inspect first/last-seen dates and capture/event counts.
- Distinguish missing captures, no matches, unavailable extension, invalid responses, and storage failures. Previous results survive a failed search.

Search text, category, and period stay in the local route URL for direct links. Returned evidence stays in browser memory and is not sent through server functions or uploaded to the optional MCP relay. Captured text renders as text, never HTML; page labels come from URL paths rather than invented titles. No remote favicons are fetched.

Server rendering/prerendering produces a stable search shell. Chrome messaging runs only after hydration or user actions, behind `createClientOnlyFn`. Components use Tailwind utilities and existing semantic theme tokens; no inline styles or CSS modules.

## Checks

```sh
pnpm --filter web build
pnpm --filter web check:extensionConnection
pnpm --filter extension check:dashboardSender
pnpm --filter extension check:dashboardHistory
pnpm --filter extension build
```

See [data and API notes](../../docs/search-result-cards.md) for available fields and privacy boundaries.
