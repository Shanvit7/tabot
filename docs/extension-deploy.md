# Release and deployment — Tabot

## 0.2.7 release

Changeset: none. This is the repository's pre-bumped release path; notes are in `apps/extension/CHANGELOG.md` and `apps/mcp-server/CHANGELOG.md`.

### Deployment status

- Release commit `519e3da` pushed; tag `v0.2.7` created.
- Production MCP Worker deployed; `/health` reports `0.2.7`.
- Chrome Web Store draft upload succeeded for `v0.2.7`. Not submitted or published.
- GitHub Pages build succeeded, but deployment was blocked because `fix/ui-improve-home` is not allowed by the protected production Pages environment. PR [#27](https://github.com/Shanvit7/tabot/pull/27) is open; merge to `main` is required for the automatic Pages deployment. Failed dispatch: [run 45025720807](https://github.com/Shanvit7/tabot/actions/runs/45025720807).

### User-facing release summary

This patch keeps Home responsive with large local activity histories and makes ChatGPT connection status reflect the extension, live relay, and a test request. Setup guidance uses plain language. The relay hardens OAuth consent and token validation and tells MCP clients to treat returned activity and notes as untrusted data.

Browser events, automatic excerpts, notes and search indexes remain local. Authorized assistant calls return bounded results; explicitly requested note titles/text are filtered for selected sensitive patterns, not guaranteed free of sensitive information. Reusable contexts and user-directed automations remain product direction, not shipped beta features.

### Version decision — resolved as a pre-bumped release

The latest tag is v0.2.6. Both `apps/extension/package.json` and `apps/mcp-server/package.json` are bumped to **0.2.7**, matching `packages/shared/src/version.ts` and the ChatGPT plugin manifest.

Changesets versions from the current package version, so a new changeset here would ship **0.2.8**, not 0.2.7. This release uses the repository's existing **pre-bumped path**: release notes live in `apps/extension/CHANGELOG.md` and `apps/mcp-server/CHANGELOG.md`, and there is **no pending changeset**. The release tag is `v0.2.7`; the draft upload must use that exact tag.

`scripts/release-version.check.mjs` verifies extension, MCP, plugin and shared product versions stay aligned, and that Plasmo derives the extension manifest version from its package version. The extension manifest no longer hard-codes a second version (verified in the built artifact). `pnpm sync:product-version` runs in the Version Packages workflow after Changesets bumps the linked packages.

This pre-bumped path was specific to v0.2.7. Future feature PRs use Changesets: `extension` and `mcp-server` are linked, so an extension patch changeset on current `0.2.7` produces `0.2.8` for both in the generated Version Packages PR. The web app has no package version; its footer and Settings display shared `TABOT_VERSION`. The version workflow runs `pnpm sync:product-version` after Changesets to align that display version and ChatGPT plugin manifest with the linked packages. Do not pre-bump versions in a feature PR.

## Deployment map

| Surface | Trigger / command | Result |
| --- | --- | --- |
| Web | Merge to `main`, or manually run `deploy.yml` | GitHub Pages becomes **live** |
| Versioning | Merge changeset to `main` → `release.yml` | Opens/updates Version Packages PR |
| Extension | Merge Version Packages PR → `scripts/release-tag.mjs` → `submit.yml` | Tags version; builds exact tag; saves ZIP artifact; uploads **Chrome draft only** |
| MCP relay | Explicit `pnpm --filter mcp-server deploy` | Deploys production Cloudflare Worker; not part of Pages/store workflow |
| Chrome publication | Human action in Chrome Web Store dashboard | Review/submission/publication remains your decision |

`submit.yml` forces `chrome.uploadOnly: true` even if `SUBMIT_KEYS` says otherwise, and excludes credentials for other stores. In BPP, this is a **keys JSON property**, not a workflow input. No automated Chrome publish step remains in this release path.

A green store workflow means **draft uploaded**, not reviewed or published. A version tag alone does not prove upload success.

## Release gates

Before any production rollout:

1. Review release notes and version consistency: `pnpm check:release` and `pnpm --filter @tabot/shared check:version` must pass. For a feature PR, `pnpm changeset status` should show matching extension and MCP patch bumps; an extension patch changeset currently produces `0.2.8` for both.
2. Run `pnpm lint`, `pnpm test`, `pnpm --filter web build`, `pnpm --filter extension build`, `pnpm --filter extension package` and `pnpm --filter mcp-server deploy:check`.
3. Inspect `apps/extension/build/chrome-mv3-prod/manifest.json`: version must equal the package version; review permissions and production relay origin. Test the unpacked production build in a separate Chrome profile with synthetic data.
4. Test an upgrade from the previous release using a copied test profile: retained events/pages/notes, verified IndexedDB migration, repeated restart/replay, search fallback, tracking, notes and deletion. Do not test a destructive migration against your only real profile.
5. Test web + extension + relay together. Current relay removes legacy context/pattern/metric tools: old extensions or cached assistant tool lists may be incompatible. Verify compatibility with the currently published extension before replacing production relay; if incompatible, coordinate a compatibility rollout rather than assuming zero downtime.
6. Review `CHROMEWEBSTORE.md` before upload: its older listing/permission text and screenshots are **not submission-ready** for this pivot. Replace obsolete context/pattern/export claims with current page/site/note and eight-tool behavior; check privacy policy, data-use disclosures and screenshots. No new-permission claim should be made without comparing actual manifests.

**Pages deploys on every main merge, before the extension is necessarily available in the store.** Hold the merge, or deliberately pause Pages deployment until the coordinated rollout is ready. A Version Packages PR does not gate Pages deployment.

## Extension: draft now, publish manually

The normal Changesets path is:

1. Merge a reviewed feature PR containing a changeset to `main`.
2. Review the generated Version Packages PR: extension and MCP versions/changelogs plus synced shared `TABOT_VERSION` and plugin manifest.
3. Merge the version PR. The release hook pushes `v<version>` and dispatches the store workflow **at that tag**, not a later `main` commit.

For this pre-bumped 0.2.7 release, the release commit was tagged `v0.2.7` and the draft upload completed. For future releases, follow the normal version/tag workflow above.
4. Download `tabot-extension-<version>` from the workflow artifacts if needed; ZIP is retained for 30 days.
5. Review the uploaded draft, listing, screenshots, disclosures and upgrade behavior in the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole).
6. **You** choose when to submit/publish. No agent or workflow clicks Publish.

If upload fails after tagging, fix the failure and manually rerun the workflow at the same tag:

```bash
# Example only, after version selection and approval:
gh workflow run submit.yml --ref v0.2.7
```

The release hook exits when the tag already exists; it does not automatically retry a failed upload. Do not delete a tag to force a retry, and do not blindly re-upload a version Chrome already accepted.

For a local ZIP without any upload:

```bash
pnpm --filter extension build
pnpm --filter extension package
# apps/extension/build/chrome-mv3-prod.zip
```

## MCP relay: explicit production deployment

```bash
# Checks and bundle-only dry run; no deployment:
pnpm --filter mcp-server deploy:check

# Only after compatibility checks and production approval:
pnpm --filter mcp-server deploy
```

Production uses `apps/mcp-server/wrangler.toml`: Worker `tabot-mcp`, MCP endpoint `https://tabot-mcp.shanvit7.workers.dev/mcp`. Retain existing `TABOT_AUTH_SECRET` and `TABOT_EXTENSION_ID` bindings. **Do not rotate the auth secret for a normal release**; rotation invalidates installed extension credentials. Keep production/dev environments and credentials separate.

After deployment, check `/health`, then perform a live extension round trip and a bounded synthetic assistant request. `/health` alone proves only Worker availability. In popup DevTools (not service-worker DevTools):

```js
chrome.runtime.sendMessage({ type: 'RUN_RELAY_SANITY_CHECK' }, console.log);
```

Confirm `relay.state`, `roundTrip.ok` and the appropriate assistant grant. Refresh the assistant's connector tool list after this tool-surface change. Expect `search_all`, `find_related_activity`, `get_browsing_timeline`, `search_notes`, `list_sites`, `list_pages`, `get_page_notes` and `get_site_notes`. See [relay operations](../apps/mcp-server/README.md).

## Web: GitHub Pages

`deploy.yml` builds the dashboard and uploads `apps/web/.output/client`. Its existing workflow handles route prerendering, fallback and base path. GitHub Pages must use GitHub Actions as its deployment source.

Check Actions variables: `TABOT_EXTENSION_ID`, `CHROME_WEB_STORE_URL`, and optional analytics `POSTHOG_PROJECT_KEY` / `POSTHOG_HOST`. Base path/site URL come from Pages configuration. The store extension ID must match the relay binding and installed production extension.

After a coordinated deployment, smoke-test landing, Home, Assistant, Settings, deep links, disconnected/incompatible-extension states and one page/site/note search. Dashboard read failures must remain unavailable/errors, not empty history.

## Credentials and rollback

- Store upload uses GitHub Actions secret `SUBMIT_KEYS`, with a `chrome` credentials object as documented by [BPP](https://github.com/PlasmoHQ/bpp). Do not paste credentials into the changeset, docs or logs.
- Cloudflare deployment uses the existing authorized Wrangler account or deployment credentials. Secrets remain Worker bindings, not committed env files.
- Web: restore a known-good commit through the Pages workflow.
- Relay: use Cloudflare Worker rollback only after checking Durable Object/state compatibility. Do not erase connection state or rotate secrets as a rollback shortcut.
- Extension: do not assume Chrome can accept a lower version, or that IndexedDB-to-OPFS migration is reversible. Preserve a test-profile backup; a corrective store update normally needs a higher version.
