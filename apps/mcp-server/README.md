# Tabot MCP relay

Tabot exposes nine read-only MCP tools and one explicit draft-save tool. `search_activity` searches locally retained browser activity, returning up to 8 results with site, time range, activity IDs, and reusable `anchors`; page titles, paths, and visible text are excluded. Pass `nextCursor` with the same query to continue; `null` means no more results. Pages use a fixed timestamp snapshot.

`search_notes` searches user-written notes by text, timestamp range, or site domain. `list_sites` returns paginated sites with distinct page and note counts. `list_site_pages` returns paginated pages and complete note counts for one site; page paths and internal page keys stay on-device. Pass its opaque `pageRef` to `get_page_notes` for every note on that page, including pages without a capture. `get_page_notes` also accepts a canonical page URL. `get_site_notes` returns up to 50 notes for a website domain, including all its subdomains. Note results include derived site domain, host, redacted text, timestamps, and derived session when available; page paths stay on-device. Note content leaves the device only on these authorized read-only tool calls.

`find_activity_matches` accepts 1–8 `{kind,id}` anchors from search and returns up to 8 matches for the same page, same site, or timestamps within `maxGapHours`. Each match lists `matchedBy` and `matchedAnchorIds`; this is literal matching, not a relevance score or inferred intent. `maxGapHours` defaults to 168 and is capped at 720.

`get_activity_timeline` accepts the same anchors and options, then returns selected anchors plus one page of matches in chronological order. Items use `role: "anchor"` or `role: "match"`; pagination applies to matches, while anchors repeat on each page.

Full URL paths, page titles/text, and raw browser events stay on-device. Read tools share only their documented projections on explicit calls. No results mean no matching retained activity, not proof of absence. The MCP client owns conversation and orchestration. Tabot does not expose legacy context, memory, recurring-pattern, or activity-metric tools.

## ChatGPT workflow handoff

One click on **Ask ChatGPT** prepares the selected routine in the extension's local TalaDB owner and opens ChatGPT with a static instruction. No routine data or grant is placed in the URL. ChatGPT fetches the pending handoff through `get_pending_workflow_handoff` or resource `tabot://workflows/pending`. That payload contains only the site-origin sequence, repeat/prediction counts, time range, and one-time save grant—no page titles, paths, content, or guessed goal. ChatGPT must explain what this evidence does and does not show, ask what the user is trying to accomplish, and assess feasibility before proposing steps.

`save_workflow_script` is the only write tool. After the user confirms the exact script, it accepts a strict bounded version-1 declarative script and stores an **unreviewed draft** in local TalaDB. Its one-time grant is bound to the pending candidate, exact handoff digest, local retained evidence, and allowed origins; it expires after 15 minutes. The extension validates again before durable ACK. Same-script retries reconcile unknown ACKs; a different script cannot reuse a consumed grant. The MCP relay never stores the payload or executes scripts. Draft review/import and user-run execution are not implemented yet.

## Development

`pnpm dev` watches MCP source and deploys changes to a separate dev Worker:

- MCP: `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`
- Relay origin: `https://tabot-mcp-dev.shanvit7.workers.dev`

This is remote deploy-on-change, not a localhost tunnel. The extension must be running to serve calls. For local-only testing, use `pnpm --filter mcp-server dev:local` at `http://localhost:8787`; local state is under `.wrangler/local-state`. Run `pnpm --filter mcp-server dev:inspector` separately and configure Inspector with Streamable HTTP URL `http://localhost:8787/mcp`. Point the unpacked extension at the same origin with `PLASMO_PUBLIC_MCP_RELAY_URL=http://localhost:8787`.

Dev Worker settings are in gitignored `apps/mcp-server/.dev.vars`; never copy production secrets into dev or commit extension credentials. Restart the dev process and reload extension after changing env/manifest values.

## Connect ChatGPT or Claude

Use the full MCP URL ending in `/mcp`. ChatGPT developer connections and Claude custom connectors each require OAuth consent in the same Chrome profile where the Tabot extension is installed and running. After deploying a tool schema/name change, refresh the connector's tool list. Confirm `get_pending_workflow_handoff`, `search_activity`, `find_activity_matches`, `get_activity_timeline`, `search_notes`, `list_sites`, `list_site_pages`, `get_page_notes`, `get_site_notes`, and `save_workflow_script` are discovered. Resource `tabot://workflows/pending` is available to clients that support MCP resources.

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
pnpm --filter @tabot/shared check:automationScripts
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
