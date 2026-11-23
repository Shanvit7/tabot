# Changesets

Tabot uses Changesets to prepare product releases. The complete source of truth for versioning, deployments, permissions and retries is [Release and deployment](../docs/extension-deploy.md).

## Feature PR: request a version bump

Add a new `.changeset/<descriptive-name>.md` (or run `pnpm changeset`):

```md
---
'extension': patch
'mcp-server': patch
---

Short description of the improvement from a user's point of view.
```

- **Include both `extension` and `mcp-server`** to keep product releases aligned. Linked packages do not force an untouched package to release.
- Do not list `web` or `@tabot/shared`; they are ignored internal workspaces.
- Use `patch` for normal beta fixes; review larger version changes explicitly.
- Do not pre-bump product versions in a feature PR while leaving its changeset pending.
- Run `pnpm changeset status` to inspect the intended releases.

## Version PR: apply the bump

1. Merge the reviewed feature PR to `main`. Package versions are still unchanged at this point.
2. `release.yml` opens/updates the **Version Packages** PR using `pnpm version:packages`.
3. That script runs Changesets, then `sync:product-version`: extension/MCP versions and changelogs advance; shared `TABOT_VERSION` and plugin manifest are synchronized.
4. **Consumed changeset files are deleted normally.** Notes move into the changelogs; keeping those files would request another bump. Changesets tooling/config remain installed. Future changes need new changeset files.
5. Review and merge the actual version PR. PR #32 contains the actual `0.2.8` bump; a later patch from `0.2.8` produces `0.2.9`.

## Deployment is separate

- Every `main` push deploys the web app through `deploy.yml`, subject to workflow/environment success. Web displays shared `TABOT_VERSION`; it has no package version.
- With no pending changesets, `release.yml` runs `release:tag`: create `v<extension-version>` if absent, then dispatch `submit.yml` at that tag. Existing tags are skipped.
- `submit.yml` builds the tagged extension and uploads a **Chrome draft only**. It does not run directly on `main` pushes, submit for review or publish.
- MCP deployment is **manual**: `pnpm --filter mcp-server deploy` from the approved release. Repository version sync does not update the running Worker.
- Chrome submission/publication is **manual**. A draft does not update installed extensions.

See the [runbook](../docs/extension-deploy.md) for release checks and failed-upload recovery. Internal root/shared package versions are not product versions and need not equal the release number.
