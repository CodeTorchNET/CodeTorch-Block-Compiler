import {makeVm, loadFixture} from './helpers/headless-vm';
import * as E from './helpers/editor';
import {RewindRecorder} from '../../../src/lib/rewind/recorder';
import {serializeState, loadStateIntoVm, diffCanonical, equalCanonical} from '../../../src/lib/rewind/state';
import {applyOps} from '../../../src/lib/rewind/apply';
import {restoreTo, applyOpsToVm} from '../../../src/lib/rewind/restore';

const quiet = {warn: () => {}, info: () => {}};
let clock = 1700000000000;
const now = () => (clock += 5);

const edits = vm => {
    const sprite = vm.runtime.targets[1];
    vm.setEditingTarget(sprite.id);
    const ids = E.createScript(vm, {group: 'c1'});
    E.typeInto(vm, ids.txt, 'TEXT', 'abc');
    E.move(vm, ids.hat, {x: 300, y: 10});
    const v = E.varCreate(vm, {varName: 'lives'});
    E.commentCreate(vm, {blockId: ids.move, text: 'hi'});
    vm.renameSprite(sprite.id, 'Hero');
    vm.postSpriteInfo({x: 50, y: 60, direction: 10});
    vm.renameCostume(0, 'pose');
    const old = Object.values(sprite.blocks._blocks).find(b => b.topLevel && b.id !== ids.hat);
    if (old) E.del(vm, old.id);
    return {ids, v};
};

describe('two clients, one room: no echo', () => {
    test('remote ops applied under suppress record nothing; both converge; merged timeline replays', async () => {
        const vmA = makeVm();
        await loadFixture(vmA, 'rich-project.json');
        const room = {id: 'room-1', generation: 1};
        const recA = new RewindRecorder(vmA, {session: 'A', room, now, log: quiet});
        const base = recA.start();
        const vmB = makeVm();
        await loadStateIntoVm(vmB, base);
        const recB = new RewindRecorder(vmB, {session: 'B', room, now, log: quiet});
        recB.start();
        expect(diffCanonical(serializeState(vmA), serializeState(vmB))).toEqual([]);

        edits(vmA);
        await E.flushMicrotasks();
        const opsA = recA.takeBatch().ops;
        expect(opsA.length).toBeGreaterThan(5);

        await recB.suppress('collab-remote', () => applyOpsToVm(vmB, opsA));
        expect(recB.takeBatch().ops).toEqual([]);
        expect(diffCanonical(serializeState(vmA), serializeState(vmB))).toEqual([]);

        const spriteB = vmB.runtime.targets[2];
        vmB.setEditingTarget(spriteB.id);
        E.createScript(vmB, {group: 'b1'});
        vmB.renameSprite(spriteB.id, 'Sidekick');
        const opsB = recB.takeBatch().ops;
        expect(opsB.map(o => o.k)).toEqual(['blocks.add', 'target.rename']);
        await recA.suppress('collab-remote', () => applyOpsToVm(vmA, opsB));
        expect(recA.takeBatch().ops).toEqual([]);

        const merged = opsA.concat(opsB).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
        const replayed = applyOps(base, merged);
        expect(diffCanonical(replayed, serializeState(vmA))).toEqual([]);
        expect(diffCanonical(replayed, serializeState(vmB))).toEqual([]);
    });
});

describe('restore', () => {
    test('deletes sprites without the remove-sprite-confirm prompt (addon wraps vm.deleteSprite)', async () => {
        const vm = makeVm();
        await loadFixture(vm, 'rich-project.json');
        const rec = new RewindRecorder(vm, {session: 's', now, log: quiet});
        rec.start();
        const before = serializeState(vm);
        const extra = await vm.duplicateSprite(vm.runtime.targets[1].id);
        void extra;
        expect(vm.runtime.targets.filter(t => t.isOriginal).length).toBe(before.targets.length + 1);
        const asked = [];
        const original = vm.deleteSprite;
        vm.deleteSprite = function (...args) {
            if (args.length > 1 && args[1] === false) return original.apply(this, args);
            asked.push(args[0]);
            return Promise.resolve();
        };
        const res = await restoreTo(vm, before, {recorder: rec, to: 1, labelUser: 'maya', now});
        expect(asked).toEqual([]);
        expect(res.broken).toEqual([]);
        expect(equalCanonical(serializeState(vm), before)).toBe(true);
        expect(res.ops.length).toBe(1);
        expect(res.ops[0].d.diff.some(o => o.k === 'target.delete')).toBe(true);
    });

    test('restoring to an earlier point of the session records one restore op and replays exactly', async () => {
        const vm = makeVm();
        await loadFixture(vm, 'rich-project.json');
        const rec = new RewindRecorder(vm, {session: 'S', now, log: quiet});
        const base = rec.start();
        edits(vm);
        const earlier = serializeState(vm);
        vm.renameSprite(vm.runtime.targets[1].id, 'Later');
        E.createScript(vm, {group: 'later'});
        const before = rec.takeBatch().ops;
        const res = await restoreTo(vm, earlier, {recorder: rec, to: 123, labelUser: 'maya', now});
        expect(res.broken).toEqual([]);
        expect(res.mismatches).toEqual([]);
        expect(res.ok).toBe(true);
        expect(equalCanonical(serializeState(vm), earlier)).toBe(true);
        const after = rec.takeBatch().ops;
        expect(after.map(o => o.k)).toEqual(['restore']);
        expect(after[0]).toMatchObject({source: 'restore', d: {to: 123, label_user: 'maya'}});
        const replayed = applyOps(base, before.concat(after));
        expect(diffCanonical(replayed, serializeState(vm))).toEqual([]);
        expect(rec.takeBatch({repair: true}).ops).toEqual([]);
        expect(rec.needsBase).toBeNull();
    });

    test('restoring to a chunk from another session (other id space) is canonically exact', async () => {
        const vm = makeVm();
        await loadFixture(vm, 'three-sprites-with-sound.json');
        const other = makeVm();
        await other.loadProject(vm.toJSON());
        const yesterday = serializeState(other);
        const rec = new RewindRecorder(vm, {session: 'S2', now, log: quiet});
        const base = rec.start();
        edits(vm);
        vm.deleteSprite(vm.runtime.targets[3].id);
        await E.flushMicrotasks();
        const res = await restoreTo(vm, yesterday, {recorder: rec, to: 1, now});
        expect(res.broken).toEqual([]);
        expect(res.mismatches).toEqual([]);
        const all = rec.takeBatch().ops;
        expect(all.filter(o => o.k === 'restore').length).toBeGreaterThan(0);
        expect(diffCanonical(applyOps(base, all), serializeState(vm))).toEqual([]);
        expect(vm.runtime.getTargetForStage().id).toBe(base.targets[0].id);
    });
});
