import {makeVm, loadFixture} from './helpers/headless-vm';
import {
    serializeState, stateToSb3, loadStateIntoVm, canonicalize, equalCanonical, diffCanonical,
    cloneState, readRuntimeFields
} from '../../../src/lib/rewind/state';

const FIXTURES = ['rich-project.json', 'big-project.json', 'raster-project.json', 'pen-project.json',
    'three-sprites-with-sound.json', 'folder-named-like-its-sprite.json', 'rich-project-8.json'];

const loadAny = async name => {
    const vm = makeVm();
    await loadFixture(vm, name);
    return vm;
};

const strip = s => {
    const c = cloneState(s);
    delete c.t;
    return c;
};

describe('serializeState / stateToSb3 / loadStateIntoVm', () => {
    const names = FIXTURES;
    test.each(names)('%s round-trips exactly, ids included', async name => {
        const vm = await loadAny(name);
        const a = serializeState(vm, {t: 1, session: 's'});
        expect(JSON.parse(JSON.stringify(a))).toEqual(a);
        for (const t of a.targets) for (const id of Object.keys(t.blocks)) expect(t.blocks[id].id).toBe(id);
        const vm2 = makeVm();
        await loadStateIntoVm(vm2, a);
        const b = serializeState(vm2, {t: 1, session: 's'});
        expect(strip(b)).toEqual(strip(a));
    });

    test.each(names)('%s is canonically equal after a real save + reload (compressed ids)', async name => {
        const vm = await loadAny(name);
        const a = serializeState(vm);
        const vm2 = makeVm();
        await vm2.loadProject(vm.toJSON());
        const b = serializeState(vm2);
        expect(b.targets[0].id).not.toBe(a.targets[0].id);
        expect(diffCanonical(a, b)).toEqual([]);
        expect(equalCanonical(a, b)).toBe(true);
    });
});

describe('canonicalize', () => {
    let base;
    beforeAll(async () => {
        base = serializeState(await loadAny('rich-project.json'));
    });

    test('is stable and ignores t/session/room', () => {
        const b = cloneState(base);
        b.t = 99;
        b.session = 'other';
        b.room = {id: 'r', generation: 3};
        expect(JSON.stringify(canonicalize(base))).toBe(JSON.stringify(canonicalize(b)));
    });

    test('notices a field edit, a moved script, a variable value, a costume rename', () => {
        const sprite = base.targets[1];
        const withField = cloneState(base);
        const fieldBlock = Object.values(withField.targets[1].blocks).find(b => Object.keys(b.fields).length);
        const fname = Object.keys(fieldBlock.fields)[0];
        fieldBlock.fields[fname].value = 'changed!';
        expect(equalCanonical(base, withField)).toBe(false);
        expect(diffCanonical(base, withField).length).toBeGreaterThan(0);

        const moved = cloneState(base);
        const top = Object.values(moved.targets[1].blocks).find(b => b.topLevel);
        top.x += 50;
        expect(equalCanonical(base, moved)).toBe(false);

        const val = cloneState(base);
        const varId = Object.keys(val.targets[0].variables)[0];
        if (varId) {
            val.targets[0].variables[varId].value = 'something else';
            expect(equalCanonical(base, val)).toBe(false);
        }

        const renamed = cloneState(base);
        renamed.targets[1].costumes[0].name = 'nope';
        expect(equalCanonical(base, renamed)).toBe(false);
        expect(sprite).toBe(base.targets[1]);
    });

    test('does not compare shadow ids', () => {
        const b = cloneState(base);
        const t = b.targets[1];
        const map = {};
        for (const id of Object.keys(t.blocks)) if (t.blocks[id].shadow) map[id] = `${id}-renamed`;
        const remap = id => (map[id] || id);
        const blocks = {};
        for (const id of Object.keys(t.blocks)) {
            const blk = t.blocks[id];
            blk.id = remap(id);
            blk.parent = blk.parent && remap(blk.parent);
            blk.next = blk.next && remap(blk.next);
            for (const n of Object.keys(blk.inputs)) {
                const input = blk.inputs[n];
                input.block = input.block && remap(input.block);
                input.shadow = input.shadow && remap(input.shadow);
            }
            blocks[remap(id)] = blk;
        }
        t.blocks = blocks;
        expect(Object.keys(map).length).toBeGreaterThan(0);
        expect(diffCanonical(base, b)).toEqual([]);
    });

    test('readRuntimeFields lists positions and values but not broadcasts', () => {
        const r = readRuntimeFields(base);
        const sprite = base.targets[1];
        expect(r.targets[sprite.id].x).toBe(sprite.x);
        for (const t of base.targets) {
            for (const id of Object.keys(t.variables)) {
                if (t.variables[id].type === 'broadcast_msg') expect(r.targets[t.id].vars[id]).toBeUndefined();
                else expect(r.targets[t.id].vars[id]).toEqual(t.variables[id].value);
            }
        }
    });

    test('stateToSb3 writes blocks in object form only (no compressed primitives)', () => {
        const sb3 = stateToSb3(base);
        for (const t of sb3.targets) {
            for (const id of Object.keys(t.blocks)) expect(Array.isArray(t.blocks[id])).toBe(false);
        }
    });
});

describe('Advanced blocks / PenguinMod data (ct-pm side-car)', () => {
    test('a sprite with an up-down rotation style and a kept custom value survives a rewind restore', async () => {
        const vm = makeVm();
        const project = {
            targets: [
                {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
                    currentCostume: 0, costumes: [{name: 'b', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg',
                        rotationCenterX: 0, rotationCenterY: 0}], sounds: [], volume: 100},
                {isStage: false, name: 'S', id: 'pm-id', rotationStyle: 'up-down', x: 0, y: 0, size: 100,
                    direction: 90, visible: true, draggable: false, currentCostume: 0, volume: 100, layerOrder: 1,
                    variables: {v1: ['arr', {customType: true, typeId: 'jwArray', serialized: '[1,2]'}, null]},
                    lists: {}, broadcasts: {}, blocks: {}, comments: {},
                    costumes: [{name: 'c', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg',
                        rotationCenterX: 0, rotationCenterY: 0}], sounds: []}
            ],
            monitors: [],
            extensions: [],
            meta: {semver: '3.0.0', platform: {name: 'PenguinMod'}}
        };
        await vm.loadProject(JSON.stringify(project));
        const state = serializeState(vm, {t: 1, session: 's'});
        const sprite = state.targets.find(t => t.name === 'S');
        expect(sprite.ctPm.rotationStyle).toBe('up-down');
        const sb3 = stateToSb3(state);
        expect(sb3.targets[1].rotationStyle).toBe('all around');
        const vm2 = makeVm();
        await loadStateIntoVm(vm2, state);
        const restored = vm2.runtime.targets.find(t => t.isOriginal && t.getName() === 'S');
        expect(restored.rotationStyle).toBe('up-down');
        const saved = JSON.parse(vm2.toJSON()).targets.find(t => t.name === 'S');
        expect(saved.ctPm.values.variables.v1.original).toEqual({customType: true, typeId: 'jwArray', serialized: '[1,2]'});
    });
});
