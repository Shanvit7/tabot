# Tabot MCP relay

Tabot exposes three read-only MCP tools. `search_activity` searches locally retained browser activity and redacted page previews, returning up to 8 results with site, time range, activity IDs, and reusable `anchors`. Pass `nextCursor` with the same query to continue; `null` means no more results. Pages use a fixed timestamp snapshot.

`find_activity_matches` accepts 1–8 `{kind,id}` anchors from search and returns up to 8 matches for the same page, same site, or timestamps within `maxGapHours`. Each match lists `matchedBy` and `matchedAnchorIds`; this is literal matching, not a relevance score or inferred intent. `maxGapHours` defaults to 168 and is capped at 720.

`get_activity_timeline` accepts the same anchors and options, then returns selected anchors plus one page of matches in chronological order. Items use `role: "anchor"` or `role: "match"`; pagination applies to matches, while anchors repeat on each page.

Full URL paths and raw browser events stay on-device. Only selected sites, timestamps, activity IDs, redacted previews, and match conditions leave the device on explicit tool calls. No results mean no matching retained activity, not proof of absence. The MCP client owns conversation and orchestration. Tabot does not expose legacy context, memory, recurring-pattern, or activity-metric tools.

## Development

`pnpm dev` watches MCP source and deploys changes to a separate dev Worker:

- MCP: `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`
- Relay origin: `https://tabot-mcp-dev.shanvit7.workers.dev`

This is remote deploy-on-change, not a localhost tunnel. The extension must be running to serve calls. For local-only testing, use `pnpm --filter mcp-server dev:local` at `http://localhost:8787`; local state is under `.wrangler/local-state`. Run `pnpm --filter mcp-server dev:inspector` separately and configure Inspector with Streamable HTTP URL `http://localhost:8787/mcp`. Point the unpacked extension at the same origin with `PLASMO_PUBLIC_MCP_RELAY_URL=http://localhost:8787`.

Dev Worker settings are in gitignored `apps/mcp-server/.dev.vars`; never copy production secrets into dev or commit extension credentials. Restart the dev process and reload extension after changing env/manifest values.

## Connect ChatGPT or Claude

Use the full MCP URL ending in `/mcp`. ChatGPT developer connections and Claude custom connectors each require OAuth consent in the same Chrome profile where the Tabot extension is installed and running. After deploying a tool schema/name change, refresh the connector's tool list. Confirm `search_activity`, `find_activity_matches`, and `get_activity_timeline` are discovered.

The extension must stay connected while calls are served. `/health` and OAuth discovery prove only Worker availability; they do not prove extension connectivity. Check relay state in the extension service-worker console:

```js
chrome.runtime.sendMessage({ type: 'GET_RELAY_STATUS' }, console.log)
```

Expect `state: 'connected'` and the intended relay URL. Production and dev credentials are separate.

## Checks

```bash
pnpm --filter mcp-server check
pnpm --filter extension check:activityRelay
pnpm --filter @tabot/shared check:historySearch
```

Checks use synthetic fixtures and local mocks; they do not deploy or establish whether database-query matches are useful on real browser history.

## Security and operations

Anyone able to reach the dev URL can call its endpoints; avoid production bindings and secrets there. `/installations` issues setup credentials without authentication. MCP requires OAuth and scopes requests to the authenticated installation. The relay sends requested search results directly to the client and does not store browser history.

Application logs include route/status/duration, tool name/outcome, and relay lifecycle events; they exclude tool arguments/results, credentials, URLs, and browser activity. Cloudflare native rate limits are per IP and location, not a global WAF. Request bodies are capped at 16 KiB and relay requests at 32 pending per installation.

Production deploy is explicit and never run by these checks:

```bash
pnpm --filter mcp-server deploy:check
cd apps/mcp-server && pnpm run deploy
```

Never rotate `TABOT_AUTH_SECRET` for an ordinary deploy; changing it invalidates installed extension credentials. See Cloudflare dashboard → **tabot-mcp → Observability → Logs** for sampled production logs.
