# Release and deployment — Tabot

This runbook describes the checked-in workflows, not a guarantee that a deployment has succeeded. Versioning source files, deploying the website, deploying the relay, uploading an extension draft and publishing that draft are separate operations.

## What PR #32 changes

PR #32 contains the **actual 0.2.8 version bump**, not another request to bump later:

- Extension and MCP package versions: `0.2.8`.
- Shared `TABOT_VERSION` (web footer/Settings and MCP runtime version): `0.2.8`.
- ChatGPT plugin manifest: `0.2.8`.
- Extension and MCP changelogs: release notes for `0.2.8`.
- The consumed changeset is deleted. This is expected; its release notes now live in the changelogs. Keeping it would request another bump.
- The version workflow calls `pnpm version:packages`, a package script that runs Changesets and then synchronizes the product version. Shell chaining belongs inside that script, not inside the action's command input.

After an authorized merge to `main`, Pages and the release workflow run independently. Pages builds the web app with `0.2.8`; the release hook attempts to tag `v0.2.8` and dispatch the extension draft upload. **The production MCP Worker remains unchanged until explicitly deployed. Installed extensions remain unchanged until Chrome publication and update.**

## Which versions must match?

| Source | Meaning / update mechanism |
| --- | --- |
| `apps/extension/package.json` | Extension product version; Changesets bumps it. Plasmo derives the built manifest version from it. |
| `apps/mcp-server/package.json` | MCP product version; include it in the same release changeset. |
| `packages/shared/src/version.ts` | `TABOT_VERSION`, used by web footer/Settings and MCP runtime; `sync:product-version` copies the extension version here. |
| `apps/mcp-server/submission/tabot-plugin/plugin.json` | Plugin version; `sync:product-version` copies the extension version here. |
| `apps/web/package.json` | No package version. The web build embeds shared `TABOT_VERSION`. |
| `packages/shared/package.json` and root `package.json` | Internal workspace versions, not the product release number. They need not equal `0.2.8`. |

These are **source/build invariants**, not evidence that every live deployment is on that version. A cached website, installed extension or undeployed Worker can still run an older build.

## Normal automatic versioning flow

### 1. Feature PR: request a release

Add a new `.changeset/<descriptive-name>.md` with both product packages:

```md
---
'extension': patch
'mcp-server': patch
---

Short user-facing description of the fix or improvement.
```

Use `patch` for normal beta fixes. Do not list `web` or `@tabot/shared`; `.changeset/config.json` ignores them. Do not manually edit product versions in this feature PR.

The config **links**, rather than fixes, extension and MCP versions. Linking aligns packages that participate in a release; it does not force an untouched package to release. **List both packages** so both advance together and pass the synchronization assertion.

Run `pnpm changeset status` to inspect the requested releases. Merging the feature PR does **not** immediately change package versions. It also deploys the web code from that feature commit with the existing product version.

### 2. Version Packages PR: apply the release

On a push to `main`, `.github/workflows/release.yml` runs `changesets/action@v1`:

- With pending changesets, it opens/updates `changeset-release/main` → `main`.
- Its version command is `pnpm version:packages`.
- That script runs `pnpm changeset version && pnpm sync:product-version`.
- Changesets bumps extension/MCP, writes their changelogs and deletes consumed changeset files.
- The sync script asserts extension/MCP versions match, then updates shared `TABOT_VERSION` and the plugin manifest without another bump.

Review the **actual changed version files** before merging this PR. From `0.2.7`, a patch produces `0.2.8`; after that release, a new patch produces `0.2.9`. Multiple pending changesets can be collected into one version PR, not necessarily one release per feature PR.

Deleting a consumed changeset does not uninstall Changesets. `.changeset/config.json`, `.changeset/README.md`, the CLI dependency and the release workflow remain. New changes get new files.

If preparing the version PR locally as a recovery operation, run `pnpm version:packages` once on a clean branch based on `main`, review its diff and raise a PR. Do not pre-bump and also leave the same changeset pending: that requests a second bump.

### 3. Merge version PR: deploy web and queue extension draft

With no pending changesets, the release action invokes its `publish` command, `pnpm release:tag`. Despite that input name, this repo does **not** run `changeset publish` or publish npm packages.

`scripts/release-tag.mjs`:

1. Reads the extension package version.
2. Checks whether remote tag `v<version>` already exists; if so, exits without uploading again.
3. Otherwise creates/pushes that tag at the checked-out release commit.
4. Dispatches `Submit Extension to Web Store` (`submit.yml`) at that exact tag.

The workflow's publish path is selected by **absence of pending changesets**, not by PR title. Any `main` push without pending changesets can invoke it; the existing-tag guard normally prevents repeated uploads.

## Deployment map: automatic versus manual

| Surface | Trigger | What success means |
| --- | --- | --- |
| PR quality | `ci.yml`: PR targeting `main` | Lint, three app typechecks, web/extension builds, MCP checks and Worker dry-run passed. No production deployment. |
| Security | `codeql.yml`: PR, weekly schedule, manual dispatch | CodeQL analysis completed. No deployment. |
| Product versions | `release.yml`: push to `main` | Pending changesets generate/update a version PR; a merge is still required. |
| Web | `deploy.yml`: every push to `main`, or manual dispatch | Pages deployment completed; the built website is live. |
| Extension draft | `submit.yml`: explicit workflow dispatch, normally from the release hook | ZIP saved and Chrome Web Store draft uploaded. **Not submitted or published.** |
| MCP Worker | Explicit `pnpm --filter mcp-server deploy` | Production Worker deployed; verify health and tool round trip separately. |
| Chrome publication | Human action in Chrome Web Store dashboard | Human submits/publishes; Chrome review and client update timing still apply. |

CI/CodeQL no longer duplicate their PR runs on every `main` push. Pages and release workflows still run after merge because they perform different work. CI does not currently run the complete `pnpm test` suite; run release checks below explicitly too.

**No atomic rollout exists.** Pages can be live before the extension draft finishes, and a draft never updates installed extensions. A package version bump does not deploy the MCP Worker. For breaking compatibility changes, coordinate the rollout or hold the merge; the Version Packages PR does not gate Pages deployment.

## Extension: draft upload and verification

`submit.yml` checks out the dispatch ref, reads the version, installs dependencies, builds/packages the extension, and saves `tabot-extension-<version>` for 30 days. It then uploads that ZIP using `PlasmoHQ/bpp@v3`.

`scripts/chrome-draft-keys.mjs` passes only Chrome credentials and forces `chrome.uploadOnly: true`, overriding the secret's value. No workflow step submits or publishes the draft. The ZIP artifact is saved **before** upload; artifact existence alone does not prove the upload succeeded.

After the version merge:

```bash
gh run list --workflow release.yml --limit 5
gh run list --workflow deploy.yml --limit 5
gh run list --workflow submit.yml --limit 5
# Inspect the specific run; replace RUN_ID:
gh run view RUN_ID --log-failed
```

Check the submit run's tag/commit, ZIP manifest version and the draft version in the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole). Review listing, permissions, screenshots, privacy disclosures and upgrade behavior before any human submission. See `CHROMEWEBSTORE.md`; older context/pattern/export claims must match current beta behavior before publication.

For a local ZIP without uploading:

```bash
pnpm --filter extension build
pnpm --filter extension package
# apps/extension/build/chrome-mv3-prod.zip
```

## MCP: explicit deployment, including version-only alignment

Neither Pages nor the release/store workflows deploy Cloudflare. If live `/health` must report `0.2.8`, deploy the Worker from the approved `0.2.8` release commit even if its only change is the product version.

```bash
# In a clean checkout/worktree of the approved release tag:
git checkout --detach v0.2.8
pnpm install --frozen-lockfile
pnpm --filter mcp-server deploy:check  # Checks + dry-run only
pnpm --filter mcp-server deploy        # Changes production
curl --fail --silent https://tabot-mcp.shanvit7.workers.dev/health
```

Use the existing authorized Wrangler account or Cloudflare deployment credentials. Production config is `apps/mcp-server/wrangler.toml`, Worker `tabot-mcp`. Retain `TABOT_AUTH_SECRET` and `TABOT_EXTENSION_ID`; do not rotate the auth secret for a normal release, as this invalidates extension credentials.

Health proves availability/version, not extension connectivity. In extension popup DevTools, run:

```js
chrome.runtime.sendMessage({ type: 'RUN_RELAY_SANITY_CHECK' }, console.log);
```

Verify `relay.state`, `roundTrip.ok`, the assistant grant and one bounded synthetic tool request. See [relay operations](../apps/mcp-server/README.md) for setup and compatibility checks.

## Permissions and configuration

- GitHub Actions must be allowed to create pull requests. The release workflow requests `contents: write`, `pull-requests: write` and `actions: write`; repository/org policies can still block it.
- Changesets supplies its GitHub token to the publish script as `GITHUB_TOKEN`; `gh workflow run` uses it to dispatch the store workflow. A local manual dispatch uses your authenticated `gh` account instead.
- A PR created/updated using the default Actions token may not trigger ordinary PR workflows. If required checks never start, inspect the triggering actor/token and repository policy; a properly scoped GitHub App/PAT can be configured by a maintainer. Do not treat missing checks as passed.
- Restricted updates to `main` still apply. A green PR cannot override a ruleset; an authorized maintainer must merge or use a permitted bypass. Automation must not weaken rules to release.
- `SUBMIT_KEYS` must contain valid Chrome upload credentials under `chrome`. Never put credentials in docs, logs or PR bodies.
- Pages must use GitHub Actions as its source, and the `github-pages` environment must permit `main`. Repository variables: `TABOT_EXTENSION_ID`, `CHROME_WEB_STORE_URL`; optional `POSTHOG_PROJECT_KEY`/`POSTHOG_HOST`. Base path/site URL come from `actions/configure-pages`.
- Store/relay extension IDs must match the production extension. Keep dev and production credentials separate.

## Recovery: do not bump again just to retry a deployment

| Failure | Recovery |
| --- | --- |
| Feature merged but versions still old | Inspect release run and Version Packages PR. Merge the actual version PR; the feature changeset alone is not a bump. |
| Version command failed | Merge the script/workflow fix to `main`; that push triggers a fresh release run. Reruns retain the original SHA/ref, so use them only for transient failures or externally fixed permissions/configuration. `release.yml` has no manual-dispatch trigger. |
| Version PR blocked | Inspect checks/ruleset and use an authorized merger. Do not assume an admin merge will bypass every rule. |
| Tag exists but no draft run / failed upload | The release hook skips existing tags. After fixing the cause, dispatch `submit.yml` manually at that tag; do not delete/repoint the release tag. |
| ZIP exists but upload failed | Inspect the upload step and store draft before retrying. Do not blindly re-upload a version already accepted by Chrome. |
| Pages failed or still shows old version | Inspect `deploy.yml` build/deploy and environment approval; retry/deploy the approved release ref and check browser cache. |
| MCP health still reports old version | Deploy the approved release to Cloudflare; bumping repository files did not deploy it. |

Example retry for this release, only after verifying the tag and current store draft:

```bash
gh workflow run submit.yml --ref v0.2.8
# Pages retry when needed; main must contain the approved release:
gh workflow run deploy.yml --ref main
```

A tag proves neither upload nor publication. A successful workflow dispatch only queues a run. Verify the resulting job and destination before reporting deployment complete.

## Release gates and rollback

Before rollout, run:

```bash
pnpm check:release
pnpm --filter @tabot/shared check:version
pnpm lint
pnpm test
pnpm --filter web exec tsc --noEmit
pnpm --filter extension exec tsc --noEmit
pnpm --filter web build
pnpm --filter extension build
pnpm --filter extension package
pnpm --filter mcp-server deploy:check
```

Production web builds need the configured extension ID and valid store URL. Inspect the built extension manifest version/permissions/relay origin. Test upgrades using a copied test Chrome profile with synthetic data: retained events/pages/notes, migration/restart/replay, keyword fallback, tracking, notes and deletion. Never test destructive migration against your only real profile. Smoke-test web deep links and disconnected/incompatible-extension/error states.

Rollback is per surface: redeploy a known-good web commit; use Cloudflare rollback only after checking state compatibility; never erase relay state or rotate secrets as a rollback shortcut. Chrome generally requires a higher corrective version, not a downgrade; database migrations may not be reversible. Preserve test-profile backups.
