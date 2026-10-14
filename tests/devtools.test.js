// @ts-check

import test from 'ava';
import { createStore2Context, runWithContext, Store, atom } from '@supercat1337/store2';
import { createDevToolsPlugin } from '../src/index.js';

function setup() {
    const ctx = createStore2Context({ name: 'test' });

    /** @type {Store} */
    let store;
    /** @type {ReturnType<typeof atom<number>>} */
    let count;

    // Reactive items bind to the current context at construction time.
    // Create them inside runWithContext so they register with `ctx`
    // instead of the default context.
    runWithContext(ctx, () => {
        store = new Store();
        count = atom(0, { name: 'count' });
        store.addItems({ count });
        ctx.registerRoot('app', store);
    });

    const devtools = createDevToolsPlugin({
        name: 'test-app',
        connectToExtension: false,
    });
    ctx.use(devtools);

    return { ctx, store, count, devtools };
}

test('devtools: records a baseline entry on install', t => {
    const { devtools } = setup();
    const history = devtools.getHistory();
    t.is(history.length, 1);
    t.is(history[0].name, '@@INIT');
    t.is(devtools.getCurrentIndex(), 0);
});

test('devtools: records one entry per action', async t => {
    const { ctx, count, devtools } = setup();

    await ctx.action('increment', () => {
        count.value++;
    });
    await ctx.action('increment', () => {
        count.value++;
    });

    const history = devtools.getHistory();
    t.is(history.length, 3);
    t.is(history[1].name, 'increment');
    t.is(history[2].name, 'increment');
    t.is(devtools.getCurrentIndex(), 2);
});

test('devtools: jumpTo restores the value of an earlier entry', async t => {
    const { ctx, count, devtools } = setup();

    await ctx.action('inc', () => {
        count.value = 1;
    });
    await ctx.action('inc', () => {
        count.value = 2;
    });
    await ctx.action('inc', () => {
        count.value = 3;
    });

    t.is(count.value, 3);

    devtools.jumpTo(1);
    t.is(count.value, 1);
    t.is(devtools.getCurrentIndex(), 1);

    devtools.jumpTo(3);
    t.is(count.value, 3);

    devtools.jumpTo(0);
    t.is(count.value, 0);
});

test('devtools: a new action after jumpTo truncates the future', async t => {
    const { ctx, count, devtools } = setup();

    await ctx.action('a', () => {
        count.value = 1;
    });
    await ctx.action('b', () => {
        count.value = 2;
    });
    await ctx.action('c', () => {
        count.value = 3;
    });

    devtools.jumpTo(1);
    await ctx.action('d', () => {
        count.value = 100;
    });

    const history = devtools.getHistory();
    t.is(history.length, 3);
    t.is(history[2].name, 'd');
});

test('devtools: jumpTo during time-travel does not record a new entry', async t => {
    const { ctx, count, devtools } = setup();

    await ctx.action('a', () => {
        count.value = 1;
    });
    await ctx.action('b', () => {
        count.value = 2;
    });

    const before = devtools.getHistory().length;
    devtools.jumpTo(1);
    devtools.jumpTo(0);
    devtools.jumpTo(2);

    t.is(devtools.getHistory().length, before);
});

test('devtools: maxAge prunes the oldest entries', async t => {
    const ctx = createStore2Context({ name: 'test' });
    const store = new Store();
    const count = atom(0, { name: 'count' });
    store.addItems({ count });
    ctx.registerRoot('app', store);

    const devtools = createDevToolsPlugin({
        connectToExtension: false,
        maxAge: 3,
    });
    ctx.use(devtools);

    for (let i = 1; i <= 5; i++) {
        await ctx.action(`inc-${i}`, () => {
            count.value = i;
        });
    }

    const history = devtools.getHistory();
    t.is(history.length, 3);
    t.is(history[0].name, 'inc-3');
    t.is(history[2].name, 'inc-5');
});

test('devtools: maxAge=0 throws', t => {
    t.throws(() => createDevToolsPlugin({ maxAge: 0 }), { message: /positive integer/ });
    t.throws(() => createDevToolsPlugin({ maxAge: -1 }), { message: /positive integer/ });
});

test('devtools: reset clears history and records a new baseline', async t => {
    const { ctx, count, devtools } = setup();

    await ctx.action('a', () => {
        count.value = 1;
    });

    t.is(devtools.getHistory().length, 2);
    devtools.reset();
    t.is(devtools.getHistory().length, 1);
    t.is(devtools.getHistory()[0].name, '@@INIT');
});

test('devtools: getGraph returns the current dependency graph', t => {
    const { devtools, count } = setup();

    const graph = devtools.getGraph();
    t.truthy(graph);
    t.true(graph.items.some(i => i.name === 'count'));
});

test('devtools: getGraph before install returns null', t => {
    const devtools = createDevToolsPlugin({ connectToExtension: false });
    t.is(devtools.getGraph(), null);
});

test('devtools: subscribe fires on new entries and on jumpTo', async t => {
    const { ctx, count, devtools } = setup();

    /** @type {Array<{ name: string | null, index: number }>} */
    const events = [];
    devtools.subscribe((entry, index) => {
        events.push({ name: entry ? entry.name : null, index });
    });

    await ctx.action('a', () => {
        count.value = 1;
    });
    await ctx.action('b', () => {
        count.value = 2;
    });

    t.deepEqual(events, [
        { name: 'a', index: 1 },
        { name: 'b', index: 2 },
    ]);

    events.length = 0;
    devtools.jumpTo(0);
    t.deepEqual(events, [{ name: '@@INIT', index: 0 }]);
});

test('devtools: unsubscribe stops listener', async t => {
    const { ctx, count, devtools } = setup();
    let callCount = 0;
    const unsub = devtools.subscribe(() => callCount++);

    await ctx.action('a', () => {
        count.value = 1;
    });
    const afterFirst = callCount;
    t.true(afterFirst > 0);

    unsub();
    await ctx.action('b', () => {
        count.value = 2;
    });
    t.is(callCount, afterFirst);
});

test('devtools: disconnect is safe without extension', t => {
    const { devtools } = setup();
    t.notThrows(() => devtools.disconnect());
});

test('devtools: jumpTo out of range is a no-op', async t => {
    const { ctx, count, devtools } = setup();
    await ctx.action('a', () => {
        count.value = 1;
    });

    const before = devtools.getCurrentIndex();
    devtools.jumpTo(-1);
    devtools.jumpTo(999);
    t.is(devtools.getCurrentIndex(), before);
});

test('devtools: jumpTo current index is a no-op', async t => {
    const { ctx, count, devtools } = setup();
    await ctx.action('a', () => {
        count.value = 1;
    });

    const snapshotsBefore = JSON.stringify(devtools.getHistory());
    devtools.jumpTo(devtools.getCurrentIndex());
    t.is(JSON.stringify(devtools.getHistory()), snapshotsBefore);
});

test('devtools: apiVersion matches core PLUGIN_API_VERSION', t => {
    const { devtools } = setup();
    t.is(devtools.apiVersion, 1);
});

test('devtools: listener errors are caught', async t => {
    const { ctx, count, devtools } = setup();

    const logged = [];
    const originalError = console.error;
    console.error = (...args) => logged.push(args);

    try {
        devtools.subscribe(() => {
            throw new Error('listener threw');
        });
        await ctx.action('a', () => {
            count.value = 1;
        });
        t.is(logged.length, 1);
        t.true(String(logged[0][0]).includes('listener threw'));
    } finally {
        console.error = originalError;
    }
});

test.serial('devtools: after disconnect, actions are not forwarded', async t => {
    const sent = [];
    /** @type {any} */ (globalThis).__REDUX_DEVTOOLS_EXTENSION__ = {
        connect() {
            return {
                init() {},
                send(name, state) {
                    sent.push({ name, state });
                },
                subscribe() {
                    return () => {};
                },
            };
        },
    };

    try {
        const { ctx, count, devtools } = setup();
        // Reinstall plugin to pick up extension
        // (setup uses connectToExtension: false)

        // Note: setup() disables the extension, so use a fresh context here.
        const ctx2 = createStore2Context({ name: 'disc-test' });
        let count2;
        runWithContext(ctx2, () => {
            const store = new Store();
            count2 = atom(0, { name: 'count' });
            store.addItems({ count: count2 });
            ctx2.registerRoot('app', store);
        });
        const dt2 = createDevToolsPlugin({ name: 'disc-app' });
        ctx2.use(dt2);

        await ctx2.action('one', () => {
            count2.value = 1;
        });
        t.is(sent.length, 1);

        dt2.disconnect();

        await ctx2.action('two', () => {
            count2.value = 2;
        });
        t.is(sent.length, 1); // no new sends after disconnect
    } finally {
        delete (/** @type {any} */ (globalThis).__REDUX_DEVTOOLS_EXTENSION__);
    }
});

test('devtools: jumpTo before install is a safe no-op', t => {
    const devtools = createDevToolsPlugin({ connectToExtension: false });
    t.notThrows(() => devtools.jumpTo(0));
    t.notThrows(() => devtools.jumpTo(1));
    t.is(devtools.getCurrentIndex(), -1);
});

test('devtools: onActionEnd before install is a safe no-op', t => {
    const devtools = createDevToolsPlugin({ connectToExtension: false });
    t.notThrows(() =>
        devtools.onActionEnd({
            id: '1',
            name: 'test',
            payload: undefined,
            parentId: null,
            startTime: 0,
            endTime: 1,
            error: null,
        })
    );
    t.is(devtools.getHistory().length, 0);
});

test('devtools: jumpTo and getGraph before install are safe no-ops', t => {
    const devtools = createDevToolsPlugin({ connectToExtension: false });
    t.notThrows(() => devtools.jumpTo(0));
    t.notThrows(() => devtools.jumpTo(1));
    t.is(devtools.getCurrentIndex(), -1);
    t.is(devtools.getGraph(), null);
});
