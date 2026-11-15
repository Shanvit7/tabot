<p align="center">
	<img src="assets/logo.png" alt="" width="96" height="96" />
</p>

<h1 align="center">Tabot</h1>

<p align="center"><strong>Bring your browser work to ChatGPT.</strong></p>

Tabot is the browser activity layer for AI-assisted work. It helps you use work already done in Chrome with ChatGPT.

Tabot is in early beta. Search and review your browsing context locally—including pages, activity, excerpts, and notes—and ask ChatGPT for selected activity or note results. Reusable contexts and user-directed automations are in development, not available yet.

- Search pages and notes by meaning; review activity by site.
- Ask ChatGPT about selected browsing activity and saved notes.
- Keep browser records on-device; selected results leave only when you request them.

## Data and privacy

Browser history, excerpts, notes, and search indexes stay in Chrome on your device. When you ask ChatGPT about activity or request saved notes, selected results go to ChatGPT; the relay routes requests but does not store browser history or tool results. Excerpts stay local. Tabot does not record what you type or enter in forms, take screenshots, or save full-page copies. Selected sensitive patterns are filtered from captured text and URLs and from requested note text and titles; filtering can miss sensitive details.

## Run locally

Requires Node.js 22+ and pnpm.

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

For the optional ChatGPT connection, see [setup instructions](apps/mcp-server/README.md).

## Local capture reliability

Capture uses bounded Pacer batching inside the extension service worker, then atomic TalaDB writes through an extension offscreen owner to local OPFS. A persisted acknowledgment follows commit; retries reuse stable IDs. Existing IndexedDB history is imported and retired after verification.

Checks: `pnpm --filter extension check:ingest`. Architecture and failure guarantees: [data flow](docs/data-flow.md).

## Contributing

Issues and pull requests welcome. Run `pnpm lint` before submitting code.

Tabot-authored code is Copyright © 2026 Shanvit Shetty and licensed under [GPL-3.0-only](LICENSE); see [COPYRIGHT](COPYRIGHT) for scope. Third-party code and assets retain their own licenses and notices.
