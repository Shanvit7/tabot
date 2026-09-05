# Deployment — Tabot

Simple model: **merge to `main` deploys.** Nothing else.

```text
feat/* / fix/*  ──PR──►  develop  ──merge►  main ──►  prod
branches        integrate        release    dashboard live + extension uploaded
```

## The two workflows (auto, on merge to main)

| Event | Workflow | Result |
| --- | --- | --- |
| Any merge to `main` | `deploy.yml` | Dashboard → GitHub Pages, **live immediately** |
| Merge touches `apps/extension/**` + new version | `submit.yml` | Extension zip → Chrome Web Store **draft** |

- **Dashboard** = fully auto. Every merge ships.
- **Extension** = auto-builds + uploads as a *draft*. A human clicks **Publish** in the [Chrome Web Store dashboard][dashboard] to take it live. A green workflow ≠ live extension.

## How to release

1. **Work** — branch off `develop`, PR into `develop` when green.

   ```bash
   git checkout develop && git pull
   git checkout -b feat/my-thing
   # work, commit, push
   git push -u origin feat/my-thing
   # PR: feat/my-thing → develop
   ```

2. **Integrate** — merge the PR into `develop`. Nothing deploys.

3. **Release** — bump `apps/extension/package.json` `version`, open PR `develop → main`, merge. That's it.

   ```bash
   git checkout develop && git pull
   # edit apps/extension/package.json version
   git add apps/extension/package.json && git commit -m "release: v0.1.1" && git push
   # PR: develop → main, merge
   ```

On the merge: dashboard goes live, extension packages + uploads a draft.

4. **Approve** — in the [Chrome Web Store dashboard][dashboard], review the draft and click **Publish**. Chrome auto-updates installed copies.

## Version bump = the only gate

The store rejects duplicate versions. Every release **must** bump `package.json` `version`:

- bump → merge → new draft created
- no bump (same version as last time) → `submit.yml` skips, dashboard still ships

If a change is web-only (no extension code) it can release with no version bump.

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
| Workflow fails at `package` | Zip missing — `build` used instead of `package`. | Keep `pnpm --filter extension package` in the workflow. |
| Upload rejected: version already used | Released without bumping `package.json`. | Bump on every release. |
| `bpp` auth error | `SUBMIT_KEYS` empty, expired, or wrong Google account. | Regenerate with `bpp chrome-webstore upload`, update secret. |
| Draft never appears | No store listing yet. | Bootstrap listing in the dev dashboard first. |

[api]: https://developer.chrome.com/docs/webstore/using-webstore-api
[bpp]: https://github.com/PlasmoHQ/bpp
[dashboard]: https://chrome.google.com/webstore/devconsole
