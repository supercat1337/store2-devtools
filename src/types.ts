// @ts-check

/**
 * Options accepted by `createDevToolsPlugin`.
 *
 * @public
 */
export interface DevToolsOptions {
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
 * A single entry in the DevTools history.
 *
 * Entry `0` is always the baseline snapshot taken at install time.
 * Subsequent entries correspond to completed actions, in chronological
 * order.
 *
 * @public
 */
export interface DevToolsEntry {
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
    snapshot: import('@supercat1337/store2').ContextSnapshot;
}

/**
 * Callback invoked whenever the current entry or the history changes.
 *
 * @public
 */
export type DevToolsListener = (entry: DevToolsEntry | null, index: number) => void;
