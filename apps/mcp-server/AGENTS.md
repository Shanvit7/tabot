# MCP Relay Agent Guide

Read repository [`../../AGENTS.md`](../../AGENTS.md) first for shared coding, privacy and safety rules. Read [`README.md`](README.md) for current tool behavior, local/dev setup and operational checks before changing this app.

## Service Boundaries

- This app is a Cloudflare Worker using Hono and the MCP TypeScript SDK. `src/index.ts` owns HTTP routing, OAuth integration and MCP tool registration; `src/auth/` owns OAuth/install state and token checks; `src/mcp/` owns tool names, schemas and protocol errors.
- The extension is the live source of browser activity. The relay has no browser-history database: Durable Objects hold installation/auth/connection state only. Never persist browser events, page content, tool arguments or tool results here.
- MCP tools are read-only, OAuth-authorized projections. Keep schemas narrow, validate untrusted input, enforce per-installation dispatch and pagination limits, and align returned fields with extension handlers and README.
- Do not send full URLs, page paths, titles, raw browser events or unredacted notes. Do not add logging of request bodies, credentials, tool arguments/results or user activity; keep logs to operational metadata.
- Preserve OAuth scope and installation isolation, request/body/rate limits, and explicit offline/error behavior. `/health` or OAuth discovery alone does not prove a live extension connection.
- `wrangler.toml` is production configuration. Keep dev/local bindings isolated; never copy production secrets into `.dev.vars` or commit credentials.

## Checks and Deployment

Run `pnpm --filter mcp-server check` for type, production-safety and activity-surface checks. `pnpm --filter mcp-server deploy:check` adds a Wrangler dry run. Neither deploys. Production deployment is explicit: `cd apps/mcp-server && pnpm run deploy`; run it only when specifically requested.

For local-only Worker tests, use `pnpm --filter mcp-server dev:local`; `pnpm --filter mcp-server dev` deploys changes to the separate dev Worker. Read the README before starting either workflow.
