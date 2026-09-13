# Changesets

This project uses [changesets](https://github.com/changesets/changesets) to bump the
extension version and keep a changelog. Everything ships through the **extension**
(the only versioned package) — `web` and `@tabot/shared` are internal and are never
versioned independently.

## Creating a changeset

Run `pnpm changeset`, pick the bump, write a short user-facing description. Or write
the file by hand:

```md
---
'extension': patch
---

Short description of the change from a user's point of view.
```

## Rules

- **Only reference `extension`.** Never list `web` or `@tabot/shared` — they are
  internal and must not be versioned independently.
- **Use `patch` for almost everything** (extension is pre-1.0). `minor` = notable new
  capability; `major` never.
- **Write for end users** — descriptions appear in the changelog/GitHub release.
  Focus on the problem solved and the benefit, keep it to a sentence or two.

## Release flow

1. Merge a PR that includes a changeset.
2. `release.yml` runs `changesets/action` → opens (or updates) a **Version Packages** PR.
3. Merging that PR commits the version bump + changelog to `main`.
4. The existing `deploy.yml` (Pages) and `submit.yml` (Chrome Web Store) run on the
   main push. The extension's bumped version + missing `v` git tag lets `submit.yml`
   release to the store.
