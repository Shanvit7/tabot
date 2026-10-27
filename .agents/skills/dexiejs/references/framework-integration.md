# Framework Integration

## Table of Contents

1. Vanilla JavaScript
2. React
3. Next.js (App Router)
4. TanStack Start
5. Svelte
6. SvelteKit
7. Cross-framework guardrails

## 1. Vanilla JavaScript

Use a shared DB module and subscribe with `liveQuery()`.

```js
import { liveQuery } from 'dexie';
import { db } from './db.js';

const sub = liveQuery(() => db.todos.where('done').equals(0).toArray()).subscribe({
  next(rows) {
    renderTodos(rows);
  },
  error(error) {
    console.error('liveQuery failed', error);
  },
});

window.addEventListener('beforeunload', () => sub.unsubscribe());
```

Keep DOM rendering separate from data logic.

## 2. React

Use `dexie-react-hooks` for reactive reads.

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

export function TodoList() {
  const todos = useLiveQuery(
    () => db.todos.where('done').equals(0).reverse().sortBy('updatedAt'),
    [],
    []
  );

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

Guidelines:

- Use `defaultResult` to keep render paths predictable.
- Keep hook queriers side-effect free.
- Keep writes in explicit action handlers or data-layer functions.

## 3. Next.js (App Router)

Dexie is browser storage. Keep Dexie usage in client-only code.

Pattern A: place DB consumers in files with `'use client'`.

```tsx
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/client/db';
```

Pattern B: dynamically import Dexie-using components with SSR disabled.

```tsx
import dynamic from 'next/dynamic';

const TodosClientPanel = dynamic(() => import('./TodosClientPanel'), {
  ssr: false,
});
```

Do not import Dexie modules into Server Components, route handlers, or server actions.

## 4. TanStack Start

Route `loader` and `beforeLoad` code can run both server and client. Gate Dexie access.

```ts
import { createClientOnlyFn } from '@tanstack/react-start';

const getDb = createClientOnlyFn(async () => {
  const mod = await import('../db/client-db');
  return mod.db;
});

export async function readTodosClientOnly() {
  const db = await getDb();
  return db.todos.toArray();
}
```

Use this pattern whenever local IndexedDB access is needed from route-level logic.

## 5. Svelte

Consume `liveQuery` observables directly.

```svelte
<script>
  import { liveQuery } from 'dexie';
  import { db } from './db.js';

  const todos = liveQuery(() => db.todos.where('done').equals(0).toArray());
</script>

<ul>
  {#each $todos ?? [] as todo}
    <li>{todo.title}</li>
  {/each}
</ul>
```

Keep writes in explicit functions; avoid mutating data in reactive declarations.

## 6. SvelteKit

Guard browser-only Dexie paths with `$app/environment`.

```svelte
<script>
  import { browser } from '$app/environment';
  import { readable } from 'svelte/store';
  import { liveQuery } from 'dexie';
  import { db } from '$lib/client/db';

  const todos = browser
    ? liveQuery(() => db.todos.toArray())
    : readable([]);
</script>

{#if browser}
  <ul>
    {#each $todos ?? [] as todo}
      <li>{todo.title}</li>
    {/each}
  </ul>
{/if}
```

Do not call Dexie in `+page.server.ts` or server `load` functions.

## 7. Cross-Framework Guardrails

- Keep one `client-db` module that is only imported by browser-safe code.
- Keep storage schema and migration code framework-agnostic.
- Hide framework details behind repository/data-layer functions.
- Treat Dexie as local persistence; keep network sync logic separate.

## Primary Sources

- Dexie + React hooks: <https://dexie.org/docs/dexie-react-hooks/useLiveQuery()>
- Dexie `liveQuery()`: <https://dexie.org/docs/liveQuery()>
- Next.js `'use client'`: <https://nextjs.org/docs/app/api-reference/directives/use-client>
- Next.js dynamic import with `ssr: false`: <https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr>
- TanStack Start execution model and `createClientOnlyFn`: <https://tanstack.com/start/latest/docs/framework/react/guide/execution-model>
- SvelteKit `$app/environment` (`browser`): <https://svelte.dev/docs/kit/$app-environment>
