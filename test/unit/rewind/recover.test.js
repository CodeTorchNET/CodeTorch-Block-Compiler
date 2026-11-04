import {makeVm, loadFixture} from './helpers/headless-vm';

jest.mock('../../../src/lib/rewind/api', () => ({rewindApi: {}}));
import {makeOp} from '../../../src/lib/rewind/ops';
import {applyOps} from '../../../src/lib/rewind/apply';
import {cloneState, serializeState, equalCanonical, diffCanonical} from '../../../src/lib/rewind/state';
import {Timeline} from '../../../src/lib/rewind/timeline';
import {RewindRecorder} from '../../../src/lib/rewind/recorder';
import {
    canRecover, continueFrom, findWorkingVersion, headOf,
    setPendingRecovery, peekPendingRecovery, takePendingRecovery, clearPendingRecovery
} from '../../../src/lib/rewind/recover';
import projectStateReducer, {
    LoadingState, projectError, startRecovering
} from '../../../src/reducers/project-state';

const T0 = Date.UTC(2026, 10, 8, 14, 0, 0);
const SEC = 1000;

const blk = (id, opcode, extra = {}) => Object.assign({
    id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false
}, extra);

const base = () => ({
    v: 1, t: T0, session: 's', room: null,
    targets: [
        {id: 'stage', name: 'Stage', isStage: true, layerOrder: 0, currentCostume: 0, volume: 100, tempo: 60,
            blocks: {}, variables: {}, comments: {}, sounds: [],
            costumes: [{id: 'c0', name: 'backdrop1', assetId: 'a', dataFormat: 'svg', md5ext: 'a.svg',
                rotationCenterX: 1, rotationCenterY: 1, bitmapResolution: 1}]},
        {id: 'cat', name: 'Cat', isStage: false, layerOrder: 1, currentCostume: 0, volume: 100,
            x: 0, y: 0, direction: 90, size: 100, rotationStyle: 'all around', visible: true, draggable: false,
            blocks: {
                hat: blk('hat', 'event_whenflagclicked', {topLevel: true, x: 10, y: 20, next: 'move'}),
                move: blk('move', 'motion_movesteps', {parent: 'hat',
                    inputs: {STEPS: {name: 'STEPS', block: 'num', shadow: 'num'}}}),
                num: blk('num', 'math_number', {parent: 'move', shadow: true, fields: {NUM: {name: 'NUM', value: '10'}}})
            },
            variables: {}, comments: {}, sounds: [],
            costumes: [{id: 'k1', name: 'costume1', assetId: 'b', dataFormat: 'svg', md5ext: 'b.svg',
                rotationCenterX: 2, rotationCenterY: 2, bitmapResolution: 1}]}
    ],
    monitors: [], extensions: [], fonts: [], meta: {}
});

const setNum = (ts, value) => Object.assign(makeOp('blocks.update', 'cat',
    {id: 'num', props: {'["fields","NUM","value"]': String(value)}}, {t: ts}), {
    ts, actor_kind: 'author', user: 'maya', sid: 'sess'
});

const num = state => state.targets[1].blocks.num.fields.NUM.value;

/**
 * Segments.
 */
const timelineOf = segs => new Timeline({
    fetchIndex: () => Promise.resolve({
        started_at: new Date(T0).toISOString(), recording: true, locked: false, delete_after: null,
        can_restore: true, server_now: T0 + 3600 * SEC,
        segments: segs.map((s, n) => ({
            n, base_ts: s.base, chunk_ts: s.base,
            end_ts: s.ops.length ? s.ops[s.ops.length - 1].ts : s.base,
            op_count: s.ops.length, actors: [], sealed: true, compacted: false, verified: 'unknown', kind: 'normal'
        }))
    }),
    fetchChunk: n => Promise.resolve(cloneState(segs[n].chunk)),
    fetchSegment: n => Promise.resolve(JSON.parse(JSON.stringify(segs[n].ops))),
    postVerify: () => Promise.resolve()
});

const twoSessions = () => {
    const ops0 = [setNum(T0 + 1 * SEC, 15), setNum(T0 + 2 * SEC, 20)];
    const chunk1 = applyOps(base(), ops0);
    const ops1 = [setNum(T0 + 101 * SEC, 30)];
    return [{base: T0, chunk: base(), ops: ops0}, {base: T0 + 100 * SEC, chunk: chunk1, ops: ops1}];
};

const failing = values => state => (values.includes(num(state)) ?
    Promise.reject(new Error('will not load')) : Promise.resolve());

describe('recover: finding a version that loads', () => {
    test('the newest version, when it loads', async () => {
        const tl = timelineOf(twoSessions());
        await tl.load();
        const tried = [];
        const found = await findWorkingVersion(tl, failing([]), {onTry: t => tried.push(t)});
        expect(num(found.state)).toBe('30');
        expect(found.t).toBe(T0 + 101 * SEC);
        expect(tried).toEqual([T0 + 101 * SEC]);
    });

    test('walks back to the end of the session before when the newest fails', async () => {
        const tl = timelineOf(twoSessions());
        await tl.load();
        const tried = [];
        const found = await findWorkingVersion(tl, failing(['30']), {onTry: t => tried.push(t)});
        expect(num(found.state)).toBe('20');
        expect(found.t).toBe(T0 + 2 * SEC);
        expect(tried).toEqual([T0 + 101 * SEC, T0 + 2 * SEC]);
    });

    test('null when nothing loads', async () => {
        const tl = timelineOf(twoSessions());
        await tl.load();
        expect(await findWorkingVersion(tl, failing(['30', '20']))).toBe(null);
    });

    test('a session that changed nothing is not tried twice', async () => {
        const segs = twoSessions();
        segs[1].ops = [];
        const tl = timelineOf(segs);
        await tl.load();
        const tried = [];
        expect(await findWorkingVersion(tl, failing(['20']), {onTry: t => tried.push(t)})).toBe(null);
        expect(tried).toHaveLength(1);
    });

    test('stops after max versions', async () => {
        const tl = timelineOf(twoSessions());
        await tl.load();
        const tried = [];
        expect(await findWorkingVersion(tl, failing(['30', '20']), {max: 1, onTry: t => tried.push(t)})).toBe(null);
        expect(tried).toHaveLength(1);
    });

    test('headOf is the newest state', async () => {
        const tl = timelineOf(twoSessions());
        await tl.load();
        const head = await headOf(tl);
        expect(num(head.state)).toBe('30');
    });
});

describe('recover: offering it', () => {
    test('needs restore and view rights', () => {
        expect(canRecover(null)).toBe(false);
        expect(canRecover({can_restore: true, can_view: false})).toBe(false);
        expect(canRecover({can_restore: false, can_view: true})).toBe(false);
        expect(canRecover({can_restore: true, can_view: true})).toBe(true);
    });

    test('a pending recovery belongs to one project and is taken once', () => {
        setPendingRecovery({projectId: 42, state: base(), t: T0, head: null, labelUser: 'maya'});
        expect(peekPendingRecovery('7')).toBe(null);
        expect(peekPendingRecovery('42').t).toBe(T0);
        expect(takePendingRecovery(42).labelUser).toBe('maya');
        expect(takePendingRecovery(42)).toBe(null);
        setPendingRecovery({projectId: 1, state: base(), t: T0});
        clearPendingRecovery();
        expect(peekPendingRecovery(1)).toBe(null);
    });
});

describe('recover: project state', () => {
    const errored = during => projectStateReducer(
        Object.assign({}, projectStateReducer(undefined, {type: '@@init'}), {loadingState: during, projectId: '42'}),
        projectError(new Error('bad file'))
    );

    test('a fatal error remembers where it happened', () => {
        const state = errored(LoadingState.LOADING_VM_WITH_ID);
        expect(state.loadingState).toBe(LoadingState.ERROR);
        expect(state.errorDuring).toBe(LoadingState.LOADING_VM_WITH_ID);
    });

    test('recovering loads the recovered version through the normal path', () => {
        const state = projectStateReducer(errored(LoadingState.LOADING_VM_WITH_ID),
            startRecovering({ctRewindRecovery: true}));
        expect(state.loadingState).toBe(LoadingState.LOADING_VM_WITH_ID);
        expect(state.projectData).toEqual({ctRewindRecovery: true});
        expect(state.error).toBe(null);
        expect(state.errorDuring).toBe(null);
    });

    test('recovering is ignored outside the error screen', () => {
        const showing = Object.assign({}, projectStateReducer(undefined, {type: '@@init'}),
            {loadingState: LoadingState.SHOWING_WITH_ID, projectId: '42'});
        expect(projectStateReducer(showing, startRecovering({ctRewindRecovery: true}))).toBe(showing);
    });
});

describe('recover: the new session continues the history', () => {
    let clock = 1800000000000;
    const now = () => (clock += 5);
    const quiet = {warn: () => {}, info: () => {}};

    test('base is the history head, a restore leads to the recovered version', async () => {
        const vm = makeVm();
        await loadFixture(vm, 'rich-project.json');
        const recovered = serializeState(vm);
        const head = cloneState(recovered);
        head.targets[1].name = 'Broken';
        head.targets[1].x = 123;

        const recorder = new RewindRecorder(vm, {session: 'R', now, log: quiet});
        recorder.start();
        const base = continueFrom(recorder, vm, {head, t: T0, labelUser: 'maya'});
        expect(base).not.toBe(null);
        expect(equalCanonical(recorder.base, head)).toBe(true);

        const batch = recorder.takeBatch();
        expect(batch.ops.length).toBeGreaterThan(0);
        expect(batch.ops.every(op => op.k === 'restore')).toBe(true);
        expect(batch.ops[0].d.to).toBe(T0);
        expect(batch.ops[0].d.label_user).toBe('maya');
        expect(diffCanonical(applyOps(recorder.base, batch.ops), serializeState(vm))).toEqual([]);

        vm.renameSprite(vm.runtime.targets[1].id, 'Fixed');
        const later = recorder.takeBatch().ops;
        expect(later.map(op => op.k)).toEqual(['target.rename']);
    });

    test('nothing to continue when the recovered version is the head', async () => {
        const vm = makeVm();
        await loadFixture(vm, 'rich-project.json');
        const recorder = new RewindRecorder(vm, {session: 'R', now, log: quiet});
        const live = recorder.start();
        expect(continueFrom(recorder, vm, {head: cloneState(live), t: T0})).toBe(null);
        expect(recorder.base).toBe(live);
        expect(recorder.takeBatch().ops).toEqual([]);
    });
});
