# Web App Agent Guide

Read repository [`../../AGENTS.md`](../../AGENTS.md) first for product boundaries, common utilities, privacy rules and shared coding conventions. Verify contracts against current routes and extension message handlers before changing them.

## Skills

For work under `apps/web/`, load applicable shared skills from `../../.agents/skills/`:

- TanStack Start: `../../.agents/skills/tanstack-start/`, `../../.agents/skills/tanstack-start-best-practices/`
- Charts: `../../.agents/skills/tanstack-charts/`
- React and UI: `../../.agents/skills/vercel-react-best-practices/`, `../../.agents/skills/shadcn/`, `../../.agents/skills/tailwind-design-system/`, `../../.agents/skills/ui-ux-pro-max/`, `../../.agents/skills/frontend-design-ui-ux/`, `../../.agents/skills/impeccable/`, `../../.agents/skills/react-call/`
- Web performance: `../../.agents/skills/core-web-vitals/`

Load only skills relevant to the task. Keep shared skills at repository root.

## App Boundaries

- This is the current browser-side beta surface for Tabot's broader browser activity data layer: Home, Assistant and Settings, built with TanStack Start, TanStack Router and Rsbuild. Public `/` and `/privacy` are prerendered; local workspace routes must remain usable with their current client-only/extension-connected behavior.
- Browser records stay in the Chrome extension. Use `src/lib/history.ts` for browser-only extension messaging; never move history reads or writes into TanStack server functions, route loaders running on the server, or web storage.
- Do not access extension OPFS directly. Validate dashboard messages at both ends, use sender allowlisting, and show read failures as unavailable/error rather than empty history.
- Keep browsing projections, search, note validation and URL privacy behavior aligned with `@tabot/shared`; see the common utilities table in `../../AGENTS.md` before adding code.
- Use existing route files and `createFileRoute`; `src/routeTree.gen.ts` is generated and must not be edited manually.
- `VITE_SITE_URL` is the canonical deployment URL. Read it through `src/lib/constants.ts` (`SITE_URL`, `SHARE_URL`, `OG_IMAGE_URL`); do not duplicate the GitHub Pages URL. Keep `VITE_BASE_PATH` handling intact for project-page assets and links.
- Keep user-facing language aligned with repository [`PRODUCT.md`](../../PRODUCT.md): position Tabot as browser activity for AI-assisted work. Describe the current dashboard as Home; contexts and user-directed automations remain future direction until implemented. Never label raw events as contexts or claim intent/productivity inference.

## Checks

- `pnpm --filter web build` — production Rsbuild build and TypeScript check.
- `pnpm --filter web check` — Home search and results checks.
- `pnpm --filter web check:tutorial` — tutorial-specific behavior.

Run the narrowest relevant check, then build for route, metadata, environment or shared-client changes. Report checks not run.
