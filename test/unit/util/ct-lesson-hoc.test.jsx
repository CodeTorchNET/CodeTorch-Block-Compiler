import {combineReducers, createStore} from 'redux';

import projectStateReducer, {LoadingState} from '../../../src/reducers/project-state';
import projectTitleReducer, {setProjectTitle} from '../../../src/reducers/project-title';
import editorTabReducer from '../../../src/reducers/editor-tab';
import stageSizeReducer from '../../../src/reducers/stage-size';
import {STAGE_SIZE_MODES} from '../../../src/lib/layout-constants';
import {onLessonSaveResult, reportLessonSaveResult} from '../../../src/lib/ct-lesson-messages';
import {postMessageToParent} from '../../../src/lib/ct-parent-message';
import CTLessonHOC from '../../../src/lib/ct-lesson-hoc.jsx';
import storage from '../../../src/lib/storage';
import {TRUSTED_IFRAME_HOST} from '../../../src/lib/brand';

jest.mock('../../../src/lib/storage', () => ({
    __esModule: true,
    default: {getProjectToken: jest.fn(() => Promise.resolve('token'))}
}));
jest.mock('scratch-storage', () => class {}, {virtual: true});
jest.mock('../../../src/lib/default-project', () => ({__esModule: true, default: () => []}));
jest.mock('../../../src/lib/ct-parent-message', () => ({
    postMessageToParent: jest.fn(),
    getParentTargetOrigin: () => '*'
}));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

const makeStore = (loadingState, vm) => {
    const reducer = combineReducers({
        scratchGui: combineReducers({
            projectState: projectStateReducer,
            projectTitle: projectTitleReducer,
            editorTab: editorTabReducer,
            stageSize: stageSizeReducer,
            vm: (state = vm) => state
        })
    });
    return createStore(reducer, {
        scratchGui: {
            projectState: {
                error: null,
                projectData: null,
                projectId: loadingState === LoadingState.SHOWING_WITH_ID ? '42' : '0',
                isScratchProject: false,
                loadingState: loadingState
            },
            projectTitle: 'Project',
            editorTab: {activeTabIndex: 0},
            stageSize: {stageSize: STAGE_SIZE_MODES.large},
            vm: vm
        }
    });
};

const makeVm = () => ({
    quit: jest.fn(),
    loadProject: jest.fn(() => Promise.resolve()),
    renderer: {draw: jest.fn()}
});

const makeLesson = store => {
    const LessonComponent = CTLessonHOC(() => null);
    const lesson = new LessonComponent({lessonMode: true});
    lesson.context = {store};
    return lesson;
};

const replies = type => postMessageToParent.mock.calls.map(call => call[0]).filter(m => m.type === type);

describe('CTLessonHOC commands', () => {
    beforeEach(() => {
        postMessageToParent.mockClear();
        storage.getProjectToken.mockReset();
        storage.getProjectToken.mockImplementation(() => Promise.resolve('token'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('load puts the starter into a new, unsaved project with the lesson title', async () => {
        const vm = makeVm();
        const store = makeStore(LoadingState.SHOWING_WITH_ID, vm);
        const lesson = makeLesson(store);
        const sb3 = new ArrayBuffer(4);
        lesson.handleLoad({type: 'load', requestId: 'l1', sb3, title: 'Torchy walks'});
        expect(store.getState().scratchGui.projectState.loadingState).toBe(LoadingState.LOADING_VM_FILE_UPLOAD);
        await flush();
        expect(vm.quit).toHaveBeenCalled();
        expect(vm.loadProject).toHaveBeenCalledWith(sb3);
        const state = store.getState().scratchGui;
        expect(state.projectState.loadingState).toBe(LoadingState.SHOWING_WITHOUT_ID);
        expect(state.projectState.projectId).toBe('0');
        expect(state.projectTitle).toBe('Torchy walks');
        expect(replies('ct-lesson-loaded')).toEqual([{type: 'ct-lesson-loaded', requestId: 'l1', ok: true}]);
    });

    test('a load that fails is reported and the editor keeps showing a project', async () => {
        const vm = makeVm();
        vm.loadProject = jest.fn(() => Promise.reject(new Error('bad zip')));
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, vm);
        makeLesson(store).handleLoad({type: 'load', requestId: 'l2', sb3: new ArrayBuffer(4), title: null});
        await flush();
        expect(store.getState().scratchGui.projectState.loadingState).toBe(LoadingState.SHOWING_WITHOUT_ID);
        expect(replies('ct-lesson-loaded')).toEqual([
            {type: 'ct-lesson-loaded', requestId: 'l2', ok: false, error: 'bad zip'}
        ]);
    });

    test('load without bytes, or while busy, is refused', () => {
        const store = makeStore(LoadingState.FETCHING_WITH_ID, makeVm());
        const lesson = makeLesson(store);
        lesson.handleLoad({type: 'load', requestId: 'a', sb3: null, title: null});
        lesson.handleLoad({type: 'load', requestId: 'b', sb3: new ArrayBuffer(1), title: null});
        expect(replies('ct-lesson-loaded')).toEqual([
            {type: 'ct-lesson-loaded', requestId: 'a', ok: false, error: 'invalid-sb3'},
            {type: 'ct-lesson-loaded', requestId: 'b', ok: false, error: 'busy'}
        ]);
    });

    test('create starts the saver\'s create flow and answers with the new id', async () => {
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        const lesson = makeLesson(store);
        lesson.unsubscribeSaveResults = onLessonSaveResult(lesson.handleSaveResult);
        lesson.handleCreate({type: 'create', requestId: 'c1'});
        await flush();
        expect(store.getState().scratchGui.projectState.loadingState).toBe(LoadingState.CREATING_NEW);
        reportLessonSaveResult({kind: 'create', ok: true, projectId: '777'});
        await flush();
        expect(replies('ct-lesson-created')).toEqual([
            {type: 'ct-lesson-created', requestId: 'c1', ok: true, projectId: '777'}
        ]);
        expect(postMessageToParent).toHaveBeenCalledWith({type: 'ct-lesson-event', event: 'saved', projectId: '777'});
        lesson.componentWillUnmount();
    });

    test('a failed create is reported and the lesson title is restored', async () => {
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        store.dispatch(setProjectTitle('Lesson 1'));
        const lesson = makeLesson(store);
        lesson.unsubscribeSaveResults = onLessonSaveResult(lesson.handleSaveResult);
        lesson.handleCreate({type: 'create', requestId: 'c2'});
        await flush();
        store.dispatch(setProjectTitle('Project'));
        reportLessonSaveResult({kind: 'create', ok: false, error: 403});
        await flush();
        expect(replies('ct-lesson-created')).toEqual([
            {type: 'ct-lesson-created', requestId: 'c2', ok: false, error: '403'}
        ]);
        expect(store.getState().scratchGui.projectTitle).toBe('Lesson 1');
        lesson.componentWillUnmount();
    });

    test('create on a project that already has an id is refused', () => {
        const store = makeStore(LoadingState.SHOWING_WITH_ID, makeVm());
        makeLesson(store).handleCreate({type: 'create', requestId: 'c3'});
        expect(replies('ct-lesson-created')).toEqual([
            {type: 'ct-lesson-created', requestId: 'c3', ok: false, error: 'already-saved', projectId: '42'}
        ]);
    });

    test('save starts a manual save and answers with its result', () => {
        const store = makeStore(LoadingState.SHOWING_WITH_ID, makeVm());
        const lesson = makeLesson(store);
        lesson.handleSave({type: 'save', requestId: 's1'});
        expect(store.getState().scratchGui.projectState.loadingState).toBe(LoadingState.MANUAL_UPDATING);
        lesson.handleSaveResult({kind: 'update', ok: true, projectId: '42'});
        expect(replies('ct-lesson-saved')).toEqual([{type: 'ct-lesson-saved', requestId: 's1', ok: true}]);
        expect(lesson.pendingSaves).toHaveLength(0);
        lesson.componentWillUnmount();
    });

    test('save before the project was created is refused', () => {
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        makeLesson(store).handleSave({type: 'save', requestId: 's2'});
        expect(replies('ct-lesson-saved')).toEqual([
            {type: 'ct-lesson-saved', requestId: 's2', ok: false, error: 'not-created'}
        ]);
    });

    test('ready is announced once a project is showing', () => {
        const store = makeStore(LoadingState.FETCHING_NEW_DEFAULT, makeVm());
        const lesson = makeLesson(store);
        lesson.handleStoreChange();
        expect(replies('ct-lesson-event')).toEqual([]);
        store.dispatch({type: 'scratch-gui/project-state/DONE_FETCHING_DEFAULT', projectData: '{}'});
        store.dispatch({type: 'scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID'});
        lesson.handleStoreChange();
        lesson.handleStoreChange();
        expect(replies('ct-lesson-event')).toEqual([{type: 'ct-lesson-event', event: 'ready'}]);
    });
    test('load is refused while a create is running', async () => {
        const vm = makeVm();
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, vm);
        const lesson = makeLesson(store);
        lesson.unsubscribeSaveResults = onLessonSaveResult(lesson.handleSaveResult);
        lesson.handleCreate({type: 'create', requestId: 'c'});
        lesson.handleLoad({type: 'load', requestId: 'l1', sb3: new ArrayBuffer(4), title: null});
        await flush();
        lesson.handleLoad({type: 'load', requestId: 'l2', sb3: new ArrayBuffer(4), title: null});
        expect(replies('ct-lesson-loaded')).toEqual([
            {type: 'ct-lesson-loaded', requestId: 'l1', ok: false, error: 'busy'},
            {type: 'ct-lesson-loaded', requestId: 'l2', ok: false, error: 'busy'}
        ]);
        expect(vm.loadProject).not.toHaveBeenCalled();
        reportLessonSaveResult({kind: 'create', ok: true, projectId: '1'});
        await flush();
        lesson.componentWillUnmount();
    });

    test('a second load is refused while the first one runs', async () => {
        const vm = makeVm();
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, vm);
        const lesson = makeLesson(store);
        lesson.handleLoad({type: 'load', requestId: 'l1', sb3: new ArrayBuffer(4), title: null});
        lesson.handleLoad({type: 'load', requestId: 'l2', sb3: new ArrayBuffer(4), title: null});
        await flush();
        expect(replies('ct-lesson-loaded')).toEqual([
            {type: 'ct-lesson-loaded', requestId: 'l2', ok: false, error: 'busy'},
            {type: 'ct-lesson-loaded', requestId: 'l1', ok: true}
        ]);
        expect(vm.loadProject).toHaveBeenCalledTimes(1);
    });

    test('create asks for a token that may be signed out, and reports not-signed-in', async () => {
        for (const token of ['', 'anonymous']) {
            postMessageToParent.mockClear();
            storage.getProjectToken.mockImplementation(() => Promise.resolve(token));
            const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
            const lesson = makeLesson(store);
            lesson.handleCreate({type: 'create', requestId: 'c'});
            await flush();
            expect(storage.getProjectToken).toHaveBeenLastCalledWith({acceptSignedOut: true, timeoutMs: 30000});
            expect(replies('ct-lesson-created')).toEqual([
                {type: 'ct-lesson-created', requestId: 'c', ok: false, error: 'not-signed-in'}
            ]);
            expect(store.getState().scratchGui.projectState.loadingState).toBe(LoadingState.SHOWING_WITHOUT_ID);
            expect(lesson.pendingCreate).toBeNull();
        }
    });

    test('create reports auth-timeout when the parent never answers', async () => {
        storage.getProjectToken.mockImplementation(() => Promise.reject(new Error('auth-timeout')));
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        makeLesson(store).handleCreate({type: 'create', requestId: 'c'});
        await flush();
        expect(replies('ct-lesson-created')).toEqual([
            {type: 'ct-lesson-created', requestId: 'c', ok: false, error: 'auth-timeout'}
        ]);
    });

    test('a create that succeeds after its timeout is announced late', async () => {
        jest.useFakeTimers();
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        const lesson = makeLesson(store);
        lesson.unsubscribeSaveResults = onLessonSaveResult(lesson.handleSaveResult);
        lesson.handleCreate({type: 'create', requestId: 'c'});
        await flushPromises();
        expect(store.getState().scratchGui.projectState.loadingState).toBe(LoadingState.CREATING_NEW);
        jest.advanceTimersByTime(60 * 1000);
        await flushPromises();
        expect(replies('ct-lesson-created')).toEqual([
            {type: 'ct-lesson-created', requestId: 'c', ok: false, error: 'timeout'}
        ]);
        lesson.handleCreate({type: 'create', requestId: 'c2'});
        lesson.handleLoad({type: 'load', requestId: 'l', sb3: new ArrayBuffer(4), title: null});
        expect(replies('ct-lesson-created')[1]).toEqual(
            {type: 'ct-lesson-created', requestId: 'c2', ok: false, error: 'busy'});
        expect(replies('ct-lesson-loaded')).toEqual([
            {type: 'ct-lesson-loaded', requestId: 'l', ok: false, error: 'busy'}
        ]);
        reportLessonSaveResult({kind: 'create', ok: true, projectId: '888'});
        expect(replies('ct-lesson-created')[2]).toEqual(
            {type: 'ct-lesson-created', requestId: 'c', ok: true, projectId: '888', late: true});
        expect(postMessageToParent).toHaveBeenCalledWith({type: 'ct-lesson-event', event: 'saved', projectId: '888'});
        expect(lesson.lateCreate).toBeNull();
        reportLessonSaveResult({kind: 'create', ok: true, projectId: '888'});
        expect(replies('ct-lesson-created')).toHaveLength(3);
        lesson.componentWillUnmount();
    });

    test('a create that fails after its timeout sends nothing more and keeps the title', async () => {
        jest.useFakeTimers();
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        store.dispatch(setProjectTitle('Lesson 1'));
        const lesson = makeLesson(store);
        lesson.unsubscribeSaveResults = onLessonSaveResult(lesson.handleSaveResult);
        lesson.handleCreate({type: 'create', requestId: 'c'});
        await flushPromises();
        jest.advanceTimersByTime(60 * 1000);
        await flushPromises();
        store.dispatch(setProjectTitle('Project'));
        reportLessonSaveResult({kind: 'create', ok: false, error: 500});
        expect(replies('ct-lesson-created')).toEqual([
            {type: 'ct-lesson-created', requestId: 'c', ok: false, error: 'timeout'}
        ]);
        expect(store.getState().scratchGui.projectTitle).toBe('Lesson 1');
        expect(lesson.lateCreate).toBeNull();
        lesson.componentWillUnmount();
    });

    test('the store is no longer watched once ready was sent', () => {
        const store = makeStore(LoadingState.FETCHING_NEW_DEFAULT, makeVm());
        const lesson = makeLesson(store);
        const spy = jest.spyOn(lesson, 'handleStoreChange');
        const unsubscribe = store.subscribe(() => lesson.handleStoreChange());
        lesson.unsubscribeStore = jest.fn(unsubscribe);
        const unsubscribeStore = lesson.unsubscribeStore;
        store.dispatch({type: 'scratch-gui/project-state/DONE_FETCHING_DEFAULT', projectData: '{}'});
        expect(unsubscribeStore).not.toHaveBeenCalled();
        store.dispatch({type: 'scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID'});
        expect(unsubscribeStore).toHaveBeenCalledTimes(1);
        expect(lesson.unsubscribeStore).toBeNull();
        const calls = spy.mock.calls.length;
        store.dispatch(setProjectTitle('Changed'));
        expect(spy.mock.calls.length).toBe(calls);
        expect(replies('ct-lesson-event')).toEqual([{type: 'ct-lesson-event', event: 'ready'}]);
    });

    test('lessonMode is passed on to the wrapped component', () => {
        const store = makeStore(LoadingState.SHOWING_WITHOUT_ID, makeVm());
        const element = makeLesson(store).render();
        expect(element.props.lessonMode).toBe(true);
    });
});

describe('CTLessonHOC stage size', () => {
    const withWidth = (width, fn) => {
        const hadWindow = typeof global.window !== 'undefined';
        const original = hadWindow ? global.window : null;
        global.window = {innerWidth: width};
        try {
            fn();
        } finally {
            if (hadWindow) {
                global.window = original;
            } else {
                delete global.window;
            }
        }
    };

    test('a narrow window gets the small stage and a wide one restores the large stage', () => {
        const store = makeStore(LoadingState.SHOWING_WITH_ID, makeVm());
        const lesson = makeLesson(store);
        withWidth(892, () => lesson.handleWindowResize());
        expect(store.getState().scratchGui.stageSize.stageSize).toBe(STAGE_SIZE_MODES.small);
        withWidth(1050, () => lesson.handleWindowResize());
        expect(store.getState().scratchGui.stageSize.stageSize).toBe(STAGE_SIZE_MODES.small);
        withWidth(1400, () => lesson.handleWindowResize());
        expect(store.getState().scratchGui.stageSize.stageSize).toBe(STAGE_SIZE_MODES.large);
    });

    test('a learner-chosen small stage is left alone when the window grows', () => {
        const store = makeStore(LoadingState.SHOWING_WITH_ID, makeVm());
        const lesson = makeLesson(store);
        store.dispatch({type: 'scratch-gui/StageSize/SET_STAGE_SIZE', stageSize: STAGE_SIZE_MODES.small});
        withWidth(1400, () => lesson.handleWindowResize());
        expect(store.getState().scratchGui.stageSize.stageSize).toBe(STAGE_SIZE_MODES.small);
    });
});

describe('storage token wait', () => {
    const realStorage = jest.requireActual('../../../src/lib/storage').default;
    let listeners;

    beforeEach(() => {
        jest.useFakeTimers();
        listeners = [];
        global.window = {
            parent: {postMessage: jest.fn()},
            addEventListener: jest.fn((type, fn) => listeners.push(fn)),
            removeEventListener: jest.fn((type, fn) => {
                listeners = listeners.filter(l => l !== fn);
            })
        };
        realStorage.projectToken = null;
    });

    afterEach(() => {
        jest.useRealTimers();
        delete global.window;
        realStorage.projectToken = null;
    });

    const answer = data => listeners.slice().forEach(fn => fn({origin: TRUSTED_IFRAME_HOST, data}));

    test('a signed-out answer settles the wait when asked to', async () => {
        const token = realStorage.getProjectToken({acceptSignedOut: true, timeoutMs: 30000});
        expect(window.parent.postMessage).toHaveBeenCalled();
        answer({type: 'JWT_AUTH CREDS', token: ''});
        await expect(token).resolves.toBe('');
        expect(listeners).toHaveLength(0);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('without acceptSignedOut, a signed-out answer is not enough', async () => {
        const token = realStorage.getProjectToken();
        answer({type: 'JWT_AUTH CREDS', token: ''});
        expect(listeners).toHaveLength(1);
        answer({type: 'JWT_AUTH CREDS', token: 'jwt'});
        await expect(token).resolves.toBe('jwt');
        expect(listeners).toHaveLength(0);
    });

    test('a timeout rejects and removes the listener', async () => {
        const token = realStorage.getProjectToken({acceptSignedOut: true, timeoutMs: 30000});
        expect(listeners).toHaveLength(1);
        jest.advanceTimersByTime(30000);
        await expect(token).rejects.toThrow('auth-timeout');
        expect(listeners).toHaveLength(0);
    });
});
