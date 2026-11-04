import {makeOp} from '../../../src/lib/rewind/ops';
import {applyOps} from '../../../src/lib/rewind/apply';
import {cloneState} from '../../../src/lib/rewind/state';
import {Timeline, laneOf, SYSTEM_LANE} from '../../../src/lib/rewind/timeline';

const blk = (id, opcode, extra = {}) => Object.assign({
    id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false
}, extra);

const T0 = Date.UTC(2026, 10, 3, 14, 0, 0);
const SEC = 1000;

const base = () => ({
    v: 1, t: T0, session: 's', room: null,
    targets: [
        {id: 'stage', name: 'Stage', isStage: true, layerOrder: 0, currentCostume: 0, volume: 100, tempo: 60,
            blocks: {}, variables: {v1: {id: 'v1', name: 'score', type: '', value: 0, isCloud: false}},
            comments: {}, costumes: [{id: 'c0', name: 'backdrop1', assetId: 'a', dataFormat: 'svg', md5ext: 'a.svg',
                rotationCenterX: 1, rotationCenterY: 1, bitmapResolution: 1}], sounds: []},
        {id: 'cat', name: 'Cat', isStage: false, layerOrder: 1, currentCostume: 0, volume: 100,
            x: 0, y: 0, direction: 90, size: 100, rotationStyle: 'all around', visible: true, draggable: false,
            blocks: {
                hat: blk('hat', 'event_whenflagclicked', {topLevel: true, x: 10, y: 20, next: 'move'}),
                move: blk('move', 'motion_movesteps', {parent: 'hat', inputs: {STEPS: {name: 'STEPS', block: 'num', shadow: 'num'}}}),
                num: blk('num', 'math_number', {parent: 'move', shadow: true, fields: {NUM: {name: 'NUM', value: '10'}}})
            },
            variables: {}, comments: {},
            costumes: [
                {id: 'k1', name: 'costume1', assetId: 'b', dataFormat: 'svg', md5ext: 'b.svg', rotationCenterX: 2, rotationCenterY: 2, bitmapResolution: 1},
                {id: 'k2', name: 'costume2', assetId: 'c', dataFormat: 'png', md5ext: 'c.png', rotationCenterX: 2, rotationCenterY: 2, bitmapResolution: 2}
            ],
            sounds: []}
    ],
    monitors: [], extensions: [], fonts: [], meta: {}
});

const sop = (ts, k, tg, d, stamp = {}) => Object.assign(makeOp(k, tg, d, {t: ts, source: stamp.source, g: stamp.g}), {
    ts,
    actor_kind: stamp.actor_kind || 'author',
    user: stamp.user || 'maya',
    sid: 'sess'
});

const setNum = (ts, value, stamp) => sop(ts, 'blocks.update', 'cat', {id: 'num', props: {'["fields","NUM","value"]': String(value)}}, stamp);
const setX = (ts, x, stamp) => sop(ts, 'target.props', 'cat', {x}, stamp);

const fakeApi = (segs, extra = {}) => {
    const calls = {chunk: [], segment: [], verify: []};
    const index = Object.assign({
        started_at: new Date(T0).toISOString(), recording: true, locked: false, delete_after: null,
        can_restore: true, server_now: T0 + 3600 * SEC,
        segments: segs.map((s, n) => ({
            n,
            base_ts: s.base,
            chunk_ts: s.base,
            end_ts: s.end === undefined ? (s.ops.length ? s.ops[s.ops.length - 1].ts : s.base) : s.end,
            op_count: s.ops.length,
            actors: s.actors || [{kind: 'author', user: 'maya', ops: s.ops.length}],
            sealed: s.sealed !== false,
            compacted: !!s.compacted,
            verified: s.verified || 'unknown',
            kind: s.kind || 'normal'
        }))
    }, extra);
    return {
        calls,
        fetchIndex: () => Promise.resolve(JSON.parse(JSON.stringify(index))),
        fetchChunk: n => {
            calls.chunk.push(n);
            return Promise.resolve(cloneState(segs[n].chunk));
        },
        fetchSegment: n => {
            calls.segment.push(n);
            if (segs[n].compacted) return Promise.reject(new Error('410 compacted'));
            return Promise.resolve(JSON.parse(JSON.stringify(segs[n].ops)));
        },
        postVerify: (n, result) => {
            calls.verify.push([n, result]);
            return Promise.resolve();
        }
    };
};

const makeTimeline = (api, opts = {}) => new Timeline(Object.assign({
    fetchIndex: api.fetchIndex,
    fetchChunk: api.fetchChunk,
    fetchSegment: api.fetchSegment,
    postVerify: api.postVerify
}, opts));

const num = state => state.targets[1].blocks.num.fields.NUM.value;
const flush = () => new Promise(r => setTimeout(r, 0));

const twoSegments = () => {
    const ops0 = [setNum(T0 + 1 * SEC, 11), setNum(T0 + 2 * SEC, 12), setX(T0 + 3 * SEC, 50)];
    const chunk0 = base();
    const chunk1 = applyOps(chunk0, ops0);
    const ops1 = [setNum(T0 + 101 * SEC, 21), setX(T0 + 102 * SEC, 70)];
    return [
        {base: T0, chunk: chunk0, ops: ops0},
        {base: T0 + 100 * SEC, chunk: chunk1, ops: ops1}
    ];
};

describe('timeline: loading and stateAt', () => {
    test('loads the index and the newest segment, range spans every segment', async () => {
        const api = fakeApi(twoSegments());
        const tl = makeTimeline(api);
        await tl.load();
        expect(api.calls.chunk).toEqual([1]);
        expect(tl.range).toEqual({start: T0, end: T0 + 102 * SEC});
        expect(tl.info.canRestore).toBe(true);
        expect(tl.info.startedAt).toBe(T0);
    });

    test('stateAt picks the segment with the latest base <= t and applies ops with ts <= t', async () => {
        const tl = makeTimeline(fakeApi(twoSegments()));
        await tl.load();
        expect(num((await tl.stateAt(T0)).state)).toBe('10');
        expect(num((await tl.stateAt(T0 + 1 * SEC)).state)).toBe('11');
        expect(num((await tl.stateAt(T0 + 1.5 * SEC)).state)).toBe('11');
        const mid = await tl.stateAt(T0 + 50 * SEC);
        expect(mid.segment).toBe(0);
        expect(num(mid.state)).toBe('12');
        expect(mid.state.targets[1].x).toBe(50);
        const s1 = await tl.stateAt(T0 + 100 * SEC);
        expect(s1.segment).toBe(1);
        expect(num(s1.state)).toBe('12');
        expect(num((await tl.stateAt(T0 + 101 * SEC)).state)).toBe('21');
        expect((await tl.stateAt(T0 + 9999 * SEC)).t).toBe(T0 + 102 * SEC);
        expect((await tl.stateAt(T0 - 9999 * SEC)).t).toBe(T0);
    });

    test('incremental cursor equals a fresh replay, forwards and backwards', async () => {
        const ops = [];
        for (let i = 0; i < 600; i++) {
            ops.push(i % 3 === 0 ? setX(T0 + (i + 1) * SEC, i) : setNum(T0 + (i + 1) * SEC, i));
            if (i % 97 === 0) {
                ops.push(sop(T0 + (i + 1) * SEC, 'blocks.add', 'cat', {blocks: {[`b${i}`]: blk(`b${i}`, 'looks_say', {topLevel: true, x: i, y: i})}}));
            }
            if (i % 151 === 0 && i > 0) ops.push(sop(T0 + (i + 1) * SEC, 'blocks.delete', 'cat', {id: `b${i - 151 + (97 - ((i - 151) % 97)) % 97}`}));
        }
        const tl = makeTimeline(fakeApi([{base: T0, chunk: base(), ops}]), {checkpointEvery: 50});
        await tl.load();
        expect(tl.segments[0].checkpoints.size).toBeGreaterThan(5);
        let seed = 7;
        const rnd = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        const times = [];
        for (let i = 0; i < 40; i++) times.push(T0 + Math.floor(rnd() * 620) * SEC);
        for (let i = 100; i < 140; i++) times.push(T0 + i * SEC);
        for (const t of times) {
            const got = await tl.stateAt(t);
            const fresh = await tl.freshStateAt(t);
            expect(JSON.stringify(got.state)).toBe(JSON.stringify(fresh));
        }
    });

    test('a forward step only applies the new ops', async () => {
        const segs = twoSegments();
        const tl = makeTimeline(fakeApi(segs));
        await tl.load();
        await tl.stateAt(T0 + 1 * SEC);
        const cursorState = tl._cursor.state;
        await tl.stateAt(T0 + 2 * SEC);
        expect(tl._cursor.state).toBe(cursorState);
        await tl.stateAt(T0 + 1 * SEC);
        expect(tl._cursor.state).not.toBe(cursorState);
    });

    test('until clamps the range, drops later segments and events', async () => {
        const segs = twoSegments();
        segs.push({base: T0 + 200 * SEC, chunk: applyOps(segs[1].chunk, segs[1].ops), ops: [setNum(T0 + 201 * SEC, 31)]});
        const api = fakeApi(segs);
        const tl = makeTimeline(api, {until: T0 + 101 * SEC});
        await tl.load();
        expect(tl.segments.map(s => s.n)).toEqual([0, 1]);
        expect(tl.range.end).toBe(T0 + 101 * SEC);
        await tl.prefetch();
        expect(api.calls.chunk).not.toContain(2);
        expect(tl.events.every(e => e.ts <= T0 + 101 * SEC)).toBe(true);
        const last = await tl.stateAt(T0 + 500 * SEC);
        expect(last.t).toBe(T0 + 101 * SEC);
        expect(num(last.state)).toBe('21');
        expect(last.state.targets[1].x).toBe(50);
    });
});

describe('timeline: verification', () => {
    test('a matching boundary posts ok once, when first crossed', async () => {
        const api = fakeApi(twoSegments());
        const tl = makeTimeline(api);
        await tl.load();
        await tl.stateAt(T0 + 101 * SEC);
        expect(api.calls.verify).toEqual([]);
        await tl.stateAt(T0 + 2 * SEC);
        await tl.checkBoundary(0);
        await flush();
        expect(api.calls.verify).toEqual([[0, 'ok']]);
        await tl.stateAt(T0 + 101 * SEC);
        await tl.stateAt(T0 + 1 * SEC);
        await flush();
        expect(api.calls.verify).toEqual([[0, 'ok']]);
        expect(tl.markers.filter(m => m.kind === 'unknown')).toEqual([]);
    });

    test('a mismatch posts mismatch and adds an unknown marker at the boundary', async () => {
        const segs = twoSegments();
        segs[1].chunk.targets[1].blocks.num.fields.NUM.value = '999';
        const api = fakeApi(segs);
        const tl = makeTimeline(api);
        await tl.load();
        await tl.stateAt(T0 + 101 * SEC);
        await tl.stateAt(T0 + 1 * SEC);
        const res = await tl.checkBoundary(0);
        await flush();
        expect(res.equal).toBe(false);
        expect(res.diff.length).toBeGreaterThan(0);
        expect(api.calls.verify).toEqual([[0, 'mismatch']]);
        const unknown = tl.markers.filter(m => m.kind === 'unknown');
        expect(unknown).toHaveLength(1);
        expect(unknown[0].ts).toBe(T0 + 100 * SEC);
        expect(num((await tl.stateAt(T0 + 100 * SEC)).state)).toBe('999');
    });

    test('server-known results are not re-posted; unsealed segments are not posted', async () => {
        const segs = twoSegments();
        segs[0].verified = 'mismatch';
        const api = fakeApi(segs);
        const tl = makeTimeline(api);
        await tl.load();
        expect(tl.markers.filter(m => m.kind === 'unknown')).toHaveLength(1);
        await tl.stateAt(T0 + 1 * SEC);
        await tl.checkBoundary(0);
        await flush();
        expect(api.calls.verify).toEqual([]);

        const segs2 = twoSegments();
        segs2[0].sealed = false;
        const api2 = fakeApi(segs2);
        const tl2 = makeTimeline(api2);
        await tl2.load();
        await tl2.stateAt(T0 + 1 * SEC);
        await tl2.checkBoundary(0);
        await flush();
        expect(api2.calls.verify).toEqual([]);
    });

    test('RewindApplyError freezes the segment at the last good op and marks it unknown', async () => {
        const segs = twoSegments();
        segs[0].ops.splice(2, 0, sop(T0 + 2.5 * SEC, 'blocks.update', 'cat', {id: 'ghost', props: {x: 1}}));
        const api = fakeApi(segs);
        const tl = makeTimeline(api);
        await tl.load();
        await tl.stateAt(T0 + 2 * SEC);
        expect(tl.segments[0].failedAt).toBe(2);
        const after = await tl.stateAt(T0 + 50 * SEC);
        expect(after.unknown).toBe(true);
        expect(num(after.state)).toBe('12');
        expect(after.state.targets[1].x).toBe(0);
        expect((await tl.stateAt(T0 + 2 * SEC)).unknown).toBe(false);
        const m = tl.markers.find(x => x.kind === 'unknown' && x.reason === 'apply');
        expect(m.ts).toBe(T0 + 2.5 * SEC);
        expect(m.to).toBe(T0 + 100 * SEC);
        await tl.stateAt(T0 + 101 * SEC);
        await tl.checkBoundary(0);
        await flush();
        expect(api.calls.verify).toEqual([[0, 'mismatch']]);
        const r = await tl.restoreStateAt(T0 + 50 * SEC);
        expect(r.warnings.map(w => w.kind)).toEqual(['unknown']);
    });
});

describe('timeline: compacted segments', () => {
    test('compacted segments are chunk-only steps and never fetch ops', async () => {
        const segs = twoSegments();
        segs[0].compacted = true;
        segs[0].end = null;
        const api = fakeApi(segs);
        const tl = makeTimeline(api);
        await tl.load();
        await tl.prefetch();
        expect(api.calls.segment).toEqual([1]);
        expect(num((await tl.stateAt(T0 + 50 * SEC)).state)).toBe('10');
        expect(num((await tl.stateAt(T0 + 100 * SEC)).state)).toBe('12');
        expect(tl.markers.find(m => m.kind === 'compacted')).toMatchObject({ts: T0, to: T0 + 100 * SEC});
        await tl.stateAt(T0 + 101 * SEC);
        await flush();
        expect(api.calls.verify).toEqual([]);
    });
});

describe('timeline: broken costumes', () => {
    const paintSegment = (keyframeMd5) => {
        const ops = [
            sop(T0 + 10 * SEC, 'art.vector', 'cat', {costume: 'k1', ops: [{op: 'add', id: 's1', shape: {tag: 'rect', attrs: {}}}]}),
            sop(T0 + 11 * SEC, 'costume.update', 'cat', {id: 'k1', data: {md5ext: 'b2.svg', assetId: 'b2'}}),
            sop(T0 + 12 * SEC, 'art.vector', 'cat', {costume: 'k1', ops: [{op: 'add', id: 's2', shape: {tag: 'circle', attrs: {}}}]}),
            sop(T0 + 20 * SEC, 'art.keyframe', 'cat', {costume: 'k1', md5ext: keyframeMd5, format: 'svg'}),
            setX(T0 + 30 * SEC, 5)
        ];
        return {base: T0, chunk: base(), ops};
    };

    test('a keyframe that agrees leaves the costume intact', async () => {
        const tl = makeTimeline(fakeApi([paintSegment('b2.svg')]));
        await tl.load();
        expect(tl.brokenRanges).toEqual([]);
    });

    test('a keyframe that disagrees marks the range broken and repairs the replay', async () => {
        const tl = makeTimeline(fakeApi([paintSegment('b3.svg')]));
        await tl.load();
        expect(tl.brokenRanges).toHaveLength(1);
        expect(tl.brokenRanges[0]).toMatchObject({
            targetId: 'cat', costumeId: 'k1', targetName: 'Cat', costumeName: 'costume1',
            from: T0 + 10 * SEC, to: T0 + 20 * SEC, asOf: T0
        });
        expect(tl.brokenAt(T0 + 15 * SEC)).toHaveLength(1);
        expect(tl.brokenAt(T0 + 25 * SEC)).toHaveLength(0);
        const after = await tl.stateAt(T0 + 25 * SEC);
        expect(after.state.targets[1].costumes[0].md5ext).toBe('b3.svg');
        expect(after.state.targets[1].costumes[0].assetId).toBe('b3');

        const r = await tl.restoreStateAt(T0 + 15 * SEC);
        expect(r.state.targets[1].costumes[0].md5ext).toBe('b.svg');
        expect(r.warnings).toEqual([{kind: 'costume', targetName: 'Cat', costumeName: 'costume1', at: T0 + 15 * SEC, asOf: T0}]);
        expect((await tl.stateAt(T0 + 15 * SEC)).state.targets[1].costumes[0].md5ext).toBe('b2.svg');
    });

    test('paint edits with no keyframe are checked against the next chunk', async () => {
        const ops0 = [
            sop(T0 + 10 * SEC, 'art.bitmap', 'cat', {costume: 'k2', op: {tool: 'brush'}}),
            sop(T0 + 11 * SEC, 'costume.update', 'cat', {id: 'k2', data: {md5ext: 'c2.png', assetId: 'c2'}})
        ];
        const chunk0 = base();
        const chunk1 = applyOps(chunk0, ops0);
        chunk1.targets[1].costumes[1].md5ext = 'c9.png';
        const tl = makeTimeline(fakeApi([
            {base: T0, chunk: chunk0, ops: ops0},
            {base: T0 + 100 * SEC, chunk: chunk1, ops: []}
        ]));
        await tl.load();
        await tl.prefetch();
        expect(tl.brokenRanges).toEqual([expect.objectContaining({
            costumeId: 'k2', costumeName: 'costume2', from: T0 + 10 * SEC, to: T0 + 100 * SEC, asOf: T0
        })]);
    });
});

describe('timeline: lanes, events, markers, idle gaps', () => {
    test('lanes per actor, system lane for runtime/restore, colours, markers', async () => {
        const ops = [
            setNum(T0 + 1 * SEC, 1),
            setNum(T0 + 2 * SEC, 2, {actor_kind: 'collaborator', user: 'zoe'}),
            setNum(T0 + 3 * SEC, 3, {actor_kind: 'collaborator', user: 'ben'}),
            setNum(T0 + 4 * SEC, 4, {actor_kind: 'torchy', source: 'torchy', g: 'torchy:1'}),
            sop(T0 + 5 * SEC, 'runtime.state', null, {targets: {cat: {x: 3}}}, {source: 'runtime'}),
            sop(T0 + 6 * SEC, 'restore', null, {to: T0 + 1 * SEC, label_user: 'maya', diff: [setNum(T0 + 6 * SEC, 1)]}, {source: 'restore'}),
            sop(T0 + 7 * SEC, 'system.replaced', null, {by_session: 'x', revision: 3}, {actor_kind: 'system', source: 'system'})
        ];
        const tl = makeTimeline(fakeApi([{base: T0, chunk: base(), ops, actors: [
            {kind: 'author', user: 'maya', ops: 1}, {kind: 'collaborator', user: 'zoe', ops: 1},
            {kind: 'collaborator', user: 'ben', ops: 1}, {kind: 'torchy', user: 'maya', ops: 1}
        ]}]));
        await tl.load();
        expect(tl.lanes.map(l => l.key)).toEqual(['author', 'collaborator:ben', 'collaborator:zoe', 'torchy', SYSTEM_LANE]);
        expect(new Set(tl.lanes.map(l => l.color)).size).toBe(5);
        expect(tl.events.map(e => e.lane)).toEqual(['author', 'collaborator:zoe', 'collaborator:ben', 'torchy',
            SYSTEM_LANE]);
        expect(tl.events.some(e => e.k === 'runtime.state')).toBe(false);
        expect(tl.events[0]).toMatchObject({tg: 'cat', block: 'num', tab: 'code'});
        expect(tl.markers.map(m => m.kind)).toEqual(['restore', 'replaced']);
        expect(tl.markers[0]).toMatchObject({to: T0 + 1 * SEC, user: 'maya'});
        expect(laneOf({k: 'blocks.add', actor: 'torchy'})).toBe('torchy');
        expect(num((await tl.stateAt(T0 + 6 * SEC)).state)).toBe('1');
        expect(tl.lastEventAtOrBefore(T0 + 3.5 * SEC, e => e.lane === 'collaborator:zoe').ts).toBe(T0 + 2 * SEC);
        expect(tl.nextEventAfter(T0 + 3 * SEC, e => e.lane === 'torchy').ts).toBe(T0 + 4 * SEC);
        expect(tl.eventsBetween(T0 + 1 * SEC, T0 + 3 * SEC).map(e => e.ts)).toEqual([T0 + 2 * SEC, T0 + 3 * SEC]);
    });

    test('event lookups work from fractional times (playback steps are fractional ms)', async () => {
        const ops = [setNum(T0 + 1 * SEC, 1), setNum(T0 + 3 * SEC, 2)];
        const tl = makeTimeline(fakeApi([{base: T0, chunk: base(), ops}]));
        await tl.load();
        const at = T0 + (3 * SEC);
        expect(tl.eventsBetween(at - 0.01, at + 500).map(e => e.ts)).toEqual([at]);
        expect(tl.eventsBetween(at - 0.01, at - 0.001)).toEqual([]);
        expect(tl.nextEventAfter(at - 0.5).ts).toBe(at);
        expect(tl.nextEventAfter(at + 0.5)).toBeNull();
        expect(tl.lastEventAtOrBefore(at - 0.5).ts).toBe(T0 + 1 * SEC);
        expect(tl.lastEventAtOrBefore(at + 0.5).ts).toBe(at);
    });

    test('idle gaps between edits longer than the threshold (runtime flushes do not count)', async () => {
        const ops = [
            setNum(T0 + 1 * SEC, 1),
            setNum(T0 + 20 * SEC, 2),
            sop(T0 + 100 * SEC, 'runtime.state', null, {targets: {cat: {x: 3}}}, {source: 'runtime'}),
            setNum(T0 + 300 * SEC, 3),
            setNum(T0 + 310 * SEC, 4)
        ];
        const tl = makeTimeline(fakeApi([{base: T0, chunk: base(), ops}]), {idleGapMs: 60 * SEC});
        await tl.load();
        expect(tl.idleGaps).toEqual([{from: T0 + 20 * SEC, to: T0 + 300 * SEC}]);
        expect(tl.idleGapAt(T0 + 200 * SEC)).toEqual({from: T0 + 20 * SEC, to: T0 + 300 * SEC});
        expect(tl.idleGapAt(T0 + 10 * SEC)).toBeNull();
    });

    test('replaced segments get a system marker; empty history is empty', async () => {
        const segs = twoSegments();
        segs[1].kind = 'replaced';
        const tl = makeTimeline(fakeApi(segs));
        await tl.load();
        expect(tl.markers.filter(m => m.kind === 'replaced').map(m => m.ts)).toEqual([T0 + 100 * SEC]);

        const empty = makeTimeline(fakeApi([]));
        await empty.load();
        expect(empty.isEmpty).toBe(true);
        expect(empty.lanes.map(l => l.key)).toEqual(['author', SYSTEM_LANE]);
    });
});
