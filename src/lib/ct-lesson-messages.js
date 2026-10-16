// Learning Path lesson protocol
// Inbound:  ct-lesson-load, ct-lesson-create, ct-lesson-save, ct-lesson-snapshot, ct-lesson-mark,
//           ct-lesson-run, ct-lesson-stop, ct-lesson-focus, ct-lesson-highlight, ct-lesson-set-title
// Outbound: ct-lesson-loaded, ct-lesson-created, ct-lesson-saved, ct-lesson-snapshot-result,
//           ct-lesson-event {event: ready|project-changed|green-flag|run-stop|saved|loaded|say}

import {TRUSTED_IFRAME_HOST} from './brand';
import {isTrustedEmbedMessage} from './ct-embed-view';

const LESSON_MESSAGE_PREFIX = 'ct-lesson-';
const LESSON_EVENT_TYPE = 'ct-lesson-event';

const MAX_SAYS = 50;
// The longest text a speech bubble shows, see scratch3_looks.js SAY_BUBBLE_LIMIT.
const MAX_SAY_LENGTH = 330;
const MAX_TITLE_LENGTH = 100;
const PROJECT_CHANGED_THROTTLE_MS = 500;
const SAY_THROTTLE_MS = 250;

/**
 * Maps the category names lesson content may use to the ids of the toolbox categories.
 * Names are matched without case, dashes or underscores, so "my-blocks" is "myblocks".
 * Anything not listed here is passed through unchanged, which is how extension categories
 * such as "pen" or "music" are addressed.
 */
const CATEGORY_ALIASES = {
    motion: 'motion',
    looks: 'looks',
    sound: 'sound',
    sounds: 'sound',
    event: 'events',
    events: 'events',
    control: 'control',
    sensing: 'sensing',
    operator: 'operators',
    operators: 'operators',
    variable: 'variables',
    variables: 'variables',
    data: 'variables',
    list: 'variables',
    lists: 'variables',
    myblocks: 'myBlocks',
    procedures: 'myBlocks',
    custom: 'myBlocks'
};

/**
 * Maps the prefix of a core block opcode to the toolbox category it lives in. Extension
 * opcodes use their extension id as prefix, which is also their category id.
 */
const OPCODE_PREFIX_CATEGORIES = {
    motion: 'motion',
    looks: 'looks',
    sound: 'sound',
    event: 'events',
    control: 'control',
    sensing: 'sensing',
    operator: 'operators',
    data: 'variables',
    procedures: 'myBlocks',
    argument: 'myBlocks'
};

/**
 * Whether a message may drive the lesson bridge: it has to come from the page that embeds
 * the editor, and that page has to be the trusted host when one is configured. These are
 * the same rules as for the embed view messages.
 * @param {MessageEvent} event The message
 * @param {string} [trustedHost] Origin that embeds the editor, usually TRUSTED_IFRAME_HOST
 * @returns {boolean} True if the message may be acted on
 */
const isTrustedLessonMessage = (event, trustedHost = TRUSTED_IFRAME_HOST) =>
    isTrustedEmbedMessage(event, trustedHost);

/**
 * @param {*} value Anything
 * @returns {string|number|null} The value when it can identify a request, otherwise null
 */
const readRequestId = value => {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' && isFinite(value)) {
        return value;
    }
    return null;
};

/**
 * @param {*} value Anything
 * @returns {string|null} A trimmed, length limited title, or null when there is none
 */
const readTitle = value => {
    if (typeof value !== 'string') {
        return null;
    }
    const title = value.trim().substring(0, MAX_TITLE_LENGTH);
    return title.length > 0 ? title : null;
};

/**
 * Accepts an ArrayBuffer, or any view of one, and returns an ArrayBuffer holding exactly
 * those bytes. Objects from other realms are recognised too.
 * @param {*} value Anything
 * @returns {ArrayBuffer|null} The bytes, or null when the value is not binary data
 */
const readArrayBuffer = value => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
        return value.byteLength > 0 ? value : null;
    }
    if (ArrayBuffer.isView(value) && value.byteLength > 0) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    return null;
};

/**
 * @param {*} value A category name sent by the lesson
 * @returns {string|null} The toolbox category id, or null when the value is not usable
 */
const normalizeCategoryId = value => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
        return null;
    }
    const key = trimmed.toLowerCase().replace(/[-_]/g, '');
    const alias = Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, key) ? CATEGORY_ALIASES[key] : null;
    return alias || trimmed;
};

/**
 * @param {string} opcode A block opcode, like "motion_movesteps" or "pen_clear"
 * @returns {string|null} The toolbox category that offers the block
 */
const categoryForOpcode = opcode => {
    if (typeof opcode !== 'string') {
        return null;
    }
    const separator = opcode.indexOf('_');
    if (separator <= 0) {
        return null;
    }
    const prefix = opcode.substring(0, separator);
    return OPCODE_PREFIX_CATEGORIES[prefix] || prefix;
};

/**
 * @param {*} value Anything
 * @returns {string|null} The opcode, when it looks like one
 */
const readOpcode = value => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return /^[A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(trimmed) ? trimmed : null;
};

/**
 * Turn the data of a message into a lesson command.
 * @param {*} data A message's data
 * @returns {?object} A command with a `type` of load, create, save, snapshot, mark, run, stop,
 * focus, highlight or setTitle, or null when the message is not a lesson command
 */
const parseLessonMessage = data => {
    if (!data || typeof data !== 'object' || typeof data.type !== 'string' ||
        data.type.indexOf(LESSON_MESSAGE_PREFIX) !== 0) {
        return null;
    }
    const requestId = readRequestId(data.requestId);
    switch (data.type) {
    case 'ct-lesson-load':
        return {
            type: 'load',
            requestId: requestId,
            sb3: readArrayBuffer(data.sb3),
            title: readTitle(data.title)
        };
    case 'ct-lesson-create':
        return {type: 'create', requestId: requestId};
    case 'ct-lesson-save':
        return {type: 'save', requestId: requestId};
    case 'ct-lesson-snapshot':
        return {type: 'snapshot', requestId: requestId};
    case 'ct-lesson-mark':
        return {type: 'mark'};
    case 'ct-lesson-run':
        return {type: 'run'};
    case 'ct-lesson-stop':
        return {type: 'stop'};
    case 'ct-lesson-focus': {
        const category = normalizeCategoryId(data.category);
        return category === null ? null : {type: 'focus', category: category};
    }
    case 'ct-lesson-highlight': {
        const opcode = readOpcode(data.opcode);
        return opcode === null ? null : {type: 'highlight', opcode: opcode};
    }
    case 'ct-lesson-set-title': {
        const title = readTitle(data.title);
        return title === null ? null : {type: 'setTitle', title: title};
    }
    default:
        return null;
    }
};

/**
 * @returns {{flagClicks: number, lastRunEndedAt: ?number, says: Array<object>}} Fresh lesson counters
 */
const createLessonState = () => ({
    flagClicks: 0,
    lastRunEndedAt: null,
    says: []
});

/**
 * Reset the counters that belong to a single lesson step.
 * @param {object} lessonState State from createLessonState()
 * @returns {object} The same object
 */
const markLessonStep = lessonState => {
    lessonState.flagClicks = 0;
    lessonState.says = [];
    return lessonState;
};

/**
 * Remember a say or think bubble, keeping only the most recent ones.
 * @param {object} lessonState State from createLessonState()
 * @param {object} say {target, type, text, at}
 * @returns {object} The same state
 */
const recordSay = (lessonState, say) => {
    lessonState.says.push(say);
    if (lessonState.says.length > MAX_SAYS) {
        lessonState.says.splice(0, lessonState.says.length - MAX_SAYS);
    }
    return lessonState;
};

/**
 * Turn the arguments of a runtime SAY event into a say record.
 * @param {string} targetName Name of the sprite that speaks
 * @param {string} type 'say' or 'think'
 * @param {*} text What the bubble shows; '' (or nothing) clears the bubble
 * @param {number} at Time of the event
 * @returns {?object} {target, type, text, at}, or null for a bubble that is being cleared
 */
const makeSay = (targetName, type, text, at) => {
    if (text === null || typeof text === 'undefined') {
        return null;
    }
    const value = typeof text === 'string' ? text : String(text);
    if (value === '') {
        return null;
    }
    return {
        target: targetName,
        type: type === 'think' ? 'think' : 'say',
        text: value.substring(0, MAX_SAY_LENGTH),
        at: at
    };
};

/**
 * @param {object} target A runtime target
 * @returns {string} The name of the sprite or stage
 */
const getTargetName = target => {
    if (!target) {
        return '';
    }
    if (typeof target.getName === 'function') {
        return target.getName();
    }
    if (target.sprite && typeof target.sprite.name === 'string') {
        return target.sprite.name;
    }
    return '';
};

/**
 * @param {*} value A variable's value
 * @returns {*} The value, with lists copied so the snapshot does not alias runtime state
 */
const copyValue = value => (Array.isArray(value) ? value.slice() : value);

/**
 * @param {object} target A runtime target
 * @returns {{variables: object, lists: object}} Variable and list values by name
 */
const readTargetVariables = target => {
    const variables = {};
    const lists = {};
    const all = target.variables || {};
    Object.keys(all).forEach(id => {
        const variable = all[id];
        if (!variable || typeof variable.name !== 'string') {
            return;
        }
        if (variable.type === 'list') {
            lists[variable.name] = Array.isArray(variable.value) ? variable.value.slice() : [];
        } else if (variable.type === '' || typeof variable.type === 'undefined') {
            variables[variable.name] = copyValue(variable.value);
        }
    });
    return {variables, lists};
};

/**
 * @param {object} target A runtime target
 * @returns {object} The runtime view of one sprite or the stage
 */
const describeTarget = target => {
    const costumes = typeof target.getCostumes === 'function' ? target.getCostumes() :
        ((target.sprite && target.sprite.costumes) || []);
    const sounds = typeof target.getSounds === 'function' ? target.getSounds() :
        ((target.sprite && target.sprite.sounds) || []);
    const {variables, lists} = readTargetVariables(target);
    return {
        name: getTargetName(target),
        isStage: !!target.isStage,
        x: target.x,
        y: target.y,
        direction: target.direction,
        size: target.size,
        visible: target.visible,
        currentCostume: target.currentCostume,
        costumeCount: costumes.length,
        soundCount: sounds.length,
        variables: variables,
        lists: lists
    };
};

/**
 * @param {object} vm The virtual machine
 * @returns {Array<string>} Ids of the extensions the project has loaded
 */
const getLoadedExtensionIds = vm => {
    const manager = vm && vm.extensionManager;
    if (!manager) {
        return [];
    }
    const loaded = manager._loadedExtensions;
    if (loaded && typeof loaded.keys === 'function') {
        return Array.from(loaded.keys());
    }
    return [];
};

/**
 * @param {object} runtime The runtime
 * @returns {boolean} True when any script other than a monitor is running
 */
const getIsRunning = runtime => {
    if (!runtime) {
        return false;
    }
    if (typeof runtime._nonMonitorThreadCount === 'number') {
        return runtime._nonMonitorThreadCount > 0;
    }
    return Array.isArray(runtime.threads) && runtime.threads.some(thread => !thread.updateMonitor);
};

/**
 * Describe the project and what it is doing, for the lesson's checks.
 * @param {object} vm The virtual machine
 * @param {object} lessonState State from createLessonState()
 * @returns {object} The snapshot, see docs/LESSON_MODE.md
 */
const buildSnapshot = (vm, lessonState) => {
    const state = lessonState || createLessonState();
    const runtime = vm.runtime;
    const targets = ((runtime && runtime.targets) || [])
        .filter(target => target.isOriginal)
        .map(describeTarget);
    return {
        project: JSON.parse(vm.toJSON()),
        runtime: {
            isRunning: getIsRunning(runtime),
            flagClicks: state.flagClicks,
            lastRunEndedAt: state.lastRunEndedAt,
            extensions: getLoadedExtensionIds(vm),
            targets: targets,
            says: state.says.map(say => Object.assign({}, say))
        }
    };
};

/**
 * Calls `fn` at most once per `intervalMs`.
 * @param {function} fn The function to throttle
 * @param {number} intervalMs Minimum time between two calls
 * @param {object} [clock] Replacements for Date.now, setTimeout and clearTimeout
 * @returns {{call: function, cancel: function}} The throttled function and a way to drop a pending call
 */
const createThrottle = (fn, intervalMs, clock) => {
    const now = (clock && clock.now) || Date.now;
    const schedule = (clock && clock.setTimeout) || setTimeout;
    const unschedule = (clock && clock.clearTimeout) || clearTimeout;
    let lastCallAt = -Infinity;
    let timer = null;
    let pendingArgs = null;

    const flush = () => {
        timer = null;
        lastCallAt = now();
        const args = pendingArgs;
        pendingArgs = null;
        fn(...args);
    };

    const call = (...args) => {
        const wait = intervalMs - (now() - lastCallAt);
        if (wait <= 0 && timer === null) {
            lastCallAt = now();
            fn(...args);
            return;
        }
        pendingArgs = args;
        if (timer === null) {
            timer = schedule(flush, Math.max(wait, 0));
        }
    };

    const cancel = () => {
        if (timer !== null) {
            unschedule(timer);
            timer = null;
        }
        pendingArgs = null;
    };

    return {call, cancel};
};

/**
 * @param {string} event Name of the event
 * @param {object} [details] Extra fields
 * @returns {object} A ct-lesson-event message
 */
const makeLessonEvent = (event, details) => Object.assign({type: LESSON_EVENT_TYPE, event: event}, details);

const saveResultListeners = [];

/**
 * @param {function} listener Called with {kind: 'create'|'update', ok, projectId?, error?}
 * @returns {function} Call to stop listening
 */
const onLessonSaveResult = listener => {
    saveResultListeners.push(listener);
    return () => {
        const index = saveResultListeners.indexOf(listener);
        if (index !== -1) {
            saveResultListeners.splice(index, 1);
        }
    };
};

/**
 * Report the outcome of a project save. Does nothing unless a lesson bridge is listening.
 * @param {object} result {kind: 'create'|'update', ok, projectId?, error?}
 * @returns {void}
 */
const reportLessonSaveResult = result => {
    saveResultListeners.slice().forEach(listener => {
        try {
            listener(result);
        } catch (e) {
            // A failing listener must never break saving.
        }
    });
};

/**
 * @param {*} error Anything that was thrown or rejected
 * @returns {string} A short description
 */
const describeError = error => {
    if (error === null || typeof error === 'undefined') {
        return 'unknown';
    }
    if (typeof error === 'object' && typeof error.message === 'string') {
        return error.message;
    }
    return String(error);
};

/**
 * Listen for lesson commands from the embedding page, and tell it what the project does.
 *
 * @param {object} options Options
 * @param {object} options.vm The virtual machine
 * @param {object} options.window The window to listen on
 * @param {function} options.postMessageToParent Sends a message to the embedding page
 * @param {object} [options.commands] Handlers keyed by command type, each called with the command
 * @param {object} [options.lessonState] State from createLessonState(), for sharing with the caller
 * @param {function} [options.isTrusted] Trust check for events, defaults to isTrustedLessonMessage
 * @param {object} [options.clock] Replacements for Date.now, setTimeout and clearTimeout, and
 * `defer` for running a function once the current event has been handled (a microtask by default)
 * @returns {function} Call to stop listening
 */
const installLessonBridge = options => {
    const {vm, postMessageToParent} = options;
    const win = options.window;
    const commands = options.commands || {};
    const lessonState = options.lessonState || createLessonState();
    const isTrusted = options.isTrusted || isTrustedLessonMessage;
    const clock = options.clock || {};
    const now = clock.now || Date.now;
    const defer = clock.defer || (fn => Promise.resolve().then(fn));
    const runtime = vm.runtime;
    let installed = true;

    const post = message => {
        try {
            postMessageToParent(message);
        } catch (e) {
            // The parent may be gone; there is nobody left to tell.
        }
    };

    const projectChanged = createThrottle(() => {
        post(makeLessonEvent('project-changed'));
    }, PROJECT_CHANGED_THROTTLE_MS, clock);

    const sayEvent = createThrottle(say => {
        // `type` is taken by the message type, so the bubble kind travels as `kind`.
        post(makeLessonEvent('say', {target: say.target, kind: say.type, text: say.text}));
    }, SAY_THROTTLE_MS, clock);

    const replySnapshot = command => {
        try {
            post({
                type: 'ct-lesson-snapshot-result',
                requestId: command.requestId,
                snapshot: buildSnapshot(vm, lessonState)
            });
        } catch (e) {
            post({
                type: 'ct-lesson-snapshot-result',
                requestId: command.requestId,
                snapshot: null,
                error: describeError(e)
            });
        }
    };

    const handleCommand = command => {
        switch (command.type) {
        case 'snapshot':
            replySnapshot(command);
            break;
        case 'mark':
            markLessonStep(lessonState);
            break;
        case 'run':
            vm.greenFlag();
            break;
        case 'stop':
            vm.stopAll();
            break;
        default:
            if (typeof commands[command.type] === 'function') {
                commands[command.type](command);
            }
            break;
        }
    };

    const handleMessage = event => {
        // Check the sender first, so a frame that may not drive the lesson can not make the
        // parser copy the bytes it sends.
        if (!isTrusted(event)) {
            return;
        }
        const command = parseLessonMessage(event.data);
        if (command === null) {
            return;
        }
        handleCommand(command);
    };

    const handleProjectStart = () => {
        lessonState.flagClicks++;
        post(makeLessonEvent('green-flag', {flagClicks: lessonState.flagClicks}));
    };

    const handleRunStop = () => {
        lessonState.lastRunEndedAt = now();
        post(makeLessonEvent('run-stop', {at: lessonState.lastRunEndedAt}));
    };

    const handleProjectChanged = () => {
        projectChanged.call();
    };

    const handleProjectLoaded = () => {
        post(makeLessonEvent('loaded'));
    };

    let lastSay = null;

    const handleSay = (target, type, text) => {
        const say = makeSay(getTargetName(target), type, text, now());
        if (say === null) {
            return;
        }
        const pending = {say: say, isAskPrompt: false};
        lastSay = pending;
        defer(() => {
            if (lastSay === pending) {
                lastSay = null;
            }
            if (!installed || pending.isAskPrompt) {
                return;
            }
            recordSay(lessonState, say);
            sayEvent.call(say);
        });
    };

    const handleQuestion = question => {
        if (question === '' && lastSay !== null) {
            lastSay.isAskPrompt = true;
            lastSay = null;
        }
    };

    win.addEventListener('message', handleMessage);
    vm.on('PROJECT_START', handleProjectStart);
    vm.on('PROJECT_RUN_STOP', handleRunStop);
    vm.on('PROJECT_CHANGED', handleProjectChanged);
    vm.on('PROJECT_LOADED', handleProjectLoaded);
    if (runtime && typeof runtime.on === 'function') {
        runtime.on('SAY', handleSay);
        runtime.on('QUESTION', handleQuestion);
    }

    return () => {
        installed = false;
        lastSay = null;
        win.removeEventListener('message', handleMessage);
        vm.removeListener('PROJECT_START', handleProjectStart);
        vm.removeListener('PROJECT_RUN_STOP', handleRunStop);
        vm.removeListener('PROJECT_CHANGED', handleProjectChanged);
        vm.removeListener('PROJECT_LOADED', handleProjectLoaded);
        if (runtime && typeof runtime.removeListener === 'function') {
            runtime.removeListener('SAY', handleSay);
            runtime.removeListener('QUESTION', handleQuestion);
        }
        projectChanged.cancel();
        sayEvent.cancel();
    };
};

export {
    LESSON_EVENT_TYPE,
    MAX_SAYS,
    MAX_SAY_LENGTH,
    PROJECT_CHANGED_THROTTLE_MS,
    SAY_THROTTLE_MS,
    buildSnapshot,
    categoryForOpcode,
    createLessonState,
    createThrottle,
    describeError,
    installLessonBridge,
    isTrustedLessonMessage,
    makeLessonEvent,
    makeSay,
    markLessonStep,
    normalizeCategoryId,
    onLessonSaveResult,
    parseLessonMessage,
    recordSay,
    reportLessonSaveResult
};
