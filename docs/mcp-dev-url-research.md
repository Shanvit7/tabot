# Stable public URL for local MCP development

## Implemented in this Cloudflare account

Cloudflare API returned zero DNS zones, so a named tunnel cannot get a stable public hostname here. Instead, `pnpm dev` watches MCP source and deploys each change to the isolated `tabot-mcp-dev.shanvit7.workers.dev` Worker via `apps/mcp-server/wrangler.dev.toml`. ChatGPT uses its `/mcp` endpoint. The development extension points at the same Worker; dev-only signing secret and unpacked extension ID are provisioned there. This runs code remotely and keeps the existing production Worker untouched. ChatGPT tool discovery and an actual context retrieval from the unpacked dev extension were verified in September 2026. ChatGPT needs the **full `/mcp` connection URL**; after changing tool metadata, deploy and use **Refresh** on the connection page. The four tools advertise read-only, non-destructive, non-open-world annotations. A previous "Connected" + "No app tools available yet" state preceded the working retrieval; server metadata was updated, but whether annotations, connection URI, or ChatGPT Refresh resolved it was not isolated. See `apps/mcp-server/README.md` for operational and troubleshooting steps. If a Cloudflare-managed domain is added later, the named tunnel described below is the local-execution alternative.

## Finding

Before this fix, `pnpm dev` started `wrangler dev` locally (`localhost:8787`), while the unpacked extension's `.env.development` targeted the *production* Worker; editing/running local MCP code could not affect that ChatGPT connector. `pnpm dev` now deploys MCP code to an isolated dev Worker instead. Wrangler's `dev` and `deploy` are distinct commands. [Cloudflare Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

## Alternative for local execution: named Cloudflare Tunnel

Cloudflare supports `wrangler dev --tunnel --tunnel-name=<existing-name>`: a named tunnel gives a stable public hostname routed to the local dev server, with code changes handled by Wrangler. Quick tunnels use random `*.trycloudflare.com` hostnames, unsuitable for a persistent ChatGPT connector. [Share a local dev server](https://developers.cloudflare.com/workers/local-development/local-dev-tunnels/); [Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

A named tunnel's public hostname needs DNS on a domain managed by the Cloudflare account. Set up a zone and `cloudflared tunnel create tabot-dev`, then route `cloudflared tunnel route dns tabot-dev dev-mcp.example.com` once. The tunnel DNS record remains but requests fail when laptop/tunnel is offline. [Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/); [Tunnel DNS records](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/).

Point ChatGPT's custom MCP connector at `https://dev-mcp.example.com/mcp`; point `PLASMO_PUBLIC_MCP_RELAY_URL` at `https://dev-mcp.example.com`; add `https://dev-mcp.example.com/*` to the extension's `externally_connectable.matches`. Set local `.dev.vars` to contain **both** a dev-only `TABOT_AUTH_SECRET` and the unpacked extension's `TABOT_EXTENSION_ID`. Rebuild/reload the extension when its Plasmo env or manifest changes. Keep the local secret and extension ID out of version control. Verify `/health`, OAuth discovery `issuer`, extension relay, and OAuth connection separately: `/health` alone proves only HTTP reachability. Do not copy the production signing secret into local development. Existing credentials signed by the deployed Worker's secret cannot be reused with a different local secret; use a fresh dev profile or explicitly reset only the dev installation credential and reconnect.

## No Cloudflare-managed domain?

A `workers.dev` Worker gets a stable URL from **deployment** (`wrangler deploy`), not from `wrangler dev`. Use a separate development Worker name (and separate Durable Objects/secrets), deploy changed code to it, and point ChatGPT/extension at its fixed `workers.dev` URL; this is a remote deploy loop rather than local execution. `wrangler dev --remote` is for remote resources, not a deployment replacing the existing public Worker. [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/); [Wrangler dev options](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

## Security

Any holder of a tunnel URL can reach public dev endpoints; restrict exposure and avoid using production bindings. The current `/installations` endpoint issues credentials unauthenticated, and an exposed local server will have that same behavior. [Cloudflare local dev tunnel security](https://developers.cloudflare.com/workers/local-development/local-dev-tunnels/#security-considerations).
