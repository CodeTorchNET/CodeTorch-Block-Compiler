import fs from 'fs';
import path from 'path';
import {makeVm} from './helpers/headless-vm';
import {serializeState, cloneState, equalCanonical, findTarget} from '../../../src/lib/rewind/state';
import {makeOp} from '../../../src/lib/rewind/ops';
import {diffStates} from '../../../src/lib/rewind/diff';
import {Timeline, replayStep} from '../../../src/lib/rewind/timeline';

const SB3 = process.env.REWIND_FIXTURE_SB3 || path.resolve(__dirname, '../../fixtures/project1.sb3');
const OUT = process.env.REWIND_FIXTURE_OUT || null;

const T0 = Date.UTC(2026, 10, 2, 21, 0, 0);
const SEC = 1000;
const MIN = 60 * SEC;

const blk = (id, opcode, extra = {}) => Object.assign({
    id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false
}, extra);

const sayScript = (prefix, x, y, text) => ({
    [`${prefix}hat`]: blk(`${prefix}hat`, 'event_whenflagclicked', {topLevel: true, x, y, next: `${prefix}say`}),
    [`${prefix}say`]: blk(`${prefix}say`, 'looks_say', {
        parent: `${prefix}hat`,
        inputs: {MESSAGE: {name: 'MESSAGE', block: `${prefix}txt`, shadow: `${prefix}txt`}}
    }),
    [`${prefix}txt`]: blk(`${prefix}txt`, 'text', {
        parent: `${prefix}say`, shadow: true, fields: {TEXT: {name: 'TEXT', value: text}}
    })
});

const replay = (state, ops) => {
    const s = cloneState(state);
    for (const op of ops) replayStep(s, op);
    return s;
};

const buildHistory = async () => {
    const vm = makeVm();
    await vm.loadProject(fs.readFileSync(SB3));
    const chunk0 = serializeState(vm, {t: T0, session: 'sess-0', room: null});
    chunk0.extensions = (chunk0.extensions || []).filter(e => e.id !== 'runtimeoptions');

    const sprites = chunk0.targets.filter(t => !t.isStage);
    const byBlocks = sprites.slice().sort((a, b) => Object.keys(b.blocks).length - Object.keys(a.blocks).length);
    const A = byBlocks[0];
    const B = sprites.find(t => t !== A) || A;
    const C = sprites.find(t => t !== A && t !== B) || B;
    const svgCostumes = [];
    for (const t of chunk0.targets) for (const c of t.costumes) if (c.dataFormat === 'svg') svgCostumes.push({t, c});
    const painted = svgCostumes.find(x => !x.t.isStage) || svgCostumes[0];
    const otherSvgs = [...new Set(svgCostumes.map(x => x.c.md5ext))].filter(m => m !== painted.c.md5ext);

    let clock = T0;
    const sid = {s0: 'sess-0', s1: 'sess-1'};
    const mk = (list, session, k, tg, d, o = {}) => {
        const op = makeOp(k, tg, d, {t: clock, source: o.source || 'editor', g: o.g});
        Object.assign(op, {ts: clock, actor_kind: o.actor_kind || 'author', user: o.user || 'maya', sid: session});
        list.push(op);
        return op;
    };
    const ops0 = [];
    const zoe = {actor_kind: 'collaborator', user: 'zoe'};
    const torchy = {actor_kind: 'torchy', user: 'maya', source: 'torchy', g: 'torchy:7f3a'};

    for (let i = 0; i < 8; i++) {
        clock += 3 * SEC;
        mk(ops0, sid.s0, 'target.props', B.id, {x: -120 + (i * 30), y: (i % 2) * 40});
        if (i % 2 === 1) {
            clock += 1 * SEC;
            mk(ops0, sid.s0, 'target.props', C.id, {direction: 90 + (i * 10)}, zoe);
        }
    }
    clock += 20 * SEC;
    mk(ops0, sid.s0, 'blocks.add', A.id, {blocks: sayScript('m1', 40, 40, 'Hello')});
    for (const text of ['Hello ducks', 'Hello ducks!', 'Quack!']) {
        clock += 6 * SEC;
        mk(ops0, sid.s0, 'blocks.update', A.id, {id: 'm1txt', props: {'["fields","TEXT","value"]': text}});
    }
    clock += 5 * SEC;
    mk(ops0, sid.s0, 'blocks.update', A.id, {id: 'm1hat', props: {x: 120, y: 60}});
    clock += 4 * SEC;
    mk(ops0, sid.s0, 'blocks.add', C.id, {blocks: sayScript('z1', 30, 300, 'from zoe')}, zoe);
    clock += 30 * SEC;
    for (let i = 0; i < 3; i++) {
        clock += 200;
        mk(ops0, sid.s0, 'blocks.add', C.id, {blocks: sayScript(`t${i}`, 400, 40 + (i * 120), `Torchy ${i}`)}, torchy);
    }
    const afterTorchy = clock;
    clock += 40 * SEC;
    mk(ops0, sid.s0, 'art.vector', painted.t.id, {costume: painted.c.id, ops: [
        {op: 'add', id: 'shape-1', shape: {tag: 'rect', attrs: {x: 0, y: 0, width: 10, height: 10}}}
    ]});
    clock += 8 * SEC;
    mk(ops0, sid.s0, 'costume.update', painted.t.id, {id: painted.c.id, data: {
        md5ext: otherSvgs[0], assetId: otherSvgs[0].split('.')[0]
    }});
    clock += 1 * SEC;
    mk(ops0, sid.s0, 'art.keyframe', painted.t.id, {
        costume: painted.c.id, md5ext: otherSvgs[1] || otherSvgs[0], format: 'svg'
    });
    clock += 20 * SEC;
    mk(ops0, sid.s0, 'runtime.state', null, {targets: {[B.id]: {x: 10, y: -20}}}, {source: 'runtime'});
    clock += 25 * MIN;
    mk(ops0, sid.s0, 'target.rename', C.id, {name: `${C.name} (zoe)`}, zoe);
    clock += 10 * SEC;
    mk(ops0, sid.s0, 'target.props', A.id, {x: 0, y: 0, size: 80});
    const end0 = clock;

    clock += 5 * MIN;
    const base1 = clock;
    const chunk1 = Object.assign(replay(chunk0, ops0), {t: base1, session: sid.s1});
    const ops1 = [];
    clock += 5 * SEC;
    mk(ops1, sid.s1, 'blocks.add', A.id, {blocks: sayScript('m2', 40, 400, 'Second session')});
    clock += 5 * SEC;
    mk(ops1, sid.s1, 'target.props', A.id, {x: 100, y: 50});
    clock += 30 * SEC;
    const restoreTo = afterTorchy;
    const restoredState = replay(chunk0, ops0.filter(op => op.ts <= restoreTo));
    const live = replay(chunk1, ops1);
    const diff = diffStates(live, restoredState, {source: 'restore', t: clock});
    mk(ops1, sid.s1, 'restore', null, {to: restoreTo, label_user: 'maya', diff}, {source: 'restore', g: 'restore:1'});
    const restoreAt = clock;
    clock += 20 * SEC;
    mk(ops1, sid.s1, 'target.props', B.id, {x: 200, y: 100}, zoe);
    const end1 = clock;

    const actors = ops => {
        const counts = {};
        for (const op of ops) {
            const key = `${op.actor_kind}:${op.user}`;
            counts[key] = (counts[key] || 0) + 1;
        }
        return Object.keys(counts).sort()
            .map(key => ({kind: key.split(':')[0], user: key.split(':')[1], ops: counts[key]}));
    };
    const index = {
        started_at: new Date(T0).toISOString(),
        recording: true,
        locked: false,
        delete_after: null,
        can_restore: true,
        compacted_before: null,
        server_now: end1 + MIN,
        segments: [
            {n: 0, base_ts: T0, chunk_ts: T0, end_ts: end0, op_count: ops0.length, actors: actors(ops0),
                sealed: true, compacted: false, verified: 'unknown', kind: 'normal', room: null},
            {n: 1, base_ts: base1, chunk_ts: base1, end_ts: null, op_count: ops1.length, actors: actors(ops1),
                sealed: false, compacted: false, verified: 'unknown', kind: 'normal', room: null}
        ]
    };
    return {
        index,
        chunks: {0: chunk0, 1: chunk1},
        segments: {0: ops0, 1: ops1},
        marks: {T0, afterTorchy, restoreAt, end0, base1, end1, painted: {targetId: painted.t.id, costumeId: painted.c.id},
            bigTarget: A.id, collabTarget: C.id},
        restoredState
    };
};

const timelineFor = (h, calls) => new Timeline({
    fetchIndex: () => Promise.resolve(JSON.parse(JSON.stringify(h.index))),
    fetchChunk: n => Promise.resolve(cloneState(h.chunks[n])),
    fetchSegment: n => Promise.resolve(JSON.parse(JSON.stringify(h.segments[n]))),
    postVerify: (n, r) => {
        calls.push([n, r]);
        return Promise.resolve();
    },
    checkpointEvery: 7
});

describe('viewer history over a real project', () => {
    let h;
    beforeAll(async () => {
        h = await buildHistory();
        if (OUT) {
            const {restoredState, ...out} = h; // eslint-disable-line no-unused-vars
            fs.writeFileSync(OUT, JSON.stringify(out));
        }
    });

    test('lanes, markers, idle gap and the broken paint edit', async () => {
        const tl = timelineFor(h, []);
        await tl.load();
        await tl.prefetch();
        expect(tl.lanes.map(l => l.key)).toEqual(['author', 'collaborator:zoe', 'torchy', 'system']);
        expect(tl.lanes[0].user).toBe('maya');
        expect(tl.markers.filter(m => m.kind === 'restore')).toEqual([
            expect.objectContaining({ts: h.marks.restoreAt, to: h.marks.afterTorchy, user: 'maya'})
        ]);
        expect(tl.idleGaps.some(g => g.to - g.from >= 20 * MIN)).toBe(true);
        expect(tl.brokenRanges).toEqual([expect.objectContaining(h.marks.painted)]);
        expect(tl.events.filter(e => e.lane === 'torchy')).toHaveLength(3);
    });

    test('cursor replay equals fresh replay at every op time, the boundary verifies ok', async () => {
        const calls = [];
        const tl = timelineFor(h, calls);
        await tl.load();
        await tl.prefetch();
        const times = [...h.segments[0], ...h.segments[1]].map(op => op.ts);
        const shuffled = times.concat(times.slice().reverse(), [h.marks.T0, h.marks.base1 - 1, h.marks.end1]);
        for (const t of shuffled) {
            const got = await tl.stateAt(t);
            expect(JSON.stringify(got.state)).toBe(JSON.stringify(await tl.freshStateAt(t)));
        }
        const res = await tl.checkBoundary(0);
        expect(res.equal).toBe(true);
        await new Promise(r => setTimeout(r, 0));
        expect(calls).toEqual([[0, 'ok']]);
    });

    test('the restore lands on the restored point', async () => {
        const tl = timelineFor(h, []);
        await tl.load();
        const after = await tl.stateAt(h.marks.restoreAt);
        expect(equalCanonical(after.state, h.restoredState)).toBe(true);
        const before = await tl.stateAt(h.marks.restoreAt - 1);
        expect(equalCanonical(before.state, h.restoredState)).toBe(false);
        expect(findTarget(after.state, h.marks.bigTarget)).toBeTruthy();
    });

    test('restoreStateAt inside the broken range takes the costume as of the last repair point', async () => {
        const tl = timelineFor(h, []);
        await tl.load();
        await tl.ensureLoaded(tl.segments[0]);
        const b = tl.brokenRanges[0];
        const r = await tl.restoreStateAt(b.from + 1);
        const c = findTarget(r.state, b.targetId).costumes.find(x => x.id === b.costumeId);
        const c0 = findTarget(h.chunks[0], b.targetId).costumes.find(x => x.id === b.costumeId);
        expect(c.md5ext).toBe(c0.md5ext);
        expect(r.warnings).toEqual([expect.objectContaining({kind: 'costume', asOf: h.marks.T0})]);
    });
});
