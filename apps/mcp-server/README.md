# Tabot MCP relay

## Development: stable public URL

`pnpm dev` watches MCP source and deploys changes to a **separate** Worker:

- ChatGPT MCP connector: `https://tabot-mcp-dev.shanvit7.workers.dev/mcp`
- Unpacked extension relay: `https://tabot-mcp-dev.shanvit7.workers.dev`
- Production `tabot-mcp.shanvit7.workers.dev` is untouched.

This is a remote deploy-on-change loop, **not a tunnel to localhost**. This Cloudflare account has no DNS zones, so a named tunnel cannot provide a stable public hostname. The Worker remains reachable when `pnpm dev` stops; extension must still be running to serve requests. `pnpm --filter mcp-server dev:local` runs Wrangler locally at `localhost:8787` for isolated debugging, not ChatGPT access. Do not deploy to production just to test a local change.

Dev Worker is provisioned with a separate signing secret and the unpacked extension ID from gitignored `apps/mcp-server/.dev.vars`. If the unpacked extension ID changes, update `TABOT_EXTENSION_ID` there and run `pnpm exec wrangler secret put TABOT_EXTENSION_ID --config wrangler.dev.toml` from this directory. The dev extension's gitignored `.env.development` points to the dev Worker, and its OAuth consent page is allowed by `externally_connectable`. **Restart `pnpm dev` and reload the unpacked extension** after changing its env/manifest; Plasmo caches env values in the running dev process. Never commit `.dev.vars` or real extension environment files; never use the production signing secret for dev.

### Connect and verify in ChatGPT

1. Load `apps/extension/build/chrome-mv3-dev` as an unpacked extension in the Chrome profile used for ChatGPT. Its `.env.development` must set `PLASMO_PUBLIC_MCP_RELAY_URL` to the dev Worker origin (without `/mcp`).
2. Enable **Developer mode** in ChatGPT Settings → Security and login. In [ChatGPT Plugins](https://chatgpt.com/plugins), add an MCP connection with the **full** URL `https://tabot-mcp-dev.shanvit7.workers.dev/mcp` (not the bare Worker origin). Finish **Connect Tabot** in the same Chrome profile as the unpacked extension.
3. On the connection page, confirm four discovered tools: `search_context`, `get_recent_context`, `get_current_context`, `get_memory`. In a new chat, enable Tabot Dev under Tools and ask for recent browser context. A successful response contains derived context from the local extension, not raw event history.

`/health` and `/.well-known/oauth-authorization-server` prove only Worker and OAuth discovery are reachable. The bare Worker origin returns 404 for MCP requests; use `/mcp`. **Connected account** with **No app tools available yet** means tool discovery is still incomplete, not that ChatGPT needs a different prompt. Verify the saved connection URI ends in `/mcp`, then click **Refresh** on its ChatGPT Plugins page and check the tool list. The server advertises all four tools with `readOnlyHint: true`, `openWorldHint: false`, and `destructiveHint: false`; after tool names, schemas, annotations, or auth change, deploy/restart the Worker and refresh the connection. If tools appear but requests fail, check Chrome profile and extension relay status: open the extension's service-worker DevTools via `chrome://extensions` and run `chrome.runtime.sendMessage({ type: 'GET_RELAY_STATUS' }, console.log)`. Expect `state: 'connected'` and the dev `relayUrl`. The existing production installation credential remains separate from dev.

See [OpenAI's connection and refresh instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [MCP tool metadata guidance](https://developers.openai.com/plugins/build/mcp-server).

## Production deployment (explicit only)

```bash
cd apps/mcp-server
pnpm exec wrangler secret put TABOT_AUTH_SECRET
pnpm exec wrangler secret put TABOT_EXTENSION_ID
pnpm run deploy
```

`TABOT_EXTENSION_ID` must match the installed production extension's ID. Production deploy uses `wrangler.toml`, never `wrangler.dev.toml`.
