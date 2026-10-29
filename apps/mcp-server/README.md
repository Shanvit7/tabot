# Tabot MCP relay

Tabot exposes three read-only MCP tools. `search_evidence` searches browser events and visible-page excerpts retained locally by the Chrome extension, returning up to 8 matching origins per page with timestamps, source IDs, and redacted excerpts. Pass `nextCursor` with the same query to fetch the next page; `null` means no more results. Cursor pins a timestamp snapshot to avoid ordinary new activity reshuffling pages.

`find_related_evidence` accepts 1–8 `{kind,id}` source references (usually from search), finds identity and nearby candidates, and returns up to 8 per page. It exposes match signals and a transparent `heuristic-v1` ranking score. Score is uncalibrated, not a probability, and links are experimental—not claims about user intent. `maxGapHours` defaults to 168 and is capped at 720; exact URL/page/document identity can connect evidence outside that window. Candidate search is capped at 1,000 local records and marks when pool reaches cap. Pass `nextCursor` with the same sources/options to paginate; it reuses the first-page event-time cutoff. Late-arriving records with older timestamps can shift offset-based pages.

`get_evidence_trail` accepts the same source references and options, then combines seed evidence with one page of related candidates in chronological order. Seed entries are marked `role: "seed"`; heuristic matches are `role: "related"` and retain their score/signals. Pagination applies to related candidates; seed evidence appears on every page. These trails inherit the same experimental, unvalidated relationship limitations.

Page paths and raw events stay on-device; only selected origins, timestamps, source IDs, redacted excerpts, scores, and match signals leave the device on explicit tool calls. No result means no matching retained evidence, not proof of absence. The MCP client owns conversation and orchestration. Tabot does not expose legacy context, memory, recurring-pattern, or activity-metric tools. No human evaluation has been run yet; do not treat browser activity or heuristic links as intent or attention.

## Development

`pnpm dev` watches MCP source and deploys changes to a separate dev Worker:

- MCP: `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`
- Relay origin: `https://tabot-mcp-dev.shanvit7.workers.dev`

This is remote deploy-on-change, not a localhost tunnel. The extension must be running to serve calls. For local-only testing, use `pnpm --filter mcp-server dev:local` at `http://localhost:8787`; local state is under `.wrangler/local-state`. Run `pnpm --filter mcp-server dev:inspector` separately and configure Inspector with Streamable HTTP URL `http://localhost:8787/mcp`. Point the unpacked extension at the same origin with `PLASMO_PUBLIC_MCP_RELAY_URL=http://localhost:8787`.

Dev Worker settings are in gitignored `apps/mcp-server/.dev.vars`; never copy production secrets into dev or commit extension credentials. Restart the dev process and reload extension after changing env/manifest values.

## Connect ChatGPT or Claude

Use the full MCP URL ending in `/mcp`. ChatGPT developer connections and Claude custom connectors each require OAuth consent in the same Chrome profile where the Tabot extension is installed and running. After deploying a tool schema/name change, refresh the connector's tool list. Confirm `search_evidence`, `find_related_evidence`, and `get_evidence_trail` are discovered.

The extension must stay connected while calls are served. `/health` and OAuth discovery prove only Worker availability; they do not prove extension connectivity. Check relay state in the extension service-worker console:

```js
chrome.runtime.sendMessage({ type: 'GET_RELAY_STATUS' }, console.log)
```

Expect `state: 'connected'` and the intended relay URL. Production and dev credentials are separate.

## Checks

```bash
pnpm --filter mcp-server check
pnpm --filter extension check:evidenceRelay
pnpm --filter @tabot/shared check:historySearch
```

Checks use synthetic fixtures and local mocks; they do not deploy or establish relatedness quality on real browser history. Human evaluation remains a later step.

## Security and operations

Anyone able to reach the dev URL can call its endpoints; avoid production bindings and secrets there. `/installations` issues setup credentials without authentication. MCP requires OAuth and scopes requests to the authenticated installation. The relay sends requested search results directly to the client and does not store browser history.

Application logs include route/status/duration, tool name/outcome, and relay lifecycle events; they exclude tool arguments/results, credentials, URLs, and browser activity. Cloudflare native rate limits are per IP and location, not a global WAF. Request bodies are capped at 16 KiB and relay requests at 32 pending per installation.

Production deploy is explicit and never run by these checks:

```bash
pnpm --filter mcp-server deploy:check
cd apps/mcp-server && pnpm run deploy
```

Never rotate `TABOT_AUTH_SECRET` for an ordinary deploy; changing it invalidates installed extension credentials. See Cloudflare dashboard → **tabot-mcp → Observability → Logs** for sampled production logs.
