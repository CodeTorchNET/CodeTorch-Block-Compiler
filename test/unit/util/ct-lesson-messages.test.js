import EventEmitter from 'events';
import {
    MAX_SAYS,
    MAX_SAY_LENGTH,
    PROJECT_CHANGED_THROTTLE_MS,
    buildSnapshot,
    categoryForOpcode,
    createLessonState,
    createThrottle,
    installLessonBridge,
    isTrustedLessonMessage,
    makeSay,
    markLessonStep,
    normalizeCategoryId,
    onLessonSaveResult,
    parseLessonMessage,
    recordSay,
    reportLessonSaveResult
} from '../../../src/lib/ct-lesson-messages';

const makeClock = () => {
    let time = 1000;
    let nextId = 1;
    const timers = new Map();
    return {
        now: () => time,
        setTimeout: (fn, ms) => {
            const id = nextId++;
            timers.set(id, {fn, at: time + ms});
            return id;
        },
        clearTimeout: id => {
            timers.delete(id);
        },
        advance: ms => {
            time += ms;
            Array.from(timers.entries())
                .filter(([, timer]) => timer.at <= time)
                .forEach(([id, timer]) => {
                    timers.delete(id);
                    timer.fn();
                });
        },
        pending: () => timers.size
    };
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const makeTarget = (name, options = {}) => ({
    isOriginal: options.isOriginal !== false,
    isStage: !!options.isStage,
    x: options.x || 0,
    y: options.y || 0,
    direction: 90,
    size: 100,
    visible: true,
    currentCostume: options.currentCostume || 0,
    variables: options.variables || {},
    blocks: {_blocks: options.blocks || {}},
    getName: () => name,
    getCostumes: () => options.costumes || [{name: 'a'}],
    getSounds: () => options.sounds || []
});

const makeVm = targets => {
    const vm = new EventEmitter();
    vm.runtime = new EventEmitter();
    vm.runtime.targets = targets;
    vm.runtime._nonMonitorThreadCount = 0;
    vm.extensionManager = {_loadedExtensions: new Map([['pen', 'svc1'], ['music', 'svc2']])};
    vm.toJSON = () => JSON.stringify({
        targets: targets.filter(t => t.isOriginal).map(t => ({name: t.getName(), blocks: t.blocks._blocks})),
        monitors: [],
        extensions: ['pen', 'music'],
        meta: {semver: '3.0.0'}
    });
    vm.greenFlag = jest.fn(() => vm.emit('PROJECT_START'));
    vm.stopAll = jest.fn();
    return vm;
};

const makeWindow = () => {
    const emitter = new EventEmitter();
    return {
        addEventListener: (type, fn) => emitter.on(type, fn),
        removeEventListener: (type, fn) => emitter.removeListener(type, fn),
        send: event => emitter.emit('message', event),
        listenerCount: () => emitter.listenerCount('message')
    };
};

describe('ct-lesson-messages', () => {
    describe('parseLessonMessage', () => {
        test('ignores anything that is not a lesson message', () => {
            expect(parseLessonMessage(null)).toBe(null);
            expect(parseLessonMessage('ct-lesson-run')).toBe(null);
            expect(parseLessonMessage({type: 'ct-run-tests'})).toBe(null);
            expect(parseLessonMessage({type: 'block-compiler-action', action: 'SET_EMBED_VIEW'})).toBe(null);
            expect(parseLessonMessage({type: 'ct-lesson-unknown'})).toBe(null);
        });

        test('reads load with its project bytes and title', () => {
            const sb3 = new Uint8Array([80, 75, 3, 4]).buffer;
            expect(parseLessonMessage({type: 'ct-lesson-load', requestId: 'r1', sb3, title: '  Torchy walks  '}))
                .toEqual({type: 'load', requestId: 'r1', sb3, title: 'Torchy walks'});
        });

        test('accepts a view of the bytes and copies exactly that range', () => {
            const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
            const command = parseLessonMessage({
                type: 'ct-lesson-load',
                requestId: 7,
                sb3: backing.subarray(2, 5)
            });
            expect(command.requestId).toBe(7);
            expect(Array.from(new Uint8Array(command.sb3))).toEqual([1, 2, 3]);
            expect(command.title).toBe(null);
        });

        test('a load without bytes still parses, so it can be answered with an error', () => {
            expect(parseLessonMessage({type: 'ct-lesson-load', requestId: 'r', sb3: 'nope'}).sb3).toBe(null);
            expect(parseLessonMessage({type: 'ct-lesson-load', requestId: 'r', sb3: new ArrayBuffer(0)}).sb3)
                .toBe(null);
        });

        test('reads the request based commands', () => {
            expect(parseLessonMessage({type: 'ct-lesson-create', requestId: 'a'}))
                .toEqual({type: 'create', requestId: 'a'});
            expect(parseLessonMessage({type: 'ct-lesson-save', requestId: 'b'}))
                .toEqual({type: 'save', requestId: 'b'});
            expect(parseLessonMessage({type: 'ct-lesson-snapshot', requestId: 'c'}))
                .toEqual({type: 'snapshot', requestId: 'c'});
            expect(parseLessonMessage({type: 'ct-lesson-snapshot', requestId: {}}))
                .toEqual({type: 'snapshot', requestId: null});
        });

        test('reads the simple commands', () => {
            expect(parseLessonMessage({type: 'ct-lesson-mark'})).toEqual({type: 'mark'});
            expect(parseLessonMessage({type: 'ct-lesson-run'})).toEqual({type: 'run'});
            expect(parseLessonMessage({type: 'ct-lesson-stop'})).toEqual({type: 'stop'});
        });

        test('reads focus and maps category names to toolbox ids', () => {
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: 'motion'}))
                .toEqual({type: 'focus', category: 'motion'});
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: 'Events'}).category).toBe('events');
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: 'myblocks'}).category).toBe('myBlocks');
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: 'my-blocks'}).category).toBe('myBlocks');
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: 'constructor'}).category).toBe('constructor');
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: 'pen'}).category).toBe('pen');
            expect(parseLessonMessage({type: 'ct-lesson-focus', category: '<svg>'})).toBe(null);
            expect(parseLessonMessage({type: 'ct-lesson-focus'})).toBe(null);
        });

        test('reads highlight and set-title', () => {
            expect(parseLessonMessage({type: 'ct-lesson-highlight', opcode: 'motion_movesteps'}))
                .toEqual({type: 'highlight', opcode: 'motion_movesteps'});
            expect(parseLessonMessage({type: 'ct-lesson-highlight', opcode: 'nope'})).toBe(null);
            expect(parseLessonMessage({type: 'ct-lesson-set-title', title: 'My game'}))
                .toEqual({type: 'setTitle', title: 'My game'});
            expect(parseLessonMessage({type: 'ct-lesson-set-title', title: '   '})).toBe(null);
            expect(parseLessonMessage({type: 'ct-lesson-set-title', title: 'x'.repeat(300)}).title)
                .toHaveLength(100);
        });
    });

    describe('categories', () => {
        test('normalizeCategoryId', () => {
            expect(normalizeCategoryId('operator')).toBe('operators');
            expect(normalizeCategoryId('data')).toBe('variables');
            expect(normalizeCategoryId('music')).toBe('music');
            expect(normalizeCategoryId(3)).toBe(null);
        });

        test('categoryForOpcode', () => {
            expect(categoryForOpcode('motion_movesteps')).toBe('motion');
            expect(categoryForOpcode('event_whenflagclicked')).toBe('events');
            expect(categoryForOpcode('operator_add')).toBe('operators');
            expect(categoryForOpcode('data_setvariableto')).toBe('variables');
            expect(categoryForOpcode('procedures_call')).toBe('myBlocks');
            expect(categoryForOpcode('pen_clear')).toBe('pen');
            expect(categoryForOpcode('nounderscore')).toBe(null);
        });
    });

    describe('isTrustedLessonMessage', () => {
        const parent = {};
        beforeEach(() => {
            global.window = {parent};
        });
        afterEach(() => {
            delete global.window;
        });

        test('accepts only the trusted host, from the parent window', () => {
            const trusted = 'https://codetorch.net';
            expect(isTrustedLessonMessage({source: parent, origin: 'https://codetorch.net'}, trusted)).toBe(true);
            expect(isTrustedLessonMessage({source: {}, origin: 'https://codetorch.net'}, trusted)).toBe(false);
            expect(isTrustedLessonMessage({source: parent, origin: 'https://codetorch.net.evil.example'}, trusted))
                .toBe(false);
            expect(isTrustedLessonMessage({source: parent, origin: 'null'}, trusted)).toBe(false);
            expect(isTrustedLessonMessage(null, trusted)).toBe(false);
        });

        test('a top-level page has no parent to listen to', () => {
            global.window.parent = global.window;
            expect(isTrustedLessonMessage({source: global.window, origin: 'https://codetorch.net'},
                'https://codetorch.net')).toBe(false);
        });
    });

    describe('lesson state', () => {
        test('keeps only the most recent says', () => {
            const state = createLessonState();
            for (let i = 0; i < MAX_SAYS + 5; i++) {
                recordSay(state, {target: 'Torchy', type: 'say', text: `${i}`, at: i});
            }
            expect(state.says).toHaveLength(MAX_SAYS);
            expect(state.says[0].text).toBe('5');
        });

        test('makeSay drops clears and cuts long text', () => {
            expect(makeSay('Torchy', 'say', '', 5)).toBeNull();
            expect(makeSay('Torchy', 'say', null, 5)).toBeNull();
            expect(makeSay('Torchy', 'think', 0, 5)).toEqual({target: 'Torchy', type: 'think', text: '0', at: 5});
            expect(makeSay('Torchy', 'other', 'hi', 5).type).toBe('say');
            expect(makeSay('Torchy', 'say', 'x'.repeat(MAX_SAY_LENGTH + 20), 5).text)
                .toBe('x'.repeat(MAX_SAY_LENGTH));
            expect(MAX_SAY_LENGTH).toBe(330);
        });

        test('mark resets the step counters only', () => {
            const state = {flagClicks: 3, lastRunEndedAt: 5, says: [{}]};
            markLessonStep(state);
            expect(state).toEqual({flagClicks: 0, lastRunEndedAt: 5, says: []});
        });
    });

    describe('buildSnapshot', () => {
        test('describes the project, its sprites and the lesson counters', () => {
            const stage = makeTarget('Stage', {
                isStage: true,
                variables: {
                    v1: {id: 'v1', name: 'score', type: '', value: 10},
                    l1: {id: 'l1', name: 'items', type: 'list', value: ['a', 'b']},
                    b1: {id: 'b1', name: 'message1', type: 'broadcast_msg', value: 'message1'}
                }
            });
            const torchy = makeTarget('Torchy', {
                x: 12,
                y: -4,
                currentCostume: 1,
                costumes: [{name: 'a'}, {name: 'b'}],
                sounds: [{name: 'pop'}],
                variables: {v2: {id: 'v2', name: 'speed', type: '', value: '3'}},
                blocks: {b: {opcode: 'motion_movesteps'}}
            });
            const clone = makeTarget('Torchy', {isOriginal: false, x: 99});
            const vm = makeVm([stage, torchy, clone]);
            vm.runtime._nonMonitorThreadCount = 2;
            const state = createLessonState();
            state.flagClicks = 2;
            state.lastRunEndedAt = 1234;
            recordSay(state, {target: 'Torchy', type: 'say', text: 'Hi!', at: 1200});

            const snapshot = buildSnapshot(vm, state);

            expect(snapshot.project.targets.map(t => t.name)).toEqual(['Stage', 'Torchy']);
            expect(snapshot.project.extensions).toEqual(['pen', 'music']);
            expect(snapshot.runtime.isRunning).toBe(true);
            expect(snapshot.runtime.flagClicks).toBe(2);
            expect(snapshot.runtime.lastRunEndedAt).toBe(1234);
            expect(snapshot.runtime.extensions).toEqual(['pen', 'music']);
            expect(snapshot.runtime.says).toEqual([{target: 'Torchy', type: 'say', text: 'Hi!', at: 1200}]);
            expect(snapshot.runtime.targets).toEqual([
                {
                    name: 'Stage',
                    isStage: true,
                    x: 0,
                    y: 0,
                    direction: 90,
                    size: 100,
                    visible: true,
                    currentCostume: 0,
                    costumeCount: 1,
                    soundCount: 0,
                    variables: {score: 10},
                    lists: {items: ['a', 'b']}
                },
                {
                    name: 'Torchy',
                    isStage: false,
                    x: 12,
                    y: -4,
                    direction: 90,
                    size: 100,
                    visible: true,
                    currentCostume: 1,
                    costumeCount: 2,
                    soundCount: 1,
                    variables: {speed: '3'},
                    lists: {}
                }
            ]);
        });

        test('the snapshot does not alias runtime lists or lesson state', () => {
            const list = ['a'];
            const vm = makeVm([makeTarget('Stage', {
                isStage: true,
                variables: {l1: {id: 'l1', name: 'items', type: 'list', value: list}}
            })]);
            const state = createLessonState();
            recordSay(state, {target: 'Stage', type: 'say', text: 'x', at: 1});
            const snapshot = buildSnapshot(vm, state);
            list.push('b');
            state.says[0].text = 'changed';
            expect(snapshot.runtime.targets[0].lists.items).toEqual(['a']);
            expect(snapshot.runtime.says[0].text).toBe('x');
            expect(snapshot.runtime.isRunning).toBe(false);
        });

        test('works without an extension manager', () => {
            const vm = makeVm([]);
            delete vm.extensionManager;
            expect(buildSnapshot(vm).runtime.extensions).toEqual([]);
        });
    });

    describe('createThrottle', () => {
        test('passes the first call, then at most one trailing call per interval', () => {
            const clock = makeClock();
            const fn = jest.fn();
            const throttled = createThrottle(fn, 500, clock);
            throttled.call(1);
            throttled.call(2);
            throttled.call(3);
            expect(fn.mock.calls).toEqual([[1]]);
            clock.advance(499);
            expect(fn).toHaveBeenCalledTimes(1);
            clock.advance(1);
            expect(fn.mock.calls).toEqual([[1], [3]]);
            clock.advance(1000);
            throttled.call(4);
            expect(fn.mock.calls).toEqual([[1], [3], [4]]);
        });

        test('cancel drops the pending call', () => {
            const clock = makeClock();
            const fn = jest.fn();
            const throttled = createThrottle(fn, 500, clock);
            throttled.call(1);
            throttled.call(2);
            throttled.cancel();
            clock.advance(1000);
            expect(fn.mock.calls).toEqual([[1]]);
        });
    });

    describe('installLessonBridge', () => {
        const parent = {name: 'parent'};
        let clock;
        let vm;
        let win;
        let posted;
        let commands;
        let uninstall;

        const send = data => win.send({source: parent, origin: 'http://localhost:3000', data});
        const events = name => posted.filter(m => m.type === 'ct-lesson-event' && m.event === name);

        beforeEach(() => {
            global.window = {parent};
            clock = makeClock();
            vm = makeVm([makeTarget('Stage', {isStage: true}), makeTarget('Torchy')]);
            win = makeWindow();
            posted = [];
            commands = {
                load: jest.fn(),
                create: jest.fn(),
                save: jest.fn(),
                focus: jest.fn(),
                highlight: jest.fn(),
                setTitle: jest.fn()
            };
            uninstall = installLessonBridge({
                vm,
                window: win,
                postMessageToParent: message => posted.push(message),
                commands,
                clock
            });
        });

        afterEach(() => {
            uninstall();
            delete global.window;
        });

        test('ignores messages that do not come from the parent window', () => {
            win.send({source: {}, origin: 'http://localhost:3000', data: {type: 'ct-lesson-run'}});
            expect(vm.greenFlag).not.toHaveBeenCalled();
            send({type: 'ct-lesson-run'});
            expect(vm.greenFlag).toHaveBeenCalledTimes(1);
        });

        test('checks the sender before it reads the message', () => {
            let reads = 0;
            const data = {
                get type () {
                    reads++;
                    return 'ct-lesson-load';
                },
                get sb3 () {
                    reads++;
                    return new Uint8Array(1024);
                }
            };
            win.send({source: {}, origin: 'http://localhost:3000', data});
            expect(reads).toBe(0);
            expect(commands.load).not.toHaveBeenCalled();
            win.send({source: parent, origin: 'http://localhost:3000', data});
            expect(reads).toBeGreaterThan(0);
            expect(commands.load).toHaveBeenCalledTimes(1);
        });

        test('run, stop and green flag counting', () => {
            send({type: 'ct-lesson-run'});
            vm.emit('PROJECT_START');
            expect(events('green-flag')).toEqual([
                {type: 'ct-lesson-event', event: 'green-flag', flagClicks: 1},
                {type: 'ct-lesson-event', event: 'green-flag', flagClicks: 2}
            ]);
            send({type: 'ct-lesson-stop'});
            expect(vm.stopAll).toHaveBeenCalledTimes(1);
            clock.advance(10);
            vm.emit('PROJECT_RUN_STOP');
            expect(events('run-stop')).toEqual([{type: 'ct-lesson-event', event: 'run-stop', at: clock.now()}]);
        });

        test('answers snapshot requests with the counters, and mark resets them', async () => {
            vm.emit('PROJECT_START');
            vm.runtime.emit('SAY', vm.runtime.targets[1], 'think', 'Hmm');
            await settle();
            vm.emit('PROJECT_RUN_STOP');
            send({type: 'ct-lesson-snapshot', requestId: 's1'});
            const reply = posted.find(m => m.type === 'ct-lesson-snapshot-result');
            expect(reply.requestId).toBe('s1');
            expect(reply.snapshot.runtime.flagClicks).toBe(1);
            expect(reply.snapshot.runtime.lastRunEndedAt).toBe(clock.now());
            expect(reply.snapshot.runtime.says)
                .toEqual([{target: 'Torchy', type: 'think', text: 'Hmm', at: clock.now()}]);

            send({type: 'ct-lesson-mark'});
            send({type: 'ct-lesson-snapshot', requestId: 's2'});
            const second = posted.filter(m => m.type === 'ct-lesson-snapshot-result')[1];
            expect(second.snapshot.runtime.flagClicks).toBe(0);
            expect(second.snapshot.runtime.says).toEqual([]);
        });

        test('a snapshot that can not be built is answered with an error', () => {
            vm.toJSON = () => {
                throw new Error('boom');
            };
            send({type: 'ct-lesson-snapshot', requestId: 's'});
            expect(posted).toContainEqual({
                type: 'ct-lesson-snapshot-result', requestId: 's', snapshot: null, error: 'boom'
            });
        });

        test('throttles project-changed to one per interval', () => {
            for (let i = 0; i < 10; i++) {
                vm.emit('PROJECT_CHANGED');
            }
            expect(events('project-changed')).toHaveLength(1);
            clock.advance(PROJECT_CHANGED_THROTTLE_MS);
            expect(events('project-changed')).toHaveLength(2);
            clock.advance(PROJECT_CHANGED_THROTTLE_MS * 4);
            expect(events('project-changed')).toHaveLength(2);
        });

        test('records every say but throttles say events', async () => {
            const torchy = vm.runtime.targets[1];
            vm.runtime.emit('SAY', torchy, 'say', 'one');
            vm.runtime.emit('SAY', torchy, 'say', 'two');
            vm.runtime.emit('SAY', torchy, 'say', 3);
            await settle();
            expect(events('say')).toEqual([
                {type: 'ct-lesson-event', event: 'say', target: 'Torchy', kind: 'say', text: 'one'}
            ]);
            clock.advance(1000);
            expect(events('say').map(e => e.text)).toEqual(['one', '3']);
            send({type: 'ct-lesson-snapshot', requestId: 'x'});
            const reply = posted.find(m => m.type === 'ct-lesson-snapshot-result');
            expect(reply.snapshot.runtime.says.map(s => s.text)).toEqual(['one', 'two', '3']);
        });

        test('a cleared bubble is never recorded nor the trailing say event', async () => {
            const torchy = vm.runtime.targets[1];
            vm.runtime.emit('SAY', torchy, 'say', 'one');
            vm.runtime.emit('SAY', torchy, 'say', 'two');
            vm.runtime.emit('SAY', torchy, 'say', '');
            await settle();
            clock.advance(1000);
            expect(events('say').map(e => e.text)).toEqual(['one', 'two']);
            send({type: 'ct-lesson-snapshot', requestId: 'x'});
            const reply = posted.find(m => m.type === 'ct-lesson-snapshot-result');
            expect(reply.snapshot.runtime.says.map(s => s.text)).toEqual(['one', 'two']);
        });

        test('the question of an ask block is not a say', async () => {
            const torchy = vm.runtime.targets[1];
            const stage = vm.runtime.targets[0];
            vm.runtime.emit('SAY', torchy, 'say', 'Hello');
            // What scratch3_sensing does for a visible sprite: the question goes into its bubble.
            vm.runtime.emit('SAY', torchy, 'say', 'What is your name?');
            vm.runtime.emit('QUESTION', '');
            // The stage (or a hidden sprite) asks without a bubble.
            vm.runtime.emit('QUESTION', 'Stage question?');
            await settle();
            // Answering clears the bubble.
            vm.runtime.emit('SAY', torchy, 'say', '');
            vm.runtime.emit('SAY', stage, 'think', 'x'.repeat(400));
            await settle();
            clock.advance(1000);
            expect(events('say').map(e => e.text)).toEqual(['Hello', 'x'.repeat(MAX_SAY_LENGTH)]);
            send({type: 'ct-lesson-snapshot', requestId: 'x'});
            const reply = posted.find(m => m.type === 'ct-lesson-snapshot-result');
            expect(reply.snapshot.runtime.says.map(s => s.text)).toEqual(['Hello', 'x'.repeat(MAX_SAY_LENGTH)]);
        });

        test('keeps the last 50 says', async () => {
            const torchy = vm.runtime.targets[1];
            for (let i = 0; i < MAX_SAYS + 10; i++) {
                vm.runtime.emit('SAY', torchy, 'say', `s${i}`);
            }
            await settle();
            send({type: 'ct-lesson-snapshot', requestId: 'x'});
            const says = posted.find(m => m.type === 'ct-lesson-snapshot-result').snapshot.runtime.says;
            expect(says).toHaveLength(MAX_SAYS);
            expect(says[0].text).toBe('s10');
        });

        test('announces loaded projects', () => {
            vm.emit('PROJECT_LOADED');
            expect(events('loaded')).toHaveLength(1);
        });

        test('delegates the stateful commands', () => {
            const sb3 = new Uint8Array([1]).buffer;
            send({type: 'ct-lesson-load', requestId: 'l', sb3, title: 'T'});
            send({type: 'ct-lesson-create', requestId: 'c'});
            send({type: 'ct-lesson-save', requestId: 's'});
            send({type: 'ct-lesson-focus', category: 'looks'});
            send({type: 'ct-lesson-highlight', opcode: 'looks_say'});
            send({type: 'ct-lesson-set-title', title: 'New'});
            expect(commands.load).toHaveBeenCalledWith({type: 'load', requestId: 'l', sb3, title: 'T'});
            expect(commands.create).toHaveBeenCalledWith({type: 'create', requestId: 'c'});
            expect(commands.save).toHaveBeenCalledWith({type: 'save', requestId: 's'});
            expect(commands.focus).toHaveBeenCalledWith({type: 'focus', category: 'looks'});
            expect(commands.highlight).toHaveBeenCalledWith({type: 'highlight', opcode: 'looks_say'});
            expect(commands.setTitle).toHaveBeenCalledWith({type: 'setTitle', title: 'New'});
        });

        test('uninstall removes every listener and pending event', () => {
            vm.emit('PROJECT_CHANGED');
            vm.emit('PROJECT_CHANGED');
            expect(clock.pending()).toBe(1);
            uninstall();
            expect(clock.pending()).toBe(0);
            expect(win.listenerCount()).toBe(0);
            expect(vm.listenerCount('PROJECT_START')).toBe(0);
            expect(vm.listenerCount('PROJECT_CHANGED')).toBe(0);
            expect(vm.runtime.listenerCount('SAY')).toBe(0);
            expect(vm.runtime.listenerCount('QUESTION')).toBe(0);
            const before = posted.length;
            vm.emit('PROJECT_START');
            send({type: 'ct-lesson-run'});
            expect(posted).toHaveLength(before);
            expect(vm.greenFlag).not.toHaveBeenCalled();
            uninstall = () => {};
        });

        test('a say that is still waiting is dropped on uninstall', async () => {
            vm.runtime.emit('SAY', vm.runtime.targets[1], 'say', 'late');
            uninstall();
            uninstall = () => {};
            await settle();
            expect(events('say')).toEqual([]);
        });
    });

    describe('save results', () => {
        test('reach listeners until they unsubscribe, and listener errors are contained', () => {
            const listener = jest.fn();
            const broken = jest.fn(() => {
                throw new Error('nope');
            });
            const stop = onLessonSaveResult(listener);
            const stopBroken = onLessonSaveResult(broken);
            reportLessonSaveResult({kind: 'update', ok: true, projectId: '5'});
            expect(listener).toHaveBeenCalledWith({kind: 'update', ok: true, projectId: '5'});
            stop();
            stopBroken();
            reportLessonSaveResult({kind: 'update', ok: true, projectId: '6'});
            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('reporting without listeners does nothing', () => {
            expect(() => reportLessonSaveResult({kind: 'create', ok: false, error: 403})).not.toThrow();
        });
    });
});
