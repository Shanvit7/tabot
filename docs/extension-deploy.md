# Deployment — Tabot

Simple model: **merge to `main` deploys.** No develop branch — feature branches PR straight into `main`. Normal extension releases use a Changesets "Version Packages" PR. For this `0.2.2` release, package, manifest and changelog are pre-bumped in feature PR #19; merging it invokes the release hook directly.

```text
feat/* / fix/*  ──PR──►  main  ──►  prod
branches                 release   dashboard live + extension uploaded
```

## The three workflows

| Event | Workflow | Result |
| --- | --- | --- |
| Any merge to `main` | `deploy.yml` | Dashboard → GitHub Pages, **live immediately** |
| Any merge to `main` with changesets | `release.yml` | Opens / updates the **"Version Packages" PR** |
| Merge of Version PR, or main merge with prepared version and no changesets | `release.yml` → `submit.yml` | Tags version and uploads extension zip → Chrome Web Store **draft** |

- **Dashboard** = fully auto. Every merge ships.
- **Extension** = release hook uploads a draft after versioning. A green workflow ≠ live extension — a human still clicks **Publish** in the [Chrome Web Store dashboard][dashboard].

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

3. **Merge the Version PR** — this is the release decision. Normally it applies the version bump. For current `0.2.2`, feature PR #19 already includes package/manifest versions and changelog; after merge, the release hook tags `v0.2.2` and dispatches `submit.yml`, which builds + uploads a **draft** to the store.

4. **Approve** — in the [Chrome Web Store dashboard][dashboard], review the draft and click **Publish**. Chrome auto-updates installed copies.

## Why it's one path, not two

For normal releases, Changesets applies the version bump in the Version Packages PR. If a release is pre-bumped in a feature PR, merge it without an unconsumed changeset so the Changesets action runs the publish hook. `submit.yml` is still dispatched only by `scripts/release-tag.mjs`, which creates the version tag and prevents duplicate submissions.

## The tag's job: a marker, not a trigger

`v0.2.2` for this release is pushed by `scripts/release-tag.mjs` (the Changesets publish hook) right before the store upload. Its only job is **idempotency** — if a run needs re-doing, the script sees the tag already exists, skips the tag, and just dispatches the upload again. It never causes a double upload or a rejected duplicate version.

## Credentials (one time)

Auto-upload uses the [Chrome Web Store Publish API][api]. Secrets live in GitHub Actions, not the repo:

- `SUBMIT_KEYS` — the JSON that `bpp chrome-webstore upload` generates (clientId/clientSecret/refreshToken).
- `TABOT_EXTENSION_ID` / `CHROME_WEB_STORE_URL` — store-assigned ID + upload URL, used by the deploy workflow.

Get `SUBMIT_KEYS` with a one-time local OAuth consent: `pnpm --filter extension package` + `bpp chrome-webstore upload` (see [BPP docs][bpp]). Paste the JSON into the secret. Store listing must exist first — create it in the [dev dashboard][dashboard].

## Dev (local, no store)

```bash
pnpm --filter extension dev
```

Serves unpacked to `build/chrome-mv3-dev`. Load via `chrome://extensions` → Developer mode → **Load unpacked** → point at that folder. For the optional ChatGPT integration, the development extension and MCP Worker use separate credentials and URLs from production; follow [MCP relay development](../apps/mcp-server/README.md). MCP Worker deployment is **not** part of the extension store release workflow above.

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
