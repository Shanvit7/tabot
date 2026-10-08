# Tabot MCP relay

## Development: stable public URL

`pnpm dev` watches MCP source and deploys changes to a **separate** Worker:

- ChatGPT MCP connector: `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`
- Unpacked extension relay: `https://tabot-mcp-dev.shanvit7.workers.dev`
- Production `tabot-mcp.shanvit7.workers.dev` is untouched.

This is a remote deploy-on-change loop, **not a tunnel to localhost**. The Worker remains reachable when `pnpm dev` stops; the extension must still be running to serve requests. `pnpm --filter mcp-server dev:local` runs Wrangler locally at `localhost:8787` for isolated debugging, not ChatGPT access. Do not deploy to production just to test a local change. Because `wrangler dev` and `wrangler deploy` are distinct, a local server cannot serve ChatGPT unless its URL is publicly reachable; a `workers.dev` hostname comes from deployment, and `wrangler dev --remote` uses remote resources rather than replacing the deployed Worker.

**Local-execution alternative (named Cloudflare Tunnel).** `wrangler dev --tunnel --tunnel-name=<name>` gives a stable public hostname to a local dev server, but the hostname needs DNS in a Cloudflare-managed zone, so it is not available in this account. The setup would be: a zone plus `cloudflared tunnel create`, one `cloudflared tunnel route dns` record, ChatGPT pointed at `https://<host>/mcp`, `PLASMO_PUBLIC_MCP_RELAY_URL` set to the origin, and that origin added to the extension's `externally_connectable.matches`. Quick `*.trycloudflare.com` tunnels have random hostnames and are unsuitable for a persistent connector. Requests fail whenever the tunnel or laptop is offline.

**Security.** Anyone with a reachable dev URL can call its endpoints; avoid production bindings and secrets there. `/installations` intentionally issues credentials without authentication, so a publicly exposed dev server has the same behavior.

**Credential/secret mismatch.** A credential signed by one deployed Worker's `TABOT_AUTH_SECRET` cannot be reused against a server using a different secret. Use a fresh browser profile or reset only the dev installation credential and reconnect; never copy the production secret into development.

Dev Worker is provisioned with a separate signing secret and the unpacked extension ID from gitignored `apps/mcp-server/.dev.vars`. If the unpacked extension ID changes, update `TABOT_EXTENSION_ID` there and run `pnpm exec wrangler secret put TABOT_EXTENSION_ID --config wrangler.dev.toml` from this directory. The dev extension's gitignored `.env.development` points to the dev Worker, and its OAuth consent page is allowed by `externally_connectable`. **Restart `pnpm dev` and reload the unpacked extension** after changing its env/manifest; Plasmo caches env values in the running dev process. Never commit `.dev.vars` or real extension environment files; never use the production signing secret for dev.

### Connect and verify in ChatGPT

1. Load `apps/extension/build/chrome-mv3-dev` as an unpacked extension in the Chrome profile used for ChatGPT. Its `.env.development` must set `PLASMO_PUBLIC_MCP_RELAY_URL` to the dev Worker origin (without `/mcp`).
2. Enable **Developer mode** in ChatGPT Settings → Security and login. In [ChatGPT Plugins](https://chatgpt.com/plugins), add an MCP connection with the **full** URL `https://tabot-mcp-dev.shanvit7.workers.dev/mcp` (not the bare Worker origin). Finish **Connect Tabot** in the same Chrome profile as the unpacked extension.
3. On the connection page, confirm seven discovered tools: `search_context`, `get_recent_context`, `get_current_context`, `get_context`, `get_memory`, `get_activity_metrics`, `list_recurring_patterns`. In a new chat, enable Tabot Dev under Tools and ask for recent browser context. A successful response contains derived context from the local extension, not raw event history. Ask “Search Tabot contexts for Tabot over the last 24 hours, then get the context by its id.” Search and recent results include stable ids; `get_context(id)` retrieves one selected context. Time windows are in hours (1–168); recent returns at most 20 contexts, search at most 8. Discovery shows only evidence-rich contexts, but explicit id lookup can retrieve a thin context. Manual dashboard **Download Context** remains a separate JSONL export; MCP never sends that file.

Dashboard **Connected** reflects an unexpired OAuth access or refresh token for this installation, not the always-on relay socket. The extension checks authenticated `GET /connection` without exposing credentials to the dashboard. Existing connections work without reconnecting. After updating the extension, reload it and the dashboard; inspect with `chrome.runtime.sendMessage({ type: 'GET_ASSISTANT_CONNECTION' }, console.log)` in the extension service-worker console. A failed status request is unknown, not disconnected.

`/health` and `/.well-known/oauth-authorization-server` prove only Worker and OAuth discovery are reachable. The bare Worker origin returns 404 for MCP requests; use `/mcp`. **Connected account** with **No app tools available yet** means tool discovery is still incomplete, not that ChatGPT needs a different prompt. Verify the saved connection URI ends in `/mcp`, then click **Refresh** on its ChatGPT Plugins page and check the tool list. The server advertises all seven tools with `readOnlyHint: true`, `openWorldHint: false`, and `destructiveHint: false`; after tool names, schemas, annotations, or auth change, deploy/restart the Worker and refresh the connection. If tools appear but requests fail, check Chrome profile and extension relay status: open the extension's service-worker DevTools via `chrome://extensions` and run `chrome.runtime.sendMessage({ type: 'GET_RELAY_STATUS' }, console.log)`. Expect `state: 'connected'` and the dev `relayUrl`. The existing production installation credential remains separate from dev.

See [OpenAI's connection and refresh instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [MCP tool metadata guidance](https://developers.openai.com/plugins/build/mcp-server).

## Activity metrics

`get_activity_metrics({ from, to, origin? })` reads the authorized installation's local event store and computes the same estimates used by the Activities graph. Bounds are Unix milliseconds: `from` inclusive, `to` exclusive, `0 <= from < to <= now`. Use `from: 0` for all retained activity. Optional `origin` must be an exact HTTP(S) origin (`https://github.com`), without a trailing slash, credentials, path, query, or fragment.

The response includes the range and extension-local timezone, estimate caveats, whole-period summary (estimated milliseconds, visits, active days, sites, longest observed single-site stretch, busiest hour, and transition count), site metrics, and directed site-to-site transition counts. An origin filters sites and adjacent transitions **after** time attribution; the summary remains whole-period. Up to 50 sites and 100 transition pairs fit within a 60,000-character response budget, with explicit `truncated` flags; summary totals include omitted sites. A site-specific query can retrieve a site outside the top 50. Empty results mean no retained observations, not proof of inactivity.

Time is the gap to the next site observation, capped at five minutes per gap; no extrapolation follows the final observation. It is not a measure of attention or productivity. Raw events, IDs, page paths, query strings, credentials, and favicons never leave the extension for this tool. The relay forwards the response without saving browser history.

On **Activities**, choose a period and press **Ask ChatGPT about this period**, or select a site in the graph/**Explore a place** selector and press **Ask ChatGPT about this place**. The prefilled prompt includes only the exact displayed range and optional origin; ChatGPT retrieves aggregates through the authorized connector. Without a verified connection, the action goes to **AI Assistants** on Home. After updating extension and Worker, refresh the ChatGPT connection's tool list; no production deployment is performed by these changes.

Local checks (no deployment or real history):

```bash
pnpm --filter @tabot/shared check:activityMetrics
pnpm --filter extension check:metricsRelay
pnpm --filter mcp-server check:activityMetrics
pnpm --filter web check:activityMetrics
```

## Recurring patterns

`list_recurring_patterns({ limit? })` discovers recurrent patterns from the latest 500 locally-derived contexts. `limit` is an integer from 1 to 20, default 10. Recurrent filtering happens before limiting; newest `lastSeen` comes first. Results include pattern ids for `get_memory`, site origins, representative fingerprint ordering, counts, first/last seen, heuristic confidence, local timezone, available pattern count and truncation. This is not an exhaustive history search, and an empty list does not prove there are no routines.

`get_memory({ id })` retains its existing summary fields and adds up to 20 recent supporting occurrences (chronological order), their context ids, start/end timestamps and origin-only site sequences, plus representative fingerprint ordering and explicit truncation flags. Actual supporting context ids are capped at 100 overall and 20 per occurrence, domains at 20 and sequences at 50 origins. Internal occurrence range identifiers are resolved to real `get_context` ids, not exposed as lookup ids. Consecutive same-site page steps collapse; unsupported/internal sites are omitted and flagged. Both responses fit a 60,000-character budget; older occurrences or lower-ranked list entries may be omitted while counts remain intact. All returned text passes the existing fail-closed privacy sanitizer. No occurrence page paths, queries, credentials, favicons or raw events leave the device. Origins and subdomains remain visible.

Confidence is heuristic similarity, not probability of intent or productivity. Fingerprint and occurrence sequences use derived first-occurrence ordering, not complete navigation traces or proof of an exact repeated workflow; occurrence bounds are observed spans, not continuous attention. Both discovery and explicit memory lookup use the latest 500 contexts, so an old dashboard id may return `found: false` after re-derivation.

On **Recurring patterns**, **Ask ChatGPT about recurring patterns** appears above the map only when the shared OAuth connection status is verified connected, including when the map is empty. It asks ChatGPT to discover patterns and inspect up to three through `get_memory`. Selecting a row exposes a compact **Ask ChatGPT** action and **View context** supporting-context link beside that row, inside the map card. When disconnected or status is unknown, the selected-pattern action goes to Home’s connection section; the overview CTA stays hidden. Prefills contain only tool instructions and a selected id, not local pattern evidence.

The existing extension, MCP and web `check:metricsRelay` / `check:activityMetrics` checks also cover pattern discovery, schemas, authorization, occurrence projection, response budgets, fail-closed privacy and connected-only overview actions. No browser automation or deployment is needed to run them. Reload the extension and deploy the updated Worker, then refresh the ChatGPT connection's tool list to discover the seventh tool. No production deployment is performed by these changes.

## Production deployment (explicit only)

```bash
cd apps/mcp-server
pnpm exec wrangler secret put TABOT_AUTH_SECRET
pnpm exec wrangler secret put TABOT_EXTENSION_ID
pnpm run deploy
```

`TABOT_EXTENSION_ID` must match the installed production extension's ID. Production deploy uses `wrangler.toml`, never `wrangler.dev.toml`.
