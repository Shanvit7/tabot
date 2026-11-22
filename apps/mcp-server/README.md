# Tabot MCP relay

Tabot is building a browser activity data layer for AI-assisted work. This relay is the current beta bridge: eight read-only MCP tools expose supported activity and note results to connected assistants. Reusable contexts and user-directed automations are future direction, not relay capabilities today.

Tabot exposes eight read-only MCP tools. `search_all` searches locally retained pages, user-written notes, and sites in one request. Page results use local hybrid text and semantic search over activity and page content; note and site results use local keyword search. It returns up to 8 results per category; it is not paginated. Page titles, paths, visible text, and raw browser-event fields are excluded. Use `search_notes`, `list_pages`, or `list_sites` to browse further.

`search_notes` searches user-written notes by text, timestamp range, or site domain. `list_sites` returns paginated sites with distinct page and note counts. `list_pages` returns paginated pages and complete note counts for one site; page paths and internal page keys stay on-device. Pass its opaque `pageRef` to `get_page_notes` for every note on that page, including pages without a capture. `get_page_notes` also accepts a canonical page URL. `get_site_notes` returns up to 50 notes for a website domain, including all its subdomains. Note results include derived site domain, host, redacted text, timestamps, and derived session when available; page paths stay on-device. Note content leaves the device only on these authorized read-only tool calls.

`find_related_activity` accepts 1–8 `{kind,id}` anchors from search and returns up to 8 matches for the same page, same site, or timestamps within `maxGapHours`. Each match lists `matchedBy` and `matchedAnchorIds`; this is literal matching, not a relevance score or inferred intent. `maxGapHours` defaults to 168 and is capped at 720.

`get_browsing_timeline` accepts the same anchors and options, then returns selected anchors plus one page of matches in chronological order. Items use `role: "anchor"` or `role: "match"`; pagination applies to matches, while anchors repeat on each page.

Full URL paths, page titles/text, and raw browser events stay on-device. Read tools share only their documented projections on explicit calls. No results mean no matching retained activity, not proof of absence. The MCP client owns conversation and orchestration. Tabot does not expose legacy context, memory, recurring-pattern, or activity-metric tools.

## Development

`pnpm dev` watches MCP source and deploys changes to a separate dev Worker:

- MCP: `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`
- Relay origin: `https://tabot-mcp-dev.shanvit7.workers.dev`

This is remote deploy-on-change, not a localhost tunnel. The extension must be running to serve calls. For local-only testing, use `pnpm --filter mcp-server dev:local` at `http://localhost:8787`; local state is under `.wrangler/local-state`. Run `pnpm --filter mcp-server dev:inspector` separately and configure Inspector with Streamable HTTP URL `http://localhost:8787/mcp`. Point the unpacked extension at the same origin with `PLASMO_PUBLIC_MCP_RELAY_URL=http://localhost:8787`.

Local Worker settings use gitignored `apps/mcp-server/.dev.vars`, not `.env`; copy `.dev.vars.example` and set both `TABOT_AUTH_SECRET` and the unpacked extension's `TABOT_EXTENSION_ID`. Keep the local secret stable—changing it invalidates local relay credentials. Never copy production secrets into dev or commit `.dev.vars`. Production secrets live in Cloudflare Worker bindings, not local env files. Restart the dev process and reload extension after changing env/manifest values.

## Connect ChatGPT or Claude

Use the full MCP URL ending in `/mcp`. ChatGPT developer connections and Claude custom connectors each require OAuth consent in the same Chrome profile where the Tabot extension is installed and running. After deploying a tool schema/name change, refresh the connector's tool list. Confirm `search_all`, `find_related_activity`, `get_browsing_timeline`, `search_notes`, `list_sites`, `list_pages`, `get_page_notes`, and `get_site_notes` are discovered.

The extension must stay connected while calls are served. `/health` and OAuth discovery prove only Worker availability; they do not prove extension connectivity. From the **Tabot popup or side-panel DevTools console** (not the service-worker console, which cannot answer its own runtime message), run:

```js
chrome.runtime.sendMessage({ type: 'RUN_RELAY_SANITY_CHECK' }, console.log)
```

Check `relay.state`, `roundTrip.ok`, and `assistants.chatgpt`. A successful round trip proves the Worker routes to this extension installation; `assistants.chatgpt` confirms this installation has a ChatGPT OAuth grant. If both pass but ChatGPT still reports offline, ChatGPT is likely using an OAuth token bound to another installation or relay environment. Production and dev credentials are separate. Dev Worker logs include an 8-character installation tag for comparing authenticated relay upgrades with offline dispatches; bearer tokens are never logged.

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

OAuth clients can register their own name and HTTPS/loopback callback. Names are not verified; check the callback origin shown on consent before connecting. Consent uses a per-response nonce CSP. Discovery, token audiences, and the authorization response `iss` use the configured `MCP_PUBLIC_URL` origin, never forwarded request headers. Keep that URL aligned with the connector URL in each environment.

Tool results, especially saved notes, can contain untrusted instructions. MCP initialization tells clients to treat returned fields as data only, but this is guidance, not a prompt-injection security boundary. Tools remain read-only; assistant/client safeguards are still required.

Static fonts/logo retain Cloudflare's asset-first serving and caching. `public/_headers` adds security headers without invoking the Worker or spending API rate limits for assets. These rules do not change dynamic Worker responses.

Production deploy is explicit and never run by these checks:

```bash
pnpm --filter mcp-server deploy:check
cd apps/mcp-server && pnpm run deploy
```

Never rotate `TABOT_AUTH_SECRET` for an ordinary deploy; changing it invalidates installed extension credentials. See Cloudflare dashboard → **tabot-mcp → Observability → Logs** for sampled production logs.
