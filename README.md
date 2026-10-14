# @supercat1337/store2-devtools

DevTools plugin for [`@supercat1337/store2`](https://www.npmjs.com/package/@supercat1337/store2).

Records a snapshot after every completed action, exposes time-travel via
`jumpTo()`, and optionally bridges to the Redux DevTools Extension.

## Installation

```bash
npm install @supercat1337/store2 @supercat1337/store2-devtools
```

## Quick start

```js
import { createStore2Context, Store, atom } from '@supercat1337/store2';
import { createDevToolsPlugin } from '@supercat1337/store2-devtools';

const ctx = createStore2Context({ name: 'app' });
const store = new Store();
const count = atom(0, { name: 'count' });

store.addItems({ count });
ctx.registerRoot('app', store);

const devtools = createDevToolsPlugin({ name: 'my app', maxAge: 50 });
ctx.use(devtools);

await ctx.action('increment', () => {
    count.value++;
});
await ctx.action('increment', () => {
    count.value++;
});

devtools.getHistory().length; // 3: baseline + 2 actions
devtools.jumpTo(1);
count.value; // 1
```

## Programmatic API

- `getHistory(): DevToolsEntry[]` — full history as a shallow copy.
- `getCurrentEntry(): DevToolsEntry | null` — entry at the current index.
- `getCurrentIndex(): number` — index of the current entry, or `-1`.
- `jumpTo(index: number): void` — restore state captured at `index`.
- `reset(): void` — clear history and record a fresh baseline.
- `subscribe(fn): () => void` — observe history and index changes.
- `getGraph(): { items, edges } | null` — current dependency graph.
- `disconnect(): void` — detach from the Redux DevTools Extension.

## Redux DevTools Extension bridge

When `__REDUX_DEVTOOLS_EXTENSION__` is present on `globalThis`, the plugin
connects automatically and forwards every completed action. Set
`connectToExtension: false` to opt out.

> **Note.** For the graph to include your state, create your atoms and computed values inside `runWithContext(ctx, () => { ... })`. Items created at module top level bind to the default context and are not visible to a custom context's DevTools.

## How time-travel works

`jumpTo(index)` calls `context.hydrate(snapshot, { timeTravel: true })`,
which suppresses plugin hooks for the duration of the rehydration.
Subscribers still run — the UI updates — but the rewind does not appear
as a new action in the history. When a new action arrives after a jump,
the future history is truncated, matching Redux DevTools behaviour.

## License

MIT © 2025–2026 Albert Bazaleev
