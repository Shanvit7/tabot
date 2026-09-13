# Deployment — Tabot

Simple model: **merge to `main` deploys.** No develop branch — feature branches PR straight into `main`. The only release path for the extension is the changesets "Version Packages" PR.

```text
feat/* / fix/*  ──PR──►  main  ──►  prod
branches                 release   dashboard live + extension uploaded
```

## The three workflows

| Event | Workflow | Result |
| --- | --- | --- |
| Any merge to `main` | `deploy.yml` | Dashboard → GitHub Pages, **live immediately** |
| Any merge to `main` (if `.changeset/*.md` exists) | `release.yml` | Opens / updates the **"Version Packages" PR** |
| Merge of that Version PR | `release.yml` → `submit.yml` | Extension zip → Chrome Web Store **draft** |

- **Dashboard** = fully auto. Every merge ships.
- **Extension** = ships **only** through the Version Packages PR merge (details below). A green workflow ≠ live extension — a human still clicks **Publish** in the [Chrome Web Store dashboard][dashboard].

## How to make a release (plain English)

1. **Work** — branch off `main`, PR straight into `main` when green.

   ```bash
   git checkout main && git pull
   git checkout -b feat/my-thing
   # work, commit, push
   git push -u origin feat/my-thing
   # PR: feat/my-thing → main
   ```

2. **Write a changeset** — when your PR touches extension code, add a note that describes the user-visible change. The `changeset` CLI walks you through it and writes a file like `.changeset/tidy-pumpkins.md`:

   ```bash
   pnpm changeset
   # pick the "extension" package, choose patch (most changes) or minor,
   # write "what users will notice"
   ```

   Merge your PR into `main`. Dashboard goes live. If a changeset exists, GitHub Actions opens a **"Version Packages"** PR that bumps `apps/extension/package.json` and writes `CHANGELOG.md`.

3. **Merge the Version PR** — this is the release decision. Merging it:

   - bumps the version (e.g. `0.1.2 → 0.1.3`),
   - tags it `v0.1.3` on `main` (a marker, so it never releases twice),
   - dispatches `submit.yml`, which builds + uploads a **draft** to the store.

4. **Approve** — in the [Chrome Web Store dashboard][dashboard], review the draft and click **Publish**. Chrome auto-updates installed copies.

## Why it's one path, not two

Version numbers can only go up inside the Version Packages PR — that's the only place `.changeset/*.md` becomes a bump. `submit.yml` **cannot be triggered by any ordinary `main` push**; it only runs when the release hook fires it. So a hand-edited `package.json` on a normal PR merges and the store does nothing. There is no second door.

## The tag's job: a marker, not a trigger

`v0.1.3` is pushed by `scripts/release-tag.mjs` (the changesets publish hook) right before the store upload. Its only job is **idempotency** — if a run needs re-doing, the script sees the tag already exists, skips the tag, and just dispatches the upload again. It never causes a double upload or a rejected duplicate version.

## Credentials (one time)

Auto-upload uses the [Chrome Web Store Publish API][api]. Secrets live in GitHub Actions, not the repo:

- `SUBMIT_KEYS` — the JSON that `bpp chrome-webstore upload` generates (clientId/clientSecret/refreshToken).
- `TABOT_EXTENSION_ID` / `CHROME_WEB_STORE_URL` — store-assigned ID + upload URL, used by the deploy workflow.

Get `SUBMIT_KEYS` with a one-time local OAuth consent: `pnpm --filter extension package` + `bpp chrome-webstore upload` (see [BPP docs][bpp]). Paste the JSON into the secret. Store listing must exist first — create it in the [dev dashboard][dashboard].

## Dev (local, no store)

```bash
pnpm --filter extension dev
```

Serves unpacked to `build/chrome-mv3-dev`. Load via `chrome://extensions` → Developer mode → **Load unpacked** → point at that folder.

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| No Version PR after main merge | No `.changeset/*.md` in the merged PR. | Run `pnpm changeset` before merging your feature PR. |
| Workflow fails at `package` | Zip missing — `build` used instead of `package`. | Keep `pnpm --filter extension package` in the workflow. |
| Upload rejected: version already used | Tag exists but upload re-ran against same version. | The tag normally prevents this. Delete the `v*` tag only if you truly intend to re-upload. |
| `bpp` auth error | `SUBMIT_KEYS` empty, expired, or wrong Google account. | Regenerate with `bpp chrome-webstore upload`, update secret. |
| Draft never appears | No store listing yet. | Bootstrap listing in the dev dashboard first. |

[api]: https://developer.chrome.com/docs/webstore/using-webstore-api
[bpp]: https://github.com/PlasmoHQ/bpp
[dashboard]: https://chrome.google.com/webstore/devconsole
