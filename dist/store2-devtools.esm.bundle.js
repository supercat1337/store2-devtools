// src/devtools.js
import { PLUGIN_API_VERSION } from "@supercat1337/store2";

// src/redux-bridge.js
var ReduxBridge = class {
  /** @type {any} */
  #extension = null;
  /** @type {(() => void) | null} */
  #unsubscribe = null;
  /** @type {string} */
  #name;
  /**
   * @param {string} name Display name shown in the extension.
   */
  constructor(name) {
    this.#name = name;
  }
  /**
   * Attempts to connect to the Redux DevTools Extension.
   *
   * @param {import('@supercat1337/store2').ContextSnapshot} initialState
   *        Baseline state sent via `init()`.
   * @param {(index: number) => void} onJumpToAction
   *        Called when the extension requests a jump to a specific
   *        action. The index is the *extension's* action index, not
   *        the plugin's entry index — the plugin translates it.
   * @param {() => void} onJumpToState
   *        Called when the extension requests a jump to the initial
   *        state.
   * @param {() => void} onReset
   *        Called when the extension requests a reset.
   * @returns {boolean} `true` if the connection was established.
   */
  connect(initialState, onJumpToAction, onJumpToState, onReset) {
    const g = (
      /** @type {any} */
      globalThis
    );
    const ext = g.__REDUX_DEVTOOLS_EXTENSION__;
    if (!ext || typeof ext.connect !== "function") {
      return false;
    }
    try {
      this.#extension = ext.connect({
        name: this.#name,
        features: {
          pause: false,
          lock: false,
          persist: false,
          export: true,
          import: "custom",
          jump: true,
          skip: false,
          reorder: false,
          dispatch: false,
          test: false
        }
      });
      try {
        this.#extension.init(initialState);
      } catch (e) {
        console.warn("[store2-devtools] extension.init failed:", e);
      }
      if (typeof this.#extension.subscribe === "function") {
        const unsubscribe = this.#extension.subscribe(
          /** @param {any} message */
          (message) => {
            this.#handleMessage(message, {
              onJumpToAction,
              onJumpToState,
              onReset
            });
          }
        );
        if (typeof unsubscribe === "function") {
          this.#unsubscribe = unsubscribe;
        }
      }
      return true;
    } catch (e) {
      console.warn("[store2-devtools] failed to connect to extension:", e);
      this.#extension = null;
      return false;
    }
  }
  /**
   * Forwards a completed action to the extension.
   *
   * @param {string} name
   * @param {import('@supercat1337/store2').ContextSnapshot} snapshot
   */
  send(name, snapshot) {
    if (!this.#extension) {
      return;
    }
    try {
      this.#extension.send(name, snapshot);
    } catch (e) {
      console.warn("[store2-devtools] failed to send to extension:", e);
    }
  }
  /**
   * Detaches from the extension. Idempotent.
   */
  disconnect() {
    if (this.#unsubscribe) {
      try {
        this.#unsubscribe();
      } catch (e) {
        console.warn("[store2-devtools] failed to unsubscribe:", e);
      }
      this.#unsubscribe = null;
    }
    this.#extension = null;
  }
  /**
   * @param {any} message
   * @param {{ onJumpToAction: (i: number) => void, onJumpToState: () => void, onReset: () => void }} handlers
   */
  #handleMessage(message, handlers) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type !== "DISPATCH") {
      return;
    }
    const payload = message.payload;
    if (!payload) {
      return;
    }
    if (payload.type === "JUMP_TO_ACTION") {
      const index = Number(payload.actionId);
      if (Number.isFinite(index)) {
        handlers.onJumpToAction(index);
      }
    } else if (payload.type === "JUMP_TO_STATE") {
      handlers.onJumpToState();
    } else if (payload.type === "RESET") {
      handlers.onReset();
    }
  }
};

// src/devtools.js
var DevToolsPlugin = class {
  /**
   * Plugin identifier. Also used as the default display name in the
   * Redux DevTools Extension when no `name` option is provided.
   */
  name = "devtools";
  /**
   * Plugin API version. Matches the core's `PLUGIN_API_VERSION`; the
   * context rejects the plugin if the two do not match.
   */
  apiVersion = PLUGIN_API_VERSION;
  /** @type {import('@supercat1337/store2').Store2Context | null} */
  #context = null;
  /** @type {import('./types.js').DevToolsEntry[]} */
  #entries = [];
  /** @type {number} */
  #maxAge;
  /** @type {number} */
  #nextId = 0;
  /** @type {number} */
  #currentIndex = -1;
  /** @type {ReduxBridge | null} */
  #bridge = null;
  /** @type {boolean} */
  #isTimeTraveling = false;
  /** @type {Set<import('./types.js').DevToolsListener>} */
  #listeners = /* @__PURE__ */ new Set();
  /** @type {import('./types.js').DevToolsOptions} */
  #options;
  /**
   * @param {import('./types.js').DevToolsOptions} [options]
   */
  constructor(options = {}) {
    const maxAge = options.maxAge ?? 50;
    if (!Number.isInteger(maxAge) || maxAge < 1) {
      throw new Error("DevTools maxAge must be a positive integer");
    }
    this.#maxAge = maxAge;
    this.#options = options;
  }
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
  install(context) {
    this.#context = context;
    this.#recordEntry("@@INIT", 0);
    if (this.#options.connectToExtension !== false) {
      const bridge = new ReduxBridge(this.#options.name || "store2");
      const connected = bridge.connect(
        this.#context.snapshot(),
        (extIndex) => this.jumpTo(extIndex + 1),
        () => this.jumpTo(0),
        () => this.reset()
      );
      if (connected) {
        this.#bridge = bridge;
      }
    }
  }
  /**
   * Records a new history entry after an action completes.
   *
   * Called by the context's action lifecycle. Ignored while a time-travel
   * jump is in progress, so that rewinding does not itself appear as a
   * new action in the history.
   *
   * @param {import('@supercat1337/store2').ActionInfo} action
   */
  onActionEnd(action) {
    if (this.#isTimeTraveling) {
      return;
    }
    const durationMs = action.endTime !== null ? action.endTime - action.startTime : 0;
    const entry = this.#recordEntry(action.name, durationMs);
    if (this.#bridge && entry) {
      this.#bridge.send(action.name, entry.snapshot);
    }
  }
  /**
   * Appends a new entry to the history, truncating any future entries that
   * were superseded by a time-travel followed by a fresh action.
   *
   * @param {string} name
   * @param {number} durationMs
   * @returns {import('./types.js').DevToolsEntry | null}
   */
  #recordEntry(name, durationMs) {
    if (!this.#context) {
      return null;
    }
    if (this.#currentIndex < this.#entries.length - 1) {
      this.#entries.splice(this.#currentIndex + 1);
    }
    const entry = {
      id: this.#nextId++,
      name,
      timestamp: Date.now(),
      durationMs,
      snapshot: this.#context.snapshot()
    };
    this.#entries.push(entry);
    while (this.#entries.length > this.#maxAge) {
      this.#entries.shift();
    }
    this.#currentIndex = this.#entries.length - 1;
    this.#emitChange();
    return entry;
  }
  #emitChange() {
    const entry = this.#entries[this.#currentIndex] || null;
    for (const listener of this.#listeners) {
      try {
        listener(entry, this.#currentIndex);
      } catch (e) {
        console.error("[store2-devtools] listener threw:", e);
      }
    }
  }
  /**
   * Returns a shallow copy of the recorded history.
   *
   * The returned array is newly allocated; mutating it does not affect
   * the plugin. The snapshot objects inside each entry are shared by
   * reference — treat them as immutable.
   *
   * @returns {import('./types.js').DevToolsEntry[]}
   */
  getHistory() {
    return this.#entries.map((e) => ({ ...e }));
  }
  /**
   * Returns the index of the entry the plugin is currently positioned at.
   *
   * Entry `0` is the baseline; higher indices correspond to completed
   * actions in order. Returns `-1` if the plugin has not been installed
   * yet.
   *
   * @returns {number}
   */
  getCurrentIndex() {
    return this.#currentIndex;
  }
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
  getCurrentEntry() {
    return this.#entries[this.#currentIndex] ?? null;
  }
  /**
   * Returns the current dependency graph of the context.
   *
   * Delegates to `context.dumpGraph()`. Returns `null` when the plugin
   * has not been installed yet.
   *
   * @returns {import('@supercat1337/store2').GraphDump | null}
   */
  getGraph() {
    if (!this.#context) {
      return null;
    }
    return this.#context.dumpGraph();
  }
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
  jumpTo(index) {
    if (!this.#context) {
      return;
    }
    if (index < 0 || index >= this.#entries.length) {
      return;
    }
    if (index === this.#currentIndex) {
      return;
    }
    const entry = this.#entries[index];
    this.#isTimeTraveling = true;
    try {
      this.#context.hydrate(entry.snapshot, { timeTravel: true });
      this.#currentIndex = index;
    } finally {
      this.#isTimeTraveling = false;
    }
    this.#emitChange();
  }
  /**
   * Clears the history and records a fresh baseline.
   *
   * Called by the plugin itself in response to a `RESET` message from
   * the Redux DevTools Extension, or directly by user code. After this
   * call, the history contains exactly one entry: the new baseline.
   */
  reset() {
    this.#entries.length = 0;
    this.#currentIndex = -1;
    this.#nextId = 0;
    this.#recordEntry("@@INIT", 0);
  }
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
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  }
  /**
   * Detaches from the Redux DevTools Extension, if connected.
   *
   * Safe to call when no extension is connected or after the plugin was
   * installed with `connectToExtension: false`. Idempotent.
   */
  disconnect() {
    if (this.#bridge) {
      this.#bridge.disconnect();
      this.#bridge = null;
    }
  }
};
function createDevToolsPlugin(options = {}) {
  return new DevToolsPlugin(options);
}
export {
  DevToolsPlugin,
  createDevToolsPlugin
};
