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
3. On the connection page, confirm five discovered tools: `search_context`, `get_recent_context`, `get_current_context`, `get_context`, `get_memory`. In a new chat, enable Tabot Dev under Tools and ask for recent browser context. A successful response contains derived context from the local extension, not raw event history. Ask “Search Tabot contexts for Tabot over the last 24 hours, then get the context by its id.” Search and recent results include stable ids; `get_context(id)` retrieves one selected context. Time windows are in hours (1–168); recent returns at most 20 contexts, search at most 8. Discovery shows only evidence-rich contexts, but explicit id lookup can retrieve a thin context. Manual dashboard **Download Context** remains a separate JSONL export; MCP never sends that file.

`/health` and `/.well-known/oauth-authorization-server` prove only Worker and OAuth discovery are reachable. The bare Worker origin returns 404 for MCP requests; use `/mcp`. **Connected account** with **No app tools available yet** means tool discovery is still incomplete, not that ChatGPT needs a different prompt. Verify the saved connection URI ends in `/mcp`, then click **Refresh** on its ChatGPT Plugins page and check the tool list. The server advertises all five tools with `readOnlyHint: true`, `openWorldHint: false`, and `destructiveHint: false`; after tool names, schemas, annotations, or auth change, deploy/restart the Worker and refresh the connection. If tools appear but requests fail, check Chrome profile and extension relay status: open the extension's service-worker DevTools via `chrome://extensions` and run `chrome.runtime.sendMessage({ type: 'GET_RELAY_STATUS' }, console.log)`. Expect `state: 'connected'` and the dev `relayUrl`. The existing production installation credential remains separate from dev.

See [OpenAI's connection and refresh instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [MCP tool metadata guidance](https://developers.openai.com/plugins/build/mcp-server).

## Production deployment (explicit only)

```bash
cd apps/mcp-server
pnpm exec wrangler secret put TABOT_AUTH_SECRET
pnpm exec wrangler secret put TABOT_EXTENSION_ID
pnpm run deploy
```

`TABOT_EXTENSION_ID` must match the installed production extension's ID. Production deploy uses `wrangler.toml`, never `wrangler.dev.toml`.
