import {makeVm, loadFixture} from './helpers/headless-vm';
import * as E from './helpers/editor';
import {RewindRecorder} from '../../../src/lib/rewind/recorder';
import {serializeState, diffCanonical, cloneState} from '../../../src/lib/rewind/state';
import {applyOps} from '../../../src/lib/rewind/apply';
import {validateOp} from '../../../src/lib/rewind/ops';

const quiet = {warn: () => {}, info: () => {}};

const strip = s => {
    const c = cloneState(s);
    delete c.t;
    delete c.session;
    for (const t of c.targets) delete t.art;
    return c;
};

const harness = async (fixture, opts = {}) => {
    const vm = makeVm();
    await loadFixture(vm, fixture);
    let t = 1700000000000;
    const rec = new RewindRecorder(vm, Object.assign({session: 's1', now: () => (t += 7), log: quiet}, opts));
    const base = rec.start();
    const all = [];
    const step = async (name, fn) => {
        await fn();
        await E.flushMicrotasks();
        const {ops} = rec.takeBatch({repair: false});
        ops.forEach(o => expect(validateOp(o)).toBeNull());
        all.push(...ops);
        if (process.env.RWDBG) console.log(name, JSON.stringify(ops.map(o => [o.k, o.tg, o.d.id])));
        const replayed = applyOps(base, all);
        const live = serializeState(vm);
        const diff = diffCanonical(replayed, live);
        if (process.env.RWDBG) console.log(name, JSON.stringify(ops.map(o => [o.k, o.tg, o.d.id])));
        if (diff.length) throw new Error(`after "${name}" replay != live:\n${diff.join('\n')}`);
        expect(strip(replayed)).toEqual(strip(live));
        return ops;
    };
    return {vm, rec, base, all, step};
};

describe('recorder: replaying what it recorded reproduces the live VM', () => {
    test('blocks: create, type (coalesced), move, attach, delete', async () => {
        const {vm, rec, step} = await harness('rich-project.json');
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        let ids;
        const created = await step('create', () => {
            ids = E.createScript(vm, {group: 'g-create'});
        });
        expect(created.map(o => o.k)).toEqual(['blocks.add']);
        expect(created[0].g).toBe('g-create');
        const typed = await step('type', () => E.typeInto(vm, ids.txt, 'TEXT', 'hello world'));
        expect(typed).toHaveLength(1);
        expect(typed[0].d.props['["fields","TEXT","value"]']).toBe('hello world');
        expect(rec.stats.coalesced).toBe(10);
        const typedTwice = await step('type twice', () => {
            E.typeInto(vm, ids.num, 'NUM', '42');
            E.typeInto(vm, ids.num, 'NUM', '7');
        });
        expect(typedTwice).toHaveLength(2);
        await step('detach say to top level', () => E.move(vm, ids.say, {oldParentId: ids.move, x: 300, y: 40}));
        await step('reattach', () => E.move(vm, ids.say, {newParentId: ids.move, x: undefined}));
        await step('drag whole script', () => E.move(vm, ids.hat, {x: 90, y: 91}));
        await step('delete say (cascade, shadow)', () => {
            E.move(vm, ids.say, {oldParentId: ids.move, x: 1, y: 2, group: 'del-1'});
            E.del(vm, ids.say, 'del-1');
        });
        await step('delete existing project script', () => {
            const top = Object.values(sprite.blocks._blocks).find(b => b.topLevel && b.id !== ids.hat);
            E.del(vm, top.id);
        });
        expect(rec.stats.suppressed).toBe(0);
    });

    test('variables, comments, renames', async () => {
        const {vm, step} = await harness('rich-project.json');
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        let gv;
        let lv;
        let ids;
        await step('global var', () => {
            gv = E.varCreate(vm, {varName: 'points'});
        });
        await step('local list', () => {
            lv = E.varCreate(vm, {varName: 'stuff', varType: 'list', isLocal: true});
        });
        await step('rename global', () => E.varRename(vm, gv, 'score2'));
        await step('script + block comment', () => {
            ids = E.createScript(vm);
            E.commentCreate(vm, {blockId: ids.move, text: 'moves'});
        });
        let wc;
        await step('workspace comment', () => {
            wc = E.commentCreate(vm, {text: 'free'});
        });
        await step('comment edits', () => {
            E.commentChange(vm, wc, {text: 'changed'});
            E.commentChange(vm, wc, {minimized: true});
            E.commentMove(vm, wc, 77, 88);
        });
        await step('comment delete', () => E.commentDelete(vm, wc));
        await step('delete block with comment', () => {
            E.move(vm, ids.move, {oldParentId: ids.hat, x: 0, y: 0, group: 'x'});
            E.del(vm, ids.move, 'x');
        });
        await step('var delete', () => {
            E.varDelete(vm, lv);
        });
        await step('rename sprite', () => vm.renameSprite(sprite.id, 'Kitty'));
        await step('rename costume and sound', () => {
            vm.renameCostume(0, 'first');
            if (vm.editingTarget.getSounds().length) vm.renameSound(0, 'beep');
        });
    });

    test('costumes, sounds, sprite props, order', async () => {
        const {vm, step, all} = await harness('rich-project.json');
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        await step('drag sprite on stage (coalesced)', () => {
            for (let i = 0; i < 10; i++) vm.postSpriteInfo({x: i * 3, y: i * -2});
        });
        expect(all.filter(o => o.k === 'target.props')).toHaveLength(1);
        await step('sprite info panel', () => vm.postSpriteInfo({direction: 45, visible: false, size: 150}));
        await step('add costume', () => vm.addCostume('cd21514d0531fdffb22204e0ec5ed84a.svg', {
            name: 'new one', assetId: 'cd21514d0531fdffb22204e0ec5ed84a', dataFormat: 'svg',
            md5: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 1, rotationCenterY: 2, bitmapResolution: 1
        }));
        await step('reorder costume', () => vm.reorderCostume(sprite.id, 0, 2));
        await step('select costume', () => vm.editingTarget.setCostume(1));
        await step('delete costume', () => vm.deleteCostume(0));
        await step('reorder sound', () => vm.reorderSound(sprite.id, 0, 1));
        await step('delete sound', () => vm.deleteSound(0));
        await step('reorder sprites', () => vm.reorderTarget(1, 3));
    });

    test('sprites: duplicate, import with a hint, delete, backpack share', async () => {
        const {vm, rec, step} = await harness('three-sprites-with-sound.json');
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        const dup = await step('duplicate', () => {
            rec.hintSource('sprite', 'duplicate');
            return vm.duplicateSprite(sprite.id);
        });
        expect(dup.filter(o => o.k === 'target.add').map(o => o.source)).toEqual(['duplicate']);
        const spriteJson = JSON.stringify(Object.assign(serializeState(vm).targets[1], {}));
        const lib = await step('library sprite', () => {
            rec.hintSource('sprite', 'library');
            const st = serializeState(vm).targets[1];
            const {targetToSb3} = require('../../../src/lib/rewind/state');
            const json = targetToSb3(st);
            json.name = 'FromLibrary';
            return vm.addSprite(JSON.stringify(json));
        });
        expect(lib.find(o => o.k === 'target.add').source).toBe('library');
        expect(spriteJson.length).toBeGreaterThan(0);
        await step('delete sprite', () => vm.deleteSprite(vm.runtime.targets[2].id));
        const shared = await step('backpack drop', () => {
            rec.hintSource('share', 'backpack', {targetId: sprite.id});
            return vm.shareBlocksToTarget([
                {id: 'bp1', opcode: 'looks_hide', inputs: {}, fields: {}, next: null, parent: null, shadow: false,
                    topLevel: true, x: 5, y: 5}
            ], sprite.id);
        });
        expect(shared.map(o => o.source)).toEqual(['backpack']);
    });

    test('torchy group, extensions, fonts, monitors', async () => {
        const {vm, step} = await harness('rich-project.json');
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        const torchy = await step('torchy insert', () => {
            E.varCreate(vm, {varName: 'tvar', group: 'torchy:abc'});
            E.createScript(vm, {group: 'torchy:abc'});
        });
        expect(torchy.every(o => o.source === 'torchy' && o.actor === 'torchy')).toBe(true);
        expect(torchy.map(o => o.k).sort()).toEqual(['blocks.add', 'var.add']);
        const ext = await step('pen extension', () => vm.extensionManager.loadExtensionIdSync('pen'));
        expect(ext.map(o => o.k)).toEqual(['ext.add']);
        await step('system font', () => vm.runtime.fontManager.addSystemFont('Comic Sans MS', 'cursive'));
        await step('delete font', () => vm.runtime.fontManager.deleteFont(0));
        await step('show variable monitor', () => {
            const stageVar = Object.values(vm.runtime.getTargetForStage().variables).find(v => v.type === '');
            vm.runtime.monitorBlocks.changeBlock({id: stageVar.id, element: 'checkbox', value: true}, vm.runtime);
            vm.runtime._step();
        });
    });

    test('painting: shape ops per stroke, the asset only at the keyframe', async () => {
        const {vm, rec, step} = await harness('rich-project.json', {keyframeEvery: 3});
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        const svg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="10"><rect width="${n}" height="10"/></svg>`;
        const stroke = (shapes, n) => {
            rec.onArt({targetId: sprite.id, costumeIndex: 0, view: {width: 10}, shapes, items: null});
            vm.updateSvg(0, svg(n), 5, 5);
        };
        const painted = await step('two strokes, tab left', () => {
            stroke([{tag: 'rect', attrs: {w: 1}}], 11);
            stroke([{tag: 'rect', attrs: {w: 1}}, {tag: 'circle', attrs: {r: 2}}], 12);
            rec.paintEditorClosed();
        });
        expect(painted.map(o => o.k)).toEqual(['art.vector', 'art.vector', 'costume.update', 'art.keyframe']);
        expect(painted[0].d.reset).toBe(true);
        expect(painted[1].d.ops.map(o => o.op)).toEqual(['add']);
        const md5 = painted[2].d.data.md5ext;
        expect(painted[3].d).toMatchObject({costume: sprite.getCostumes()[0].id, md5ext: md5, format: 'svg'});
        expect(rec.assetRefs.has(md5)).toBe(true);
        const third = await step('keyframe every 3 art ops', () => {
            stroke([{tag: 'rect', attrs: {w: 2}}], 13);
            stroke([{tag: 'rect', attrs: {w: 3}}], 14);
            stroke([{tag: 'rect', attrs: {w: 4}}], 15);
        });
        expect(third.map(o => o.k)).toEqual(['art.vector', 'art.vector', 'art.vector', 'costume.update', 'art.keyframe']);
        const bitmap = await step('a bitmap op is recorded as is; a huge one only forces a keyframe', () => {
            rec.onArt({targetId: sprite.id, costumeIndex: 1, op: {kind: 'brush', points: [[1, 2]]}});
            rec.onArt({targetId: sprite.id, costumeIndex: 1, op: {kind: 'image', png: 'x'.repeat(300000)}});
        });
        expect(bitmap.map(o => o.k)).toEqual(['art.bitmap', 'costume.update', 'art.keyframe']);
        expect(bitmap[2].d.format).toBe('svg');
    });

    test('runtime state: a run records nothing by itself; the next flush carries what it changed', async () => {
        const {vm, step} = await harness('rich-project.json');
        const ops = await step('run', () => E.runFrames(vm, 30));
        const runtimeOps = ops.filter(o => o.k === 'runtime.state');
        expect(runtimeOps.map(o => [o.source, o.g])).toEqual([['runtime', 'runtime:flush']]);
    });

});

describe('recorder: echo guard', () => {
    test('nothing is recorded inside suppress (sync and async), probes suppress too', async () => {
        const {vm, rec, all} = await harness('rich-project.json', {shadow: false});
        const sprite = vm.runtime.targets[1];
        vm.setEditingTarget(sprite.id);
        rec.suppress('collab-remote', () => {
            E.createScript(vm);
            vm.renameSprite(sprite.id, 'Remote');
        });
        await rec.suppress('load', async () => {
            await E.flushMicrotasks();
            vm.postSpriteInfo({x: 99});
        });
        let remote = true;
        const off = rec.addSuppressionProbe(() => remote);
        vm.renameSprite(sprite.id, 'Remote2');
        remote = false;
        off();
        const mine = rec.takeBatch({repair: false}).ops;
        expect(mine).toEqual([]);
        expect(all).toEqual([]);
        expect(rec.stats.suppressed).toBeGreaterThan(0);
        vm.renameSprite(sprite.id, 'Local');
        expect(rec.takeBatch({repair: false}).ops.map(o => [o.k, o.d.name])).toEqual([['target.rename', 'Local']]);
    });

    test('solo: an unexplained suppressed change forces a new base', async () => {
        const {vm, rec} = await harness('rich-project.json');
        rec.suppress('something', () => vm.renameSprite(vm.runtime.targets[1].id, 'X'));
        expect(rec.needsBase).toBe('suppressed:something');
    });
});
