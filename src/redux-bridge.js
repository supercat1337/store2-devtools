// @ts-check

/**
 * Thin wrapper around the Redux DevTools Extension API.
 *
 * All interaction with `__REDUX_DEVTOOLS_EXTENSION__` goes through this
 * class so that `DevToolsPlugin` does not have to know about the
 * extension's message format. When the extension is not available, the
 * bridge is a no-op and the plugin works in standalone mode.
 *
 * The bridge never throws — extension misbehaviour is logged and
 * swallowed so it cannot break the host application.
 */
export class ReduxBridge {
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
        const g = /** @type {any} */ (globalThis);
        const ext = g.__REDUX_DEVTOOLS_EXTENSION__;

        if (!ext || typeof ext.connect !== 'function') {
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
                    import: 'custom',
                    jump: true,
                    skip: false,
                    reorder: false,
                    dispatch: false,
                    test: false,
                },
            });

            try {
                this.#extension.init(initialState);
            } catch (e) {
                console.warn('[store2-devtools] extension.init failed:', e);
            }

            if (typeof this.#extension.subscribe === 'function') {
                const unsubscribe = this.#extension.subscribe(
                    /** @param {any} message */ message => {
                        this.#handleMessage(message, {
                            onJumpToAction,
                            onJumpToState,
                            onReset,
                        });
                    }
                );
                if (typeof unsubscribe === 'function') {
                    this.#unsubscribe = unsubscribe;
                }
            }

            return true;
        } catch (e) {
            console.warn('[store2-devtools] failed to connect to extension:', e);
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
            console.warn('[store2-devtools] failed to send to extension:', e);
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
                console.warn('[store2-devtools] failed to unsubscribe:', e);
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
        if (!message || typeof message !== 'object') {
            return;
        }
        if (message.type !== 'DISPATCH') {
            return;
        }

        const payload = message.payload;
        if (!payload) {
            return;
        }

        if (payload.type === 'JUMP_TO_ACTION') {
            const index = Number(payload.actionId);
            if (Number.isFinite(index)) {
                handlers.onJumpToAction(index);
            }
        } else if (payload.type === 'JUMP_TO_STATE') {
            handlers.onJumpToState();
        } else if (payload.type === 'RESET') {
            handlers.onReset();
        }
    }
}
