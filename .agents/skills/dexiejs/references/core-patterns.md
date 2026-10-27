# Core Patterns

## Table of Contents

1. Package selection and install
2. Canonical database module
3. Schema and index design
4. Query and mutation patterns
5. Transactions and async boundaries
6. Versioning and migrations
7. Reactive reads
8. Performance and reliability checklist

## 1. Package Selection and Install

Use a minimal package set:

- `dexie` for core IndexedDB wrapper and `liveQuery()`.
- `dexie-react-hooks` only in React/Next.js client components.

Install:

```bash
npm install dexie
npm install dexie-react-hooks
```

Use only the packages needed by the target framework.

## 2. Canonical Database Module

Create one shared module and import it everywhere.

```ts
import Dexie, { type EntityTable } from 'dexie';

export interface Todo {
  id?: number;
  title: string;
  done: 0 | 1;
  updatedAt: number;
  tags?: string[];
}

export const db = new Dexie('app-db') as Dexie & {
  todos: EntityTable<Todo, 'id'>;
};

db.version(1).stores({
  todos: '++id,done,updatedAt,[done+updatedAt],*tags',
});
```

Keep Dexie schema strings close to query usage. Do not hide schema in unrelated files.

## 3. Schema and Index Design

Design indexes from real query paths.

- Add single-field indexes for common equality/range filters.
- Add compound indexes for frequent multi-field filtering/sorting.
- Add `*field` multi-entry indexes for arrays that are queried by element.
- Keep index count disciplined; each index increases write cost and storage.

Dexie store syntax supports:

- Auto-increment primary key: `++id`
- Compound index: `[fieldA+fieldB]`
- Multi-entry index: `*tags`

Example:

```ts
db.version(1).stores({
  orders: '++id,customerId,status,createdAt,[status+createdAt],[customerId+status]'
});
```

## 4. Query and Mutation Patterns

Prefer data-layer helper functions instead of querying tables directly in UI.

```ts
export async function listOpenTodos() {
  return db.todos.where('done').equals(0).reverse().sortBy('updatedAt');
}

export async function markDone(id: number) {
  return db.todos.update(id, { done: 1, updatedAt: Date.now() });
}

export async function addManyTodos(titles: string[]) {
  const now = Date.now();
  return db.todos.bulkAdd(titles.map((title) => ({ title, done: 0, updatedAt: now })));
}
```

Guidelines:

- Use `bulkAdd`/`bulkPut` for batch writes.
- Keep mutation payloads narrow to reduce conflict surface.
- Use deterministic `updatedAt` or revision fields if sync/merge logic is expected later.

## 5. Transactions and Async Boundaries

Use `db.transaction()` whenever multiple reads/writes must be atomic.

```ts
export async function completeAndLog(todoId: number) {
  await db.transaction('rw', db.todos, async () => {
    const todo = await db.todos.get(todoId);
    if (!todo) return;

    await db.todos.update(todoId, { done: 1, updatedAt: Date.now() });
  });
}
```

Key rule from Dexie transaction docs: do not call unrelated async APIs inside the transaction zone unless intentionally wrapped (for example via `Dexie.waitFor()`).

## 6. Versioning and Migrations

Increment schema versions and migrate forward in `upgrade()` callbacks.

```ts
db.version(2)
  .stores({
    todos: '++id,done,updatedAt,priority,[done+priority],*tags',
  })
  .upgrade(async (tx) => {
    await tx.table('todos').toCollection().modify((todo: any) => {
      if (todo.priority == null) todo.priority = 'normal';
    });
  });
```

Migration rules:

- Keep upgrade logic idempotent.
- Avoid destructive transforms without fallback fields.
- Test upgrades with a copy of real production-like data.

## 7. Reactive Reads

Use `liveQuery()` for automatic UI updates from IndexedDB changes.

```ts
import { liveQuery } from 'dexie';

export const openTodos$ = liveQuery(() =>
  db.todos.where('done').equals(0).reverse().sortBy('updatedAt')
);
```

Rules:

- Keep queriers pure and deterministic.
- Prefer Dexie APIs inside queriers.
- If non-Dexie async work is unavoidable, follow Dexie guidance and wrap appropriately.

For React, consume via `useLiveQuery`. For Svelte, `liveQuery` observables can be consumed directly as stores.

## 8. Performance and Reliability Checklist

Before shipping:

- Verify every frequent query uses an index.
- Avoid full-table scans for list screens when dataset can grow.
- Keep one Dexie singleton to avoid connection churn.
- Test with large local datasets and multi-tab usage.
- Ensure migrations run correctly from every supported previous version.
- Do not store secrets in IndexedDB.

## Primary Sources

- Dexie quick reference: <https://dexie.org/docs/API-Reference>
- Dexie `Version.stores()` syntax and index forms: <https://dexie.org/docs/Version/Version.stores()>
- Dexie transactions: <https://dexie.org/docs/Dexie/Dexie.transaction()>
- Dexie upgrades: <https://dexie.org/docs/Version/Version.upgrade()>
- Dexie `liveQuery()`: <https://dexie.org/docs/liveQuery()>
