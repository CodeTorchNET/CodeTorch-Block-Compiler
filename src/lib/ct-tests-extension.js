import ArgumentType from 'scratch-vm/src/extension-support/argument-type';
import BlockType from 'scratch-vm/src/extension-support/block-type';
import Cast from 'scratch-vm/src/util/cast';

/**
 * Runtime event emitted for every message a test records, mirrored into the debugger console.
 * @type {string}
 */
const CT_TEST_LOG = 'CT_TEST_LOG';

/**
 * The smallest and largest per-test timeout, in seconds, that `allow this test () seconds` accepts.
 * @type {number}
 */
const MIN_TIMEOUT_SECONDS = 0.5;

/**
 * @type {number}
 */
const MAX_TIMEOUT_SECONDS = 60;

/**
 * State the runner keeps for each test thread it started. The blocks below look their thread up
 * here; a block that runs outside a test run finds nothing and only logs.
 * @type {Map<object, object>}
 */
const testStates = new Map();

/**
 * Create the state object the runner stores for one test thread.
 * @param {number} timeoutMs The per-test timeout this test starts with.
 * @returns {object} A fresh state object.
 */
const createTestState = timeoutMs => ({
    failures: [],
    explicitPass: false,
    timeoutMs: timeoutMs
});

/**
 * Look up the state of the test a block is running inside of.
 * @param {object} util The BlockUtility the block was called with.
 * @returns {?object} The state, or null when the block is not running inside a test.
 */
const stateForUtil = util => {
    if (!util || !util.thread) {
        return null;
    }
    return testStates.get(util.thread) || null;
};

class CtTests {
    /**
     * @param {Runtime} runtime The runtime this extension belongs to.
     */
    constructor (runtime) {
        this.runtime = runtime;
    }

    /**
     * @returns {object} The extension description shown in the palette.
     */
    getInfo () {
        return {
            id: 'ctTests',
            name: 'Tests',
            color1: '#5b6ee1',
            color2: '#4a5cc4',
            color3: '#3d4da6',
            blocks: [
                {
                    opcode: 'whenTestRuns',
                    blockType: BlockType.EVENT,
                    // Mandatory. Edge-activated hats are started again on every frame, which
                    // would run every test thirty times a second.
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true,
                    text: 'when test [NAME] runs',
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'my test'
                        }
                    }
                },
                {
                    opcode: 'assert',
                    blockType: BlockType.COMMAND,
                    text: 'assert [CONDITION] [MESSAGE]',
                    arguments: {
                        CONDITION: {
                            type: ArgumentType.BOOLEAN
                        },
                        MESSAGE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'expectEqual',
                    blockType: BlockType.COMMAND,
                    text: 'expect [A] to equal [B]',
                    arguments: {
                        A: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        B: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'fail',
                    blockType: BlockType.COMMAND,
                    text: 'fail [MESSAGE]',
                    arguments: {
                        MESSAGE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'failed'
                        }
                    }
                },
                {
                    opcode: 'pass',
                    blockType: BlockType.COMMAND,
                    text: 'pass'
                },
                {
                    opcode: 'note',
                    blockType: BlockType.COMMAND,
                    text: 'note [MESSAGE]',
                    arguments: {
                        MESSAGE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'hello'
                        }
                    }
                },
                {
                    opcode: 'setTimeout',
                    blockType: BlockType.COMMAND,
                    text: 'allow this test [SECONDS] seconds',
                    arguments: {
                        SECONDS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                }
            ]
        };
    }

    /**
     * Emit one line for the run log and the debugger console.
     * @param {string} text The line.
     * @param {string} type One of "log", "warn", "error".
     * @param {object} util The BlockUtility, used for the thread the line belongs to.
     * @returns {void}
     */
    _log (text, type, util) {
        this.runtime.emit(CT_TEST_LOG, {
            text: text,
            type: type,
            thread: util && util.thread
        });
    }

    /**
     * Record a failure against the running test, if there is one.
     * @param {string} text The failure message.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    _recordFailure (text, util) {
        const state = stateForUtil(util);
        if (state) {
            state.failures.push(text);
        }
        this._log(text, 'error', util);
    }

    /**
     * @param {object} args The block arguments.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    assert (args, util) {
        if (Cast.toBoolean(args.CONDITION)) {
            return;
        }
        const message = Cast.toString(args.MESSAGE).trim();
        this._recordFailure(message === '' ? 'assert failed' : message, util);
    }

    /**
     * @param {object} args The block arguments.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    expectEqual (args, util) {
        if (Cast.compare(args.A, args.B) === 0) {
            return;
        }
        this._recordFailure(`expected ${Cast.toString(args.B)}, got ${Cast.toString(args.A)}`, util);
    }

    /**
     * @param {object} args The block arguments.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    fail (args, util) {
        const message = Cast.toString(args.MESSAGE).trim();
        this._recordFailure(message === '' ? 'failed' : message, util);
    }

    /**
     * @param {object} args The block arguments.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    pass (args, util) {
        const state = stateForUtil(util);
        if (state) {
            state.explicitPass = true;
        }
        this._log('pass', 'log', util);
        // "pass" reads as "we are done, it worked", so it ends the script. It does not clear a
        // failure that was already recorded.
        if (util && typeof util.stopThisScript === 'function') {
            util.stopThisScript();
        }
    }

    /**
     * @param {object} args The block arguments.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    note (args, util) {
        this._log(Cast.toString(args.MESSAGE), 'log', util);
    }

    /**
     * @param {object} args The block arguments.
     * @param {object} util The BlockUtility.
     * @returns {void}
     */
    setTimeout (args, util) {
        const state = stateForUtil(util);
        if (!state) {
            return;
        }
        const seconds = Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, Cast.toNumber(args.SECONDS)));
        state.timeoutMs = Math.round(seconds * 1000);
    }
}

export default CtTests;
export {
    CT_TEST_LOG,
    MAX_TIMEOUT_SECONDS,
    MIN_TIMEOUT_SECONDS,
    createTestState,
    testStates
};
