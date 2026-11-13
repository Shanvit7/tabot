# Extension Agent Guide

Read repository [`../../AGENTS.md`](../../AGENTS.md) first for product boundaries, common utilities, privacy rules and shared coding conventions. Verify these contracts against the owning implementation before changing them.

## Skills

For work under `apps/extension/`, load applicable shared skills from `../../.agents/skills/`:

- Chrome Extensions / Manifest V3: `../../.agents/skills/chrome-extensions/`
- Plasmo: `../../.agents/skills/plasmo/`
- Pacer: `../../.agents/skills/tanstack-pacer/`

Load only skills relevant to the task. Keep shared skills at repository root.

## Extension Architecture

```text
Chrome APIs + content scripts
  → `background.ts`: validate, minimize/redact, snapshot, bounded admission
  → `ingestion/event-pipeline.ts`: Pacer batch (128 / 25 ms) + FIFO serial writer
  → `storage/client.ts` → offscreen `storage/owner.ts`
  → atomic TalaDB/OPFS commit → persisted ACK
  → separate local search indexing / packaged embedding worker
```

- `background.ts` is the existing MV3 service worker. It is ephemeral; do not rely on globals surviving suspension. There is no production SharedArrayBuffer, transport worker or drain polling.
- `storage/owner.ts` is sole TalaDB write owner. Other components use the storage client/RPC; never open a second writer or write directly from popup/content/dashboard code.
- Queued/admitted work is not durable. Keep source IDs stable across retries and acknowledge only after commit or verified committed replay. Preserve bounded queues and explicit retry/held-failure outcomes.
- Automatic capture is limited and redacted before persistence. Never collect typed values, form values, passwords, or unbounded page content. Keep page excerpts separate from behavioral events and user-authored notes.
- Embedding/index failures must not block committed capture; search degrades to keyword behavior. Embeddings and indexes stay local.
- Dashboard requests are validated and sender-allowlisted in `dashboard/`; use shared request/response contracts. A read failure is an error/unavailable state, never an empty-history success.
- Relay requests are authorized and handled by the live extension. Return only documented projections; do not log or persist raw tool arguments/results.

## Reuse and Checks

Use the common utilities table in `../../AGENTS.md` before adding helpers or message types. Shared imports must use declared `@tabot/shared` exports.

Run the narrowest relevant checks, then `pnpm --filter extension check` for broad extension changes. Useful focused checks:

- `pnpm --filter extension check:ingest`
- `pnpm --filter extension check:storageOwner`
- `pnpm --filter extension check:dashboardSender`
- `pnpm --filter extension check:dashboardHistory`
- `pnpm --filter extension check:searchEmbedding`
- `pnpm --filter extension check:pageCapturePolicy`
- `pnpm --filter extension check:visibleExcerpts`
- `pnpm --filter extension check:activityRelay`
