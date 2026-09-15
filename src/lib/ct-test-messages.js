// REF:
// Inbound:  ct-list-tests, ct-run-tests, ct-cancel-tests
// Outbound: ct-tests-available, ct-test-progress, ct-test-results, ct-test-error

import {getParentTargetOrigin, postMessageToParent} from './ct-parent-message';
import {listTestNames, runTests} from './ct-test-runner';

/**
 * Whether a message that arrived from `origin` may drive the test runner.
 * @param {string} origin The event's origin.
 * @returns {boolean} True when the message is allowed.
 */
const isAllowedTestOrigin = origin => {
    const trusted = getParentTargetOrigin();
    if (trusted === '*') {
        return origin === window.location.origin;
    }
    return origin === trusted;
};

/**
 * Tell the embedding page which tests this project has.
 * @param {object} vm The virtual machine.
 * @returns {void}
 */
const postTestsAvailable = vm => {
    postMessageToParent({
        type: 'ct-tests-available',
        runner: 'blocks',
        tests: listTestNames(vm.runtime)
    });
};

/**
 * @param {?string} runId The run the error belongs to, if any.
 * @param {string} reason One of "busy", "no-project", "internal".
 * @param {string} [detail] Extra context.
 * @returns {void}
 */
const postTestError = (runId, reason, detail) => {
    const message = {
        type: 'ct-test-error',
        runId: typeof runId === 'string' ? runId : null,
        reason: reason
    };
    if (detail) {
        message.detail = detail;
    }
    postMessageToParent(message);
};

/**
 * Listen for test messages from the embedding page, and answer them.
 *
 * @param {object} vm The virtual machine.
 * @returns {function} Call to stop listening.
 */
const installTestMessageListener = vm => {
    let activeRun = null;
    let activeRunId = null;

    const startRun = data => {
        const runId = typeof data.runId === 'string' ? data.runId : null;
        if (activeRun) {
            postTestError(runId, 'busy', 'a test run is already in progress');
            return;
        }
        if (!vm.runtime || !vm.runtime.targets || vm.runtime.targets.length === 0) {
            postTestError(runId, 'no-project', 'no project is loaded');
            return;
        }
        activeRunId = runId;
        activeRun = runTests(vm, {
            timeoutMs: data.timeoutMs,
            onProgress: (index, total, test) => {
                postMessageToParent({
                    type: 'ct-test-progress',
                    runId: runId,
                    index: index,
                    total: total,
                    test: test
                });
            }
        });
        activeRun.promise.then(report => {
            postMessageToParent({
                type: 'ct-test-results',
                runId: runId,
                report: report
            });
        }, error => {
            postTestError(runId, 'internal', String((error && error.message) || error));
        }).then(() => {
            activeRun = null;
            activeRunId = null;
        });
    };

    const handleTestMessage = event => {
        const data = event.data;
        if (!data || typeof data.type !== 'string' || data.type.indexOf('ct-') !== 0) {
            return;
        }
        if (!isAllowedTestOrigin(event.origin)) {
            return;
        }
        switch (data.type) {
        case 'ct-list-tests':
            postTestsAvailable(vm);
            break;
        case 'ct-run-tests':
            startRun(data);
            break;
        case 'ct-cancel-tests':
            if (activeRun && (typeof data.runId !== 'string' || data.runId === activeRunId)) {
                activeRun.cancel();
            }
            break;
        default:
            break;
        }
    };

    const handleProjectLoaded = () => {
        postTestsAvailable(vm);
    };

    window.addEventListener('message', handleTestMessage);
    if (vm.runtime && typeof vm.runtime.on === 'function') {
        vm.runtime.on('PROJECT_LOADED', handleProjectLoaded);
    }

    return () => {
        window.removeEventListener('message', handleTestMessage);
        if (vm.runtime && typeof vm.runtime.removeListener === 'function') {
            vm.runtime.removeListener('PROJECT_LOADED', handleProjectLoaded);
        }
        if (activeRun) {
            activeRun.cancel();
        }
    };
};

export {
    installTestMessageListener,
    isAllowedTestOrigin,
    postTestsAvailable
};
