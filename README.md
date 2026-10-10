# <img src="assets/logo.png" alt="" width="36" /> Tabot

**Thinking across tabs.**

![Tabot demo: browsing activity, connected sites, and optional ChatGPT sharing](videos/tabot-promo/renders/tabot-30s.gif)

[Watch with music](videos/tabot-promo/renders/tabot-30s.mp4)

Tabot is a Chrome extension that helps you pick up where you left off, without retracing every tab.

- See which sites you visited and how you moved between them.
- Find sites and browsing paths you keep returning to.
- Connect ChatGPT to ask about your browsing activity.

## Privacy

Your browsing record stays on your device. ChatGPT is optional and receives only requested, filtered results—not your raw browsing history. Tabot does not record page text, passwords, or what you type.

## Run locally

Requires Node.js 22+ and pnpm. This is an early prototype.

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

## Contributing

Issues and pull requests welcome. Run `pnpm lint` before submitting code.

[MIT license](LICENSE).
