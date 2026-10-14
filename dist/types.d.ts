/**
 * DevTools plugin for `@supercat1337/store2`.
 *
 * Records a snapshot of registered roots after every completed action,
 * exposes time-travel via `jumpTo()`, and optionally bridges to the
 * Redux DevTools Extension.
 *
 * @packageDocumentation
 */

import { ActionInfo } from '@supercat1337/store2';
import { ContextSnapshot } from '@supercat1337/store2';
import { GraphDump } from '@supercat1337/store2';
import { GraphDumpEdge } from '@supercat1337/store2';
import { GraphDumpItem } from '@supercat1337/store2';
import { Store2Context } from '@supercat1337/store2';

/**
 * Creates a DevTools plugin instance.
 *
 * @param {import('./types.js').DevToolsOptions} [options]
 * @returns {DevToolsPlugin}
 *
 * @example
 * ```js
 * const devtools = createDevToolsPlugin({ name: 'my app', maxAge: 100 });
 * ctx.use(devtools);
 *
 * devtools.subscribe((entry, index) => {
 *     console.log('now at', index, entry?.name);
 * });
 * ```
 *
 * @public
 */
export declare function createDevToolsPlugin(options?: DevToolsOptions): DevToolsPlugin;

/**
 * A single entry in the DevTools history.
 *
 * Entry `0` is always the baseline snapshot taken at install time.
 * Subsequent entries correspond to completed actions, in chronological
 * order.
 *
 * @public
 */
export declare interface DevToolsEntry {
    /**
     * Monotonic id assigned by the plugin. Independent of the entry's
     * position in the history — `id` is stable even after older entries
     * are pruned by `maxAge`.
     */
    id: number;
    /**
     * Action name, or `'@@INIT'` for the baseline.
     */
    name: string;
    /**
     * Wall-clock timestamp (milliseconds since epoch) when the entry was
     * recorded.
     */
    timestamp: number;
    /**
     * Duration of the recorded action in milliseconds. Zero for the
     * baseline.
     */
    durationMs: number;
    /**
     * State captured immediately after the action completed. For the
     * baseline entry, this is the state at install time.
     */
    snapshot: ContextSnapshot;
}

/**
 * Callback invoked whenever the current entry or the history changes.
 *
 * @public
 */
export declare type DevToolsListener = (entry: DevToolsEntry | null, index: number) => void;

/**
 * Options accepted by `createDevToolsPlugin`.
 *
 * @public
 */
export declare interface DevToolsOptions {
    /**
     * Display name used in the Redux DevTools Extension and in error logs.
     * Defaults to `'store2'`.
     */
    name?: string;
    /**
     * Maximum number of history entries kept in memory. Older entries are
     * discarded once the limit is exceeded. Must be a positive integer.
     * Defaults to `50`.
     */
    maxAge?: number;
    /**
     * Set to `false` to skip connecting to the Redux DevTools Extension
     * even when `__REDUX_DEVTOOLS_EXTENSION__` is present in the host
     * environment. Defaults to `true`.
     */
    connectToExtension?: boolean;
}

/**
 * Records a snapshot after every completed action and exposes a `jumpTo()`
 * method for time-travel.
 *
 * The plugin maintains a linear history. Entry `0` is the baseline snapshot
 * taken at install time; entries `1..N` are the state after each completed
 * action. When a new action arrives after a `jumpTo()`, the future is
 * truncated before the new entry is appended — matching Redux DevTools
 * behaviour.
 *
 * Time-travel calls `context.hydrate(snapshot, { timeTravel: true })`, which
 * suppresses plugin hooks for the duration of the rehydration so the
 * rehydration does not itself appear as an action.
 *
 * Recommended usage: install the plugin **after** registering all roots, so
 * the baseline snapshot captures their initial state.
 *
 * @example
 * ```js
 * import { createStore2Context, Store, atom } from '@supercat1337/store2';
 * import { createDevToolsPlugin } from '@supercat1337/store2-devtools';
 *
 * const ctx = createStore2Context({ name: 'app' });
 * const store = new Store();
 * const count = atom(0, { name: 'count' });
 * store.addItems({ count });
 * ctx.registerRoot('app', store);
 *
 * const devtools = createDevToolsPlugin({ name: 'my app' });
 * ctx.use(devtools);
 *
 * await ctx.action('increment', () => { count.value++; });
 * await ctx.action('increment', () => { count.value++; });
 *
 * devtools.getHistory().length; // 3: baseline + 2 actions
 * devtools.jumpTo(1);
 * count.value; // 1
 * ```
 *
 * @public
 */
export declare class DevToolsPlugin {
    /**
     * @param {import('./types.js').DevToolsOptions} [options]
     */
    constructor(options?: DevToolsOptions);
    /**
     * Plugin identifier. Also used as the default display name in the
     * Redux DevTools Extension when no `name` option is provided.
     */
    name: string;
    /**
     * Plugin API version. Matches the core's `PLUGIN_API_VERSION`; the
     * context rejects the plugin if the two do not match.
     */
    apiVersion: 1;
    /**
     * Called by the context when the plugin is registered via `use()`.
     *
     * Captures the initial baseline snapshot and connects to the Redux
     * DevTools Extension when it is available and enabled.
     *
     * Do not call this method directly — it is part of the plugin
     * installation contract.
     *
     * @param {import('@supercat1337/store2').Store2Context} context
     */
    install(context: Store2Context): void;
    /**
     * Records a new history entry after an action completes.
     *
     * Called by the context's action lifecycle. Ignored while a time-travel
     * jump is in progress, so that rewinding does not itself appear as a
     * new action in the history.
     *
     * @param {import('@supercat1337/store2').ActionInfo} action
     */
    onActionEnd(action: ActionInfo): void;
    /**
     * Returns a shallow copy of the recorded history.
     *
     * The returned array is newly allocated; mutating it does not affect
     * the plugin. The snapshot objects inside each entry are shared by
     * reference — treat them as immutable.
     *
     * @returns {import('./types.js').DevToolsEntry[]}
     */
    getHistory(): DevToolsEntry[];
    /**
     * Returns the index of the entry the plugin is currently positioned at.
     *
     * Entry `0` is the baseline; higher indices correspond to completed
     * actions in order. Returns `-1` if the plugin has not been installed
     * yet.
     *
     * @returns {number}
     */
    getCurrentIndex(): number;
    /**
     * Returns the entry at the current history index, or `null` if the
     * history is empty.
     *
     * After `jumpTo(index)`, the returned entry is the one at that index,
     * not the most recent one. Use `getHistory()` to inspect the full
     * history.
     *
     * @returns {import('./types.js').DevToolsEntry | null}
     */
    getCurrentEntry(): DevToolsEntry | null;
    /**
     * Returns the current dependency graph of the context.
     *
     * Delegates to `context.dumpGraph()`. Returns `null` when the plugin
     * has not been installed yet.
     *
     * @returns {import('@supercat1337/store2').GraphDump | null}
     */
    getGraph(): GraphDump | null;
    /**
     * Travels to a specific history index.
     *
     * Restores the state captured at that entry by calling
     * `context.hydrate(snapshot, { timeTravel: true })`. Plugin hooks are
     * suppressed for the duration of the hydration, so the jump does not
     * appear as a new action. Subscribers still run — the UI updates.
     *
     * No-op if the index is out of range or already current.
     *
     * @param {number} index
     */
    jumpTo(index: number): void;
    /**
     * Clears the history and records a fresh baseline.
     *
     * Called by the plugin itself in response to a `RESET` message from
     * the Redux DevTools Extension, or directly by user code. After this
     * call, the history contains exactly one entry: the new baseline.
     */
    reset(): void;
    /**
     * Subscribes a listener called whenever the current index or the
     * history changes.
     *
     * The listener receives the current entry (or `null` if the history is
     * empty) and its index. Errors thrown by the listener are caught and
     * logged, so one faulty listener cannot break others.
     *
     * @param {import('./types.js').DevToolsListener} fn
     * @returns {() => void} An unsubscribe function.
     */
    subscribe(fn: DevToolsListener): () => void;
    /**
     * Detaches from the Redux DevTools Extension, if connected.
     *
     * Safe to call when no extension is connected or after the plugin was
     * installed with `connectToExtension: false`. Idempotent.
     */
    disconnect(): void;
    #private;
}

export { GraphDump }

export { GraphDumpEdge }

export { GraphDumpItem }

export { }
