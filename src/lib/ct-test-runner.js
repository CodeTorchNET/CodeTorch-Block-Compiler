// Finds the tests in the loaded project, runs them one at a time, and assembles the report.


import {createTestState, testStates} from './ct-tests-extension';

/**
 * The opcode of the hat that declares a test.
 * @type {string}
 */
const TEST_HAT_OPCODE = 'ctTests_whenTestRuns';

/**
 * Thread.STATUS_DONE. Inlined so this module does not have to pull the whole Thread class in.
 * @type {number}
 */
const STATUS_DONE = 4;

/**
 * @type {number}
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * @type {number}
 */
const MIN_TIMEOUT_MS = 500;

/**
 * @type {number}
 */
const MAX_TIMEOUT_MS = 60000;

/**
 * How often the runner checks a running test when the runtime is not stepping.
 * @type {number}
 */
const POLL_INTERVAL_MS = 250;

/**
 * The name given to a hat whose NAME slot holds a reporter instead of text.
 * @type {string}
 */
const UNNAMED_TEST = 'unnamed test';

/**
 * @returns {number} A monotonic-ish millisecond clock.
 */
const now = () => (
    typeof performance === 'object' && performance && typeof performance.now === 'function' ?
        performance.now() :
        Date.now()
);

/**
 * Clamp a requested per-test timeout into the range the protocol allows.
 * @param {*} value The requested timeout in milliseconds, possibly nonsense.
 * @returns {number} A usable timeout in milliseconds.
 */
const clampTimeout = value => {
    const number = Number(value);
    if (!isFinite(number)) {
        return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(number)));
};

/**
 * Read the name out of a test hat's NAME slot without going through the runtime's block cache,
 * which upper-cases field values and would make "Login" and "login" the same test.
 * @param {object} blocks The target's raw block map.
 * @param {object} block The hat block.
 * @returns {string} The authored name, trimmed, or "" when a reporter was dropped into the slot.
 */
const readTestName = (blocks, block) => {
    const input = block.inputs && block.inputs.NAME;
    const shadowId = input && (input.shadow || input.block);
    const shadow = shadowId && blocks[shadowId];
    if (shadow && shadow.fields && shadow.fields.TEXT) {
        return String(shadow.fields.TEXT.value).trim();
    }
    return '';
};

/**
 * Find every test hat in the project, in the order they will be run.
 *
 * Order is: targets in runtime order (the stage first, then the sprites as authored), then the
 * hat's y coordinate ascending, then the block id, so the order is stable across runs.
 * @param {object} runtime The VM runtime.
 * @returns {Array<object>} `{target, blockId, name}` for each test.
 */
const collectTests = runtime => {
    const found = [];
    const targets = (runtime && runtime.targets) || [];
    targets.forEach((target, targetIndex) => {
        if (!target || !target.isOriginal || !target.blocks) {
            return;
        }
        const blocks = target.blocks._blocks || {};
        Object.keys(blocks).forEach(blockId => {
            const block = blocks[blockId];
            if (!block || block.opcode !== TEST_HAT_OPCODE || block.topLevel !== true) {
                return;
            }
            const name = readTestName(blocks, block);
            found.push({
                target: target,
                blockId: blockId,
                name: name === '' ? UNNAMED_TEST : name,
                targetIndex: targetIndex,
                y: Number(block.y) || 0
            });
        });
    });
    found.sort((a, b) => (
        (a.targetIndex - b.targetIndex) ||
        (a.y - b.y) ||
        (a.blockId < b.blockId ? -1 : a.blockId > b.blockId ? 1 : 0)
    ));
    return found;
};

/**
 * Give every test a display name that is unique within the run. The first test keeping a given
 * name is left alone; later ones get " #2", " #3" and so on.
 * @param {Array<object>} tests Tests as returned by `collectTests`.
 * @returns {{tests: Array<object>, duplicates: Array<string>}} The renamed tests, and the names
 *   that occurred more than once.
 */
const disambiguateNames = tests => {
    const seen = new Map();
    const duplicates = [];
    const renamed = tests.map(test => {
        const count = (seen.get(test.name) || 0) + 1;
        seen.set(test.name, count);
        if (count === 2) {
            duplicates.push(test.name);
        }
        return Object.assign({}, test, {
            name: count === 1 ? test.name : `${test.name} #${count}`
        });
    });
    return {
        tests: renamed,
        duplicates: duplicates
    };
};

/**
 * Count the results the way the report's summary must count them.
 * @param {Array<object>} results Test results.
 * @returns {{passed: number, failed: number, total: number}} The summary.
 */
const summarize = results => {
    const passed = results.filter(result => result.status === 'passed').length;
    return {
        passed: passed,
        failed: results.length - passed,
        total: results.length
    };
};

/**
 * Assemble the report document.
 * @param {Array<object>} results Test results, in run order.
 * @param {Date} startedAt When the suite started.
 * @param {Date} finishedAt When the suite finished.
 * @returns {object} A TestReport.
 */
const buildReport = (results, startedAt, finishedAt) => ({
    runner: 'blocks',
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    tests: results,
    summary: summarize(results)
});

/**
 * Turn the state the blocks recorded into one entry of the report.
 * @param {string} name The display name.
 * @param {object} state The state object the blocks wrote to.
 * @param {string} status One of the four status literals.
 * @param {number} durationMs Wall-clock milliseconds.
 * @param {string} [extraMessage] A message from the runner itself, prepended to the block ones.
 * @returns {object} A TestResult.
 */
const buildResult = (name, state, status, durationMs, extraMessage) => {
    const messages = [];
    if (extraMessage) {
        messages.push(extraMessage);
    }
    if (state && state.failures.length) {
        state.failures.forEach(failure => messages.push(failure));
    }
    const result = {
        name: name,
        status: status,
        duration_ms: Math.max(0, Math.round(durationMs))
    };
    if (messages.length) {
        result.message = messages.join('\n');
    }
    return result;
};

/**
 * Wait until a thread finishes, is killed, is removed from the runtime, or runs out of time.
 * @param {object} runtime The VM runtime.
 * @param {object} thread The thread to watch.
 * @param {function} getTimeoutMs Reads the current timeout, which a block can raise mid-test.
 * @param {function} isCancelled Returns true when the run has been abandoned.
 * @returns {Promise<string>} "finished", "timed_out" or "cancelled".
 */
const waitForThread = (runtime, thread, getTimeoutMs, isCancelled) => new Promise(resolve => {
    const startedAt = now();
    let interval = null;
    let outcome = null;
    const check = () => {
        if (outcome !== null) {
            return;
        }
        if (isCancelled()) {
            outcome = 'cancelled';
        } else if (thread.status === STATUS_DONE || thread.isKilled ||
                runtime.threads.indexOf(thread) === -1) {
            outcome = 'finished';
        } else if (now() - startedAt > getTimeoutMs()) {
            outcome = 'timed_out';
        } else {
            return;
        }
        runtime.removeListener('AFTER_EXECUTE', check);
        clearInterval(interval);
        resolve(outcome);
    };
    // AFTER_EXECUTE fires once per step. The interval is the safety net for a stalled step loop.
    runtime.on('AFTER_EXECUTE', check);
    interval = setInterval(check, POLL_INTERVAL_MS);
});

/**
 * Start one test's script. Prefers `_pushThread`, which starts exactly the one script we chose.
 * @param {object} runtime The VM runtime.
 * @param {object} test One entry from `collectTests`.
 * @returns {?object} The started thread, or null when `_pushThread` is unavailable.
 */
const startTestThread = (runtime, test) => {
    if (typeof runtime._pushThread !== 'function') {
        return null;
    }
    return runtime._pushThread(test.blockId, test.target);
};

/**
 * Start every test of every target at once, for the case where `_pushThread` has gone away.
 * Isolation between tests is lost, which the report says out loud.
 * @param {object} runtime The VM runtime.
 * @param {Array<object>} tests The tests to start.
 * @returns {Map<string, object>} Block id to the thread running it.
 */
const startAllTestThreads = (runtime, tests) => {
    const threadsByBlockId = new Map();
    const startedTargets = new Set();
    tests.forEach(test => {
        if (startedTargets.has(test.target)) {
            return;
        }
        startedTargets.add(test.target);
        const started = runtime.startHats(TEST_HAT_OPCODE, null, test.target) || [];
        started.forEach(thread => {
            threadsByBlockId.set(thread.topBlock, thread);
        });
    });
    return threadsByBlockId;
};

/**
 * Run every test in the loaded project.
 * @param {object} vm The virtual machine.
 * @param {object} [options] Options.
 * @param {number} [options.timeoutMs] The default per-test timeout in milliseconds.
 * @param {function} [options.onProgress] Called with `(index, total, result)` per finished test.
 * @returns {{promise: Promise<object>, cancel: function}} The report, and a way to abandon the run.
 */
const runTests = (vm, options) => {
    const opts = options || {};
    const runtime = vm.runtime;
    const defaultTimeoutMs = clampTimeout(
        typeof opts.timeoutMs === 'undefined' ? DEFAULT_TIMEOUT_MS : opts.timeoutMs
    );
    let cancelled = false;
    const isCancelled = () => cancelled;

    const promise = (async () => {
        const startedAt = new Date();
        const collected = collectTests(runtime);
        const {tests, duplicates} = disambiguateNames(collected);
        const results = [];
        const wasRunning = !!(runtime.frameLoop && runtime.frameLoop.running);

        if (!wasRunning) {
            // A player-only page may not be stepping at all, and a test that never steps never
            // finishes. There is no non-destructive way back to "not stepping" (`vm.stop()` quits
            // the runtime), so the loop is left running afterwards.
            vm.start();
        }
        vm.stopAll();

        const usePushThread = typeof runtime._pushThread === 'function';
        const fallbackThreads = usePushThread ? null : startAllTestThreads(runtime, tests);

        for (let index = 0; index < tests.length; index++) {
            const test = tests[index];
            const state = createTestState(defaultTimeoutMs);
            const testStartedAt = now();
            let status = 'passed';
            let extraMessage = null;

            const thread = cancelled ?
                null :
                (usePushThread ? startTestThread(runtime, test) : fallbackThreads.get(test.blockId));

            if (cancelled) {
                status = 'timed_out';
                extraMessage = 'the test run was cancelled';
            } else if (thread) {
                testStates.set(thread, state);
                // eslint-disable-next-line no-await-in-loop
                const outcome = await waitForThread(
                    runtime,
                    thread,
                    () => state.timeoutMs,
                    isCancelled
                );
                testStates.delete(thread);

                if (outcome === 'timed_out' || outcome === 'cancelled') {
                    // A block that throws takes the whole step loop down with it, so the test
                    // stops being stepped and runs out of time. There is no way to attribute an
                    // uncaught page error to one test without blaming tests for errors that
                    // came from elsewhere, so "it did not finish" is the honest answer.
                    runtime._stopThread(thread);
                    status = 'timed_out';
                    extraMessage = outcome === 'cancelled' ?
                        'the test run was cancelled' :
                        `this test did not finish within ${Math.round(state.timeoutMs / 100) / 10} seconds`;
                } else if (state.failures.length) {
                    status = 'failed';
                }
            }

            const result = buildResult(test.name, state, status, now() - testStartedAt, extraMessage);
            results.push(result);
            if (typeof opts.onProgress === 'function') {
                opts.onProgress(index, tests.length, result);
            }
        }

        if (duplicates.length) {
            results.push({
                name: 'Duplicate test names',
                status: 'errored',
                message: `more than one test is called: ${duplicates.join(', ')}`,
                duration_ms: 0
            });
        }
        if (!usePushThread && tests.length) {
            results.push({
                name: 'Test isolation',
                status: 'errored',
                message: 'tests had to be run together instead of one at a time, so they may ' +
                    'have interfered with each other',
                duration_ms: 0
            });
        }

        vm.stopAll();

        return buildReport(results, startedAt, new Date());
    })();

    return {
        promise: promise,
        cancel: () => {
            cancelled = true;
        }
    };
};

/**
 * The ordered display names of the project's tests, for "Run tests (4)".
 * @param {object} runtime The VM runtime.
 * @returns {Array<string>} The names.
 */
const listTestNames = runtime => disambiguateNames(collectTests(runtime)).tests.map(test => test.name);

export {
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    TEST_HAT_OPCODE,
    UNNAMED_TEST,
    buildReport,
    clampTimeout,
    collectTests,
    disambiguateNames,
    listTestNames,
    runTests,
    summarize
};
