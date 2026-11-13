# <img src="assets/logo.png" alt="" width="36" /> Tabot

**Your Chrome activity, ready for your AI assistant.**

![Tabot demo: browsing activity, connected sites, and optional AI assistant sharing](videos/tabot-promo/renders/tabot-30s.gif)

[Watch with music](videos/tabot-promo/renders/tabot-30s.mp4)

Tabot is building a browser activity data layer for AI-assisted work: collect what happens in Chrome, organize useful evidence into context, and let people use it with their assistant to get things done.

Tabot is in early beta. Today, it records browser activity, offers local search and review of pages, excerpts and notes, and exposes eight read-only tools to connected assistants. Reusable contexts and user-directed automations are the direction, not shipped features.

- Review retained browser activity and saved notes locally.
- Ask a connected assistant about supported activity and note results.
- Keep browser records on-device; only selected results leave through authorized requests.

## Data and privacy

Visible page excerpts are captured automatically while tracking is active and remain local; assistants do not receive excerpt bodies. Tabot never records passwords, form values, or what you type. Excerpts are bounded visible text, not page snapshots; they have no time-based expiry and use a 25 MiB storage budget.

## Run locally

Requires Node.js 22+ and pnpm. Tabot is a POC prototype in beta.

```bash
pnpm install
pnpm dev:extension
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select `apps/extension/build/chrome-mv3-dev`, then copy the extension's ID.

In another terminal, replace `YOUR_EXTENSION_ID` below with that ID:

```bash
VITE_TABOT_EXTENSION_ID=YOUR_EXTENSION_ID pnpm dev:web
```

Open [localhost:3000](http://localhost:3000) in the same Chrome profile.

For optional ChatGPT and Claude connections, see [setup instructions](apps/mcp-server/README.md).

## Local capture reliability

Capture uses bounded Pacer batching inside the extension service worker, then atomic TalaDB writes through an extension offscreen owner to local OPFS. A persisted acknowledgment follows commit; retries reuse stable IDs. Existing IndexedDB history is imported and retired after verification.

Checks: `pnpm --filter extension check:ingest`. Architecture and failure guarantees: [data flow](docs/data-flow.md).

## Contributing

Issues and pull requests welcome. Run `pnpm lint` before submitting code.

[MIT license](LICENSE).
