# Troubleshooting

## Table of Contents

1. `indexedDB is not defined`
2. Live queries do not refresh
3. Transactions abort unexpectedly
4. Queries are slow on larger datasets
5. Migration failures on existing users
6. Duplicate DB initialization in dev/hot reload
7. Data integrity checks

## 1. `indexedDB is not defined`

Symptom:

- Runtime error appears in SSR or server runtime.

Likely cause:

- Dexie module imported in server-executed code path.

Fix:

- Next.js: move Dexie usage to `'use client'` files or dynamic import with `ssr: false`.
- TanStack Start: wrap access in `createClientOnlyFn`.
- SvelteKit: guard with `$app/environment` and `browser`.

## 2. Live Queries Do Not Refresh

Symptom:

- UI renders once and stops updating after writes.

Likely causes:

- Queriers are not deterministic.
- Query reads non-Dexie async state without proper wrapping.
- Components are unsubscribing/recreating observers incorrectly.

Fix:

- Keep `liveQuery`/`useLiveQuery` queriers pure and read Dexie state directly.
- Return stable query shapes and avoid hidden mutable dependencies.
- Validate that writes target the same Dexie database and tables being observed.

## 3. Transactions Abort Unexpectedly

Symptom:

- Partial writes or transaction errors when mixing async operations.

Likely cause:

- Transaction zone lost due to unrelated async APIs in transaction scope.

Fix:

- Keep transaction scope focused on Dexie operations.
- If external async operations are required, apply Dexie transaction guidance such as `Dexie.waitFor()` deliberately.

## 4. Queries Are Slow on Larger Datasets

Symptom:

- List screens degrade with data growth.

Likely causes:

- Missing index for where/sort path.
- Full-table scans used in hot UI paths.

Fix:

- Map each hot query to an explicit index.
- Add compound indexes for frequent multi-field filters.
- Use pagination or bounded range queries instead of loading full collections.

## 5. Migration Failures on Existing Users

Symptom:

- App opens correctly on fresh DB but fails for existing users.

Likely causes:

- Non-idempotent `upgrade()` logic.
- Migration assumes fields are always present.

Fix:

- Make migration checks defensive (`if (field == null)`).
- Test upgrades from each previously released schema version.
- Keep migration code minimal and deterministic.

## 6. Duplicate DB Initialization in Dev/Hot Reload

Symptom:

- Inconsistent behavior or multiple open handles during local development.

Likely cause:

- Dexie instance created in multiple modules or inside component bodies.

Fix:

- Centralize Dexie construction in one module.
- Import that module everywhere; do not create `new Dexie(...)` in UI code.

## 7. Data Integrity Checks

Use a quick integrity pass after major changes:

- Verify unique constraints and expected row counts.
- Run transaction-heavy flows multiple times.
- Open app in two tabs and confirm read models stay consistent.
- Test clear-and-reseed path for local development recovery.

## Primary Sources

- Dexie transactions: <https://dexie.org/docs/Dexie/Dexie.transaction()>
- Dexie `liveQuery()`: <https://dexie.org/docs/liveQuery()>
- Dexie React hook rules: <https://dexie.org/docs/dexie-react-hooks/useLiveQuery()>
- Next.js client boundary docs: <https://nextjs.org/docs/app/api-reference/directives/use-client>
- TanStack Start execution model: <https://tanstack.com/start/latest/docs/framework/react/guide/execution-model>
- SvelteKit environment docs: <https://svelte.dev/docs/kit/$app-environment>
