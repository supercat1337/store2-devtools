/**
 * DevTools plugin for `@supercat1337/store2`.
 *
 * Records a snapshot of registered roots after every completed action,
 * exposes time-travel via `jumpTo()`, and optionally bridges to the
 * Redux DevTools Extension.
 *
 * @packageDocumentation
 */

export { DevToolsPlugin, createDevToolsPlugin } from './devtools.js';

export type { DevToolsOptions, DevToolsEntry, DevToolsListener } from './types.js';

// Re-export commonly-used core types so UI packages can import them
// from one place.
export type { GraphDump, GraphDumpItem, GraphDumpEdge } from '@supercat1337/store2';
