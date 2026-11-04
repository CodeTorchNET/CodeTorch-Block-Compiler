jest.mock('../../../src/lib/storage', () => ({}));
import {makeVm, loadFixture} from './helpers/headless-vm';
import * as E from './helpers/editor';
import {RewindRecorder} from '../../../src/lib/rewind/recorder';
import {RewindFlusher} from '../../../src/lib/rewind/flush';
import {createQueue, memoryBackend, pruneBatches, MAX_AGE_MS, MAX_OPS} from '../../../src/lib/rewind/queue';
import {createRewindApi, RewindHttpError} from '../../../src/lib/rewind/api';
import {roomGenerationNumber} from '../../../src/lib/rewind/hooks';
import {diffShapes, assignShapeIds} from '../../../src/lib/costume-art-shapes';
import {applyOps} from '../../../src/lib/rewind/apply';
import {makeOp} from '../../../src/lib/rewind/ops';

const quiet = {warn: () => {}, info: () => {}};
const NOW = 1700000000000;
const batch = (o = {}) => Object.assign({
    key: Math.random().toString(36), projectId: '1', user: 'maya', session: 's', room: null,
    savedRevision: 3, base: null, headIds: null, ops: [{}], md5exts: [], assets: {}, createdAt: NOW, attempts: 0
}, o);

describe('queue drop rules', () => {
    test('each rule', () => {
        const ctx = {now: NOW, user: 'maya', liveSession: 'live'};
        const {keep, drop} = pruneBatches([
            batch({key: 'ok'}),
            batch({key: 'other', user: 'sam', session: 'x1'}),
            batch({key: 'old', createdAt: NOW - MAX_AGE_MS - 1, session: 'x2'}),
            batch({key: 'unsaved', savedRevision: null, session: 'x3'}),
            batch({key: 'live-unsaved', savedRevision: null, session: 'live'}),
            batch({key: 'room', savedRevision: null, room: {id: 'r', generation: 1}, session: 'x4'}),
            batch({key: 'tired', attempts: 20, session: 'x5'}),
            batch({key: 'gap-a', session: 'x6', attempts: 20, createdAt: NOW - 2}),
            batch({key: 'gap-b', session: 'x6', createdAt: NOW - 1})
        ], ctx);
        expect(keep.map(b => b.key).sort()).toEqual(['live-unsaved', 'ok', 'room']);
        const why = Object.fromEntries(drop.map(d => [d.batch.key, d.reason]));
        expect(why).toEqual({'other': 'other-user', 'old': 'expired', 'unsaved': 'unsaved', 'tired': 'gave-up',
            'gap-a': 'gave-up', 'gap-b': 'session-gap'});
    });
    test('caps drop whole old sessions first, never the live one while others exist', () => {
        const big = n => Array.from({length: n}, () => ({}));
        const {keep, drop} = pruneBatches([
            batch({key: 'a', session: 'old', ops: big(MAX_OPS), createdAt: NOW - 3}),
            batch({key: 'b', session: 'live', ops: big(10), createdAt: NOW - 2}),
            batch({key: 'c', session: 'old', ops: big(5), createdAt: NOW - 1})
        ], {now: NOW, user: 'maya', liveSession: 'live'});
        expect(keep.map(b => b.key)).toEqual(['b']);
        expect(drop.map(d => [d.batch.key, d.reason])).toEqual([['a', 'over-cap'], ['c', 'over-cap']]);
    });
});

describe('api', () => {
    test('save headers', () => {
        const api = createRewindApi({host: 'h', getToken: async () => 't', getAccessKey: () => null, fetch: null});
        expect(api.saveHeaders({session: 's', baseRevision: 4})).toEqual({'X-Rewind-Session': 's', 'X-Rewind-Base-Revision': '4'});
        expect(api.saveHeaders({session: 's', baseRevision: 4, room: {id: 'r', generation: 9}})).toEqual({'X-Rewind-Room': 'r:9'});
    });
    test('postOps sends JSON with the JWT and throws on errors', async () => {
        const calls = [];
        const api = createRewindApi({host: 'https://api', getToken: async () => 'jwt', getAccessKey: () => 'k',
            fetch: async (url, init) => {
                calls.push({url, init});
                if (init.body.includes('fail')) return {ok: false, status: 409, json: async () => ({message: 'nope'})};
                return {ok: true, json: async () => ({accepted: 1})};
            }});
        expect(await api.postOps('5', {x: 1}, {gzip: false})).toEqual({accepted: 1});
        expect(calls[0].url).toBe('https://api/v1/projects/blocks/5/rewind/ops?access_key=k');
        expect(calls[0].init.headers.Authorization).toBe('Bearer jwt');
        await expect(api.postOps('5', {fail: 1}, {gzip: false})).rejects.toMatchObject({status: 409});
        await expect(api.postOps('5', {big: 'x'.repeat(70000)}, {keepalive: true})).rejects.toBeInstanceOf(RewindHttpError);
    });
    test('room generation strings map to stable non-negative safe integers', () => {
        const a = roomGenerationNumber('Ab3!x_9');
        expect(Number.isSafeInteger(a) && a >= 0).toBe(true);
        expect(roomGenerationNumber('Ab3!x_9')).toBe(a);
        expect(roomGenerationNumber('Ab3!x_8')).not.toBe(a);
        expect(roomGenerationNumber(7)).toBe(7);
    });
});

describe('flusher', () => {
    const setup = async (results, extra = {}) => {
        const vm = makeVm();
        await loadFixture(vm, 'rich-project.json');
        let t = NOW;
        const recorder = new RewindRecorder(vm, {session: 'live', now: () => (t += 3), log: quiet});
        recorder.start();
        const sent = [];
        const api = createRewindApi({host: 'h', getToken: async () => 't', getAccessKey: () => null,
            fetch: async (url, init) => {
                sent.push(JSON.parse(init.body));
                const r = results.length ? results.shift() : {accepted: 1};
                if (r instanceof Error) throw r;
                if (r.status) return {ok: false, status: r.status, json: async () => ({})};
                return {ok: true, json: async () => r};
            }});
        const queue = createQueue({backend: memoryBackend()});
        const stored = [];
        const flusher = new RewindFlusher(Object.assign({vm, recorder, api: Object.assign({}, api, {
            postOps: (id, body) => api.postOps(id, body, {gzip: false})
        }), queue, projectId: '1', user: 'maya', session: 'live', baseRevision: 2, now: () => t, log: quiet,
        storeAsset: async (a, m) => stored.push(m), schedule: () => null, unschedule: () => {}}, extra));
        return {vm, recorder, flusher, sent, queue, stored};
    };

    test('first flush after a save carries the base, head ids, revision; later ones do not', async () => {
        const {vm, flusher, sent, queue} = await setup([]);
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 3});
        vm.renameSprite(vm.runtime.targets[1].id, 'B');
        await flusher.afterSave({revision: 4});
        expect(sent).toHaveLength(2);
        expect(sent[0].base.v).toBe(1);
        expect(sent[0].saved_revision).toBe(3);
        expect(sent[0].head_ids[1].name).toBe('A');
        expect(sent[0].ops.map(o => o.k)).toEqual(['target.rename']);
        expect(sent[1].base).toBeNull();
        expect(sent[1].saved_revision).toBe(4);
        expect(flusher.saveHeaders()).toEqual({'X-Rewind-Session': 'live', 'X-Rewind-Base-Revision': '4'});
        expect(await queue.list('1')).toEqual([]);
    });

    test('network failure keeps the batch; the next flush sends both in order', async () => {
        const {vm, flusher, sent, queue} = await setup([new TypeError('offline')]);
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 3});
        expect((await queue.list('1'))).toHaveLength(1);
        vm.renameSprite(vm.runtime.targets[1].id, 'B');
        await flusher.afterSave({revision: 4});
        expect(sent.map(b => b.saved_revision)).toEqual([3, 3, 4]);
        expect(await queue.list('1')).toEqual([]);
    });

    test('a failed send is retried on a timer, before the next save', async () => {
        const timers = [];
        const {vm, flusher, sent, queue} = await setup([new TypeError('offline'), {status: 503}, {accepted: 1}],
            {schedule: (fn, ms) => timers.push({fn, ms}) && timers.length, unschedule: () => {}});
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 3});
        expect(sent).toHaveLength(1);
        expect(timers.map(x => x.ms)).toEqual([2000]);
        await timers.shift().fn();
        await flusher.sending;
        expect(timers.map(x => x.ms)).toEqual([10000]);
        await timers.shift().fn();
        await flusher.sending;
        expect(sent.map(b => b.saved_revision)).toEqual([3, 3, 3]);
        expect(await queue.list('1')).toEqual([]);
        expect(timers).toEqual([]);
        expect(flusher.retryCount).toBe(0);
    });

    test('need_base after a solo save sends the fresh base at once; 4xx drops; recording:false stops', async () => {
        const {vm, flusher, sent, recorder} = await setup([{accepted: 0, dropped: 1, need_base: true, stale: true}, {accepted: 0},
            {status: 413}, {recording: false}]);
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 3});
        expect(sent).toHaveLength(2);
        expect(sent[1].base).not.toBeNull();
        expect(sent[1].base.t).toBeGreaterThan(sent[0].base.t);
        expect(sent[1].saved_revision).toBe(3);
        expect(sent[1].ops).toEqual([]);
        expect(sent[1].base_forced).toBe(true);
        vm.renameSprite(vm.runtime.targets[1].id, 'B');
        await flusher.afterSave({revision: 5});
        expect(sent[2].base).toBeNull();
        expect(recorder.needsBase).toMatch(/refused:413/);
        let stopped = false;
        flusher.onStop = () => {
            stopped = true;
        };
        vm.renameSprite(vm.runtime.targets[1].id, 'C');
        await flusher.afterSave({revision: 6});
        expect(sent[3].base).not.toBeNull();
        expect(stopped).toBe(true);
        expect(flusher.saveHeaders()).toEqual({});
    });

    test('the immediate base after a stale save is sent once, even if the server asks again', async () => {
        const {vm, flusher, sent} = await setup([{need_base: true, dropped: 1, stale: true}, {need_base: true}, {accepted: 1}]);
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 3});
        expect(sent).toHaveLength(2);
        vm.renameSprite(vm.runtime.targets[1].id, 'B');
        await flusher.afterSave({revision: 4});
        expect(sent).toHaveLength(3);
        expect(sent[2].base).not.toBeNull();
    });

    test('saves without edits hold the base; the first edit sends it (the load-time one)', async () => {
        const {vm, flusher, sent, recorder} = await setup([{need_base: true}, {need_base: true}, {accepted: 1}]);
        const loadBase = recorder.base;
        await flusher.afterSave({revision: 3});
        await flusher.afterSave({revision: 4});
        expect(sent).toHaveLength(2);
        expect(sent.every(b => b.base === null && b.ops.length === 0)).toBe(true);
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 5});
        expect(sent).toHaveLength(3);
        expect(sent[2].base).toEqual(JSON.parse(JSON.stringify(loadBase)));
        expect(sent[2].base.t).toBe(loadBase.t);
        expect(sent[2].base_forced).toBe(false);
        expect(sent[2].ops.map(o => o.k)).toEqual(['target.rename']);
    });

    test('runtime.state alone is not an edit: held with the base, sent with the first edit', async () => {
        const {vm, flusher, sent} = await setup([{need_base: true}, {accepted: 2}]);
        vm.runtime.targets[1].setXY(123, 45);
        await flusher.afterSave({revision: 3});
        expect(sent[0].base).toBeNull();
        expect(sent[0].ops).toEqual([]);
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.afterSave({revision: 4});
        expect(sent[1].base).not.toBeNull();
        const kinds = sent[1].ops.map(o => o.k);
        expect(kinds).toContain('runtime.state');
        expect(kinds).toContain('target.rename');
        expect(kinds.indexOf('runtime.state')).toBeLessThan(kinds.indexOf('target.rename'));
    });

    test('a base for a lost change is forced: it goes without an edit', async () => {
        const {flusher, sent, recorder} = await setup([{accepted: 0}]);
        await flusher.afterSave({revision: 3});
        recorder.needsBase = 'dropped:expired';
        await flusher.afterSave({revision: 4});
        expect(sent[1].base).not.toBeNull();
        expect(sent[1].base_forced).toBe(true);
        expect(recorder.needsBase).toBeNull();
    });

    test('a room generation without edits sends nothing', async () => {
        const {flusher, sent} = await setup([]);
        flusher.setRoom({id: 'r', generation: 1});
        await flusher.flushNow();
        flusher.pagehide();
        expect(sent).toHaveLength(0);
    });

    test('a room flush answered need_base waits for the next flush (no immediate base)', async () => {
        const {vm, flusher, sent} = await setup([{accepted: 0}, {need_base: true}, {accepted: 1}]);
        flusher.setRoom({id: 'r', generation: 1});
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.flushNow();
        vm.renameSprite(vm.runtime.targets[1].id, 'B');
        await flusher.afterSave({revision: 3});
        expect(sent).toHaveLength(2);
    });

    test('assets referenced by ops are uploaded first; missing_assets are listed again', async () => {
        const {vm, flusher, sent, stored} = await setup([{accepted: 2, missing_assets: ['x.svg']}]);
        vm.setEditingTarget(vm.runtime.targets[1].id);
        await vm.addCostume('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg', {name: 'n', assetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            dataFormat: 'svg', md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg', rotationCenterX: 0, rotationCenterY: 0});
        await flusher.afterSave({revision: 3});
        expect(stored).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg']);
        expect(sent[0].assets).toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg');
        await flusher.afterSave({revision: 4});
        expect(sent[1].assets).toContain('x.svg');
    });

    test('room: flushNow sends room ops without a revision; joining starts a new base', async () => {
        const {vm, flusher, sent} = await setup([]);
        flusher.setRoom({id: 'r', generation: 2});
        expect(flusher.saveHeaders()).toEqual({'X-Rewind-Room': 'r:2'});
        vm.renameSprite(vm.runtime.targets[1].id, 'A');
        await flusher.flushNow();
        expect(sent[0]).toMatchObject({room: {id: 'r', generation: 2}, saved_revision: null});
        expect(sent[0].base.room).toEqual({id: 'r', generation: 2});
        E.flushMicrotasks();
    });
});

describe('vector shape diff', () => {
    const sh = (tag, x) => ({tag, attrs: {x}});
    test('seed, update, add, delete, reorder replay to the editor order', () => {
        const shapes = [sh('rect', 1), sh('circle', 2), sh('rect', 1)];
        assignShapeIds({costumeId: 'c', shapes, items: null, seeding: true, existing: null, clientId: 'q'});
        expect(new Set(shapes.map(s => s.id)).size).toBe(3);
        const first = diffShapes(null, shapes);
        expect(first.reset).toBe(true);
        const state = {v: 1, targets: [{id: 't', name: 'S', isStage: true, blocks: {}, variables: {}, comments: {}, costumes: [], sounds: []}]};
        const op = d => makeOp('art.vector', 't', d, {t: NOW});
        let s = applyOps(state, [op({costume: 'c', ops: first.ops, reset: true})]);
        const next = [Object.assign({}, shapes[1], {attrs: {x: 9}}), {tag: 'path', attrs: {d: 'M0'}}, shapes[0]];
        assignShapeIds({costumeId: 'c', shapes: next, items: null, seeding: false,
            existing: [...first.after].map(([id, signature]) => ({id, signature})), clientId: 'q'});
        const second = diffShapes(first.after, next);
        expect(second.reset).toBe(false);
        s = applyOps(s, [op({costume: 'c', ops: second.ops})]);
        expect(s.targets[0].art.c.order).toEqual(next.map(x => x.id));
        expect(s.targets[0].art.c.shapes[next[0].id].attrs.x).toBe(9);
        expect(Object.keys(s.targets[0].art.c.shapes)).toHaveLength(3);
        expect(diffShapes(second.after, next).ops).toEqual([]);
    });
});
