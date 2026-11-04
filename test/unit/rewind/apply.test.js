import {makeOp, validateOp, uuidv4, RewindOpError, OP_KINDS, MAX_OP_BYTES} from '../../../src/lib/rewind/ops';
import {applyOp, applyOps, applyOpInPlace, RewindApplyError} from '../../../src/lib/rewind/apply';
import {cloneState, equalCanonical} from '../../../src/lib/rewind/state';
import {diffStates, diffRuntime} from '../../../src/lib/rewind/diff';
import {readRuntimeFields} from '../../../src/lib/rewind/state';

const blk = (id, opcode, extra = {}) => Object.assign({
    id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false
}, extra);

const base = () => ({
    v: 1, t: 1, session: 's', room: null,
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
            sounds: [{id: 's1', name: 'meow', assetId: 'm', dataFormat: 'wav', md5ext: 'm.wav', rate: 22050, sampleCount: 100}]}
    ],
    monitors: [], extensions: [], fonts: [], meta: {}
});

const op = (k, tg, d, o) => makeOp(k, tg, d, o);

describe('ops', () => {
    test('makeOp fills the envelope and validates', () => {
        const o = op('blocks.delete', 'cat', {id: 'hat'});
        expect(o.actor).toBe('self');
        expect(o.source).toBe('editor');
        expect(validateOp(o)).toBeNull();
        expect(op('blocks.delete', 'cat', {id: 'x'}, {source: 'torchy'}).actor).toBe('torchy');
        expect(op('blocks.delete', 'cat', {id: 'x'}, {g: 'torchy:1'}).g).toBe('torchy:1');
    });
    test('rejects bad envelopes and payloads', () => {
        expect(() => op('nope', 'cat', {})).toThrow(RewindOpError);
        expect(() => op('blocks.update', 'cat', {id: 'x'})).toThrow(/props/);
        expect(() => op('blocks.update', null, {id: 'x', props: {}})).toThrow(/needs tg/);
        expect(() => op('blocks.delete', 'cat', {id: 'x'}, {source: 'hacker'})).toThrow(/source/);
        const big = {};
        big.b = blk('b', 'looks_say', {fields: {X: {name: 'X', value: 'x'.repeat(MAX_OP_BYTES)}}});
        expect(() => op('blocks.add', 'cat', {blocks: big})).toThrow(/larger/);
        expect(validateOp({...op('blocks.delete', 'cat', {id: 'x'}), id: 'not-a-uuid'})).toMatch(/uuid/);
    });
    test('uuidv4 looks like one', () => {
        expect(uuidv4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
    test('every kind has a handler', () => {
        for (const k of OP_KINDS) {
            expect(() => applyOpInPlace(base(), {k, tg: 'cat', d: {}})).not.toThrow(/unknown op kind/);
        }
    });
});

describe('applyOp', () => {
    test('is pure', () => {
        const s = base();
        const before = JSON.stringify(s);
        const o = op('blocks.update', 'cat', {id: 'num', props: {'["fields","NUM","value"]': '20'}});
        const oBefore = JSON.stringify(o);
        const s2 = applyOp(s, o);
        expect(JSON.stringify(s)).toBe(before);
        expect(JSON.stringify(o)).toBe(oBefore);
        expect(s2.targets[1].blocks.num.fields.NUM.value).toBe('20');
        s2.targets[1].blocks.num.fields.NUM.value = 'x';
        expect(JSON.stringify(o)).toBe(oBefore);
    });

    test('blocks.add skips existing ids, normalises, and blocks.delete cascades like the VM', () => {
        let s = base();
        s = applyOp(s, op('blocks.add', 'cat', {blocks: {
            hat: blk('hat', 'WRONG'),
            say: {id: 'say', opcode: 'looks_say', inputs: {}, fields: {}}
        }}));
        expect(s.targets[1].blocks.hat.opcode).toBe('event_whenflagclicked');
        expect(s.targets[1].blocks.say).toEqual(blk('say', 'looks_say'));
        s = applyOp(s, op('comment.add', 'cat', {id: 'cm', data: {blockId: 'move', x: 1, y: 2, width: 3, height: 4, minimized: false, text: 'hi'}}));
        expect(s.targets[1].blocks.move.comment).toBe('cm');
        s = applyOp(s, op('blocks.delete', 'cat', {id: 'hat'}));
        expect(Object.keys(s.targets[1].blocks)).toEqual(['say']);
        expect(s.targets[1].comments).toEqual({});
        expect(applyOp(s, op('blocks.delete', 'cat', {id: 'gone'}))).toEqual(s);
    });

    test('blocks.delete does not detach from the parent (VM semantics); raw deletes one entry', () => {
        const s = applyOp(base(), op('blocks.delete', 'cat', {id: 'move'}));
        expect(s.targets[1].blocks.hat.next).toBe('move');
        expect(s.targets[1].blocks.num).toBeUndefined();
        const r = applyOp(base(), op('blocks.delete', 'cat', {id: 'move', raw: true}));
        expect(r.targets[1].blocks.num).toBeDefined();
    });

    test('blocks.update applies plain and JSON-path keys (move payload)', () => {
        const s = applyOp(base(), op('blocks.update', 'cat', {id: 'hat', props: {next: null}}));
        const s2 = applyOp(s, op('blocks.update', 'cat', {id: 'move', props: {parent: null, topLevel: true, x: 5, y: 6}}));
        expect(s2.targets[1].blocks.move).toMatchObject({parent: null, topLevel: true, x: 5, y: 6});
        const s3 = applyOp(s2, op('blocks.update', 'cat', {id: 'hat', props: {
            '["inputs","SUB","name"]': 'SUB', '["inputs","SUB","block"]': 'move', '["inputs","SUB","shadow"]': null
        }}));
        expect(s3.targets[1].blocks.hat.inputs.SUB).toEqual({name: 'SUB', block: 'move', shadow: null});
        expect(() => applyOp(s3, op('blocks.update', 'cat', {id: 'nope', props: {x: 1}}))).toThrow(RewindApplyError);
    });

    test('blocks.deleteInput and blocks.set', () => {
        const s = applyOp(base(), op('blocks.deleteInput', 'cat', {id: 'move', inputName: 'STEPS'}));
        expect(s.targets[1].blocks.move.inputs).toEqual({});
        const s2 = applyOp(s, op('blocks.set', 'cat', {blocks: {a: {opcode: 'x'}}}));
        expect(s2.targets[1].blocks).toEqual({a: blk('a', 'x')});
    });

    test('variables', () => {
        let s = applyOp(base(), op('var.add', 'cat', {id: 'l', type: 'list', data: {name: 'items'}}));
        expect(s.targets[1].variables.l).toEqual({id: 'l', name: 'items', type: 'list', value: [], isCloud: false});
        s = applyOp(s, op('var.add', 'cat', {id: 'b', type: 'broadcast_msg', data: {name: 'go'}}));
        expect(s.targets[1].variables.b.value).toBe('go');
        s = applyOp(s, op('var.update', 'cat', {id: 'l', type: 'list', data: {name: 'things'}}));
        expect(s.targets[1].variables.l.name).toBe('things');
        s = applyOp(s, op('var.delete', 'cat', {id: 'l'}));
        expect(s.targets[1].variables.l).toBeUndefined();
        expect(() => applyOp(s, op('var.update', 'cat', {id: 'l', data: {name: 'x'}}))).toThrow(RewindApplyError);
    });

    test('costumes and sounds: add at index, update, delete, reorder', () => {
        let s = applyOp(base(), op('costume.add', 'cat', {id: 'k3', index: 1, data: {name: 'c3', assetId: 'd', dataFormat: 'svg', md5ext: 'd.svg', rotationCenterX: 0, rotationCenterY: 0, bitmapResolution: 1}}));
        expect(s.targets[1].costumes.map(c => c.id)).toEqual(['k1', 'k3', 'k2']);
        s = applyOp(s, op('costume.update', 'cat', {id: 'k3', data: {name: 'renamed', md5ext: 'e.svg', assetId: 'e'}}));
        expect(s.targets[1].costumes[1]).toMatchObject({name: 'renamed', md5ext: 'e.svg'});
        s = applyOp(s, op('costume.reorder', 'cat', {order: ['k2', 'k1', 'k3']}));
        expect(s.targets[1].costumes.map(c => c.id)).toEqual(['k2', 'k1', 'k3']);
        expect(() => applyOp(s, op('costume.reorder', 'cat', {order: ['k2', 'k1']}))).toThrow(RewindApplyError);
        expect(() => applyOp(s, op('costume.reorder', 'cat', {order: ['k2', 'k1', 'zz']}))).toThrow(RewindApplyError);
        s = applyOp(s, op('costume.delete', 'cat', {id: 'k1'}));
        expect(s.targets[1].costumes.map(c => c.id)).toEqual(['k2', 'k3']);
        s = applyOp(s, op('sound.update', 'cat', {id: 's1', data: {name: 'purr'}}));
        expect(s.targets[1].sounds[0].name).toBe('purr');
        expect(() => applyOp(s, op('sound.update', 'cat', {id: 'zz', data: {name: 'x'}}))).toThrow(RewindApplyError);
    });

    test('targets: add / rename / order / props / delete', () => {
        const dog = {id: 'dog', name: 'Dog', isStage: false, costumes: [], sounds: []};
        let s = applyOp(base(), op('target.add', null, {target: dog}, {source: 'library'}));
        expect(s.targets.map(t => t.id)).toEqual(['stage', 'cat', 'dog']);
        expect(s.targets[2].blocks).toEqual({});
        expect(() => applyOp(s, op('target.add', null, {target: dog}))).toThrow(RewindApplyError);
        s = applyOp(s, op('target.rename', 'dog', {name: 'Puppy'}));
        s = applyOp(s, op('target.order', null, {order: ['stage', 'dog', 'cat'], layers: {dog: 2}}));
        expect(s.targets.map(t => t.name)).toEqual(['Stage', 'Puppy', 'Cat']);
        expect(s.targets[1].layerOrder).toBe(2);
        s = applyOp(s, op('target.props', 'cat', {x: 50, y: -3, bogus: 1}));
        expect(s.targets[2]).toMatchObject({x: 50, y: -3});
        expect(s.targets[2].bogus).toBeUndefined();
        s = applyOp(s, op('target.delete', 'dog', {id: 'dog'}));
        expect(s.targets.map(t => t.id)).toEqual(['stage', 'cat']);
        expect(() => applyOp(s, op('target.delete', 'stage', {id: 'stage'}))).toThrow(RewindApplyError);
        expect(() => applyOp(s, op('target.rename', 'nope', {name: 'x'}))).toThrow(RewindApplyError);
    });

    test('monitors, extensions, fonts, runtime.state, restore, system kinds', () => {
        let s = applyOp(base(), op('monitor.set', null, {monitors: {v1: {mode: 'default', opcode: 'data_variable', visible: true}}}));
        expect(s.monitors).toEqual([{id: 'v1', mode: 'default', opcode: 'data_variable', visible: true}]);
        s = applyOp(s, op('monitor.set', null, {monitors: {v1: null}}));
        expect(s.monitors).toEqual([]);
        s = applyOps(s, [op('ext.add', null, {id: 'pen'}), op('ext.add', null, {id: 'pen'}), op('ext.add', null, {id: 'x', url: 'https://x'})]);
        expect(s.extensions).toEqual([{id: 'pen'}, {id: 'x', url: 'https://x'}]);
        s = applyOp(s, op('ext.remove', null, {id: 'pen'}));
        s = applyOps(s, [op('font.add', null, {system: true, family: 'Comic', fallback: 'cursive'}),
            op('font.add', null, {system: false, family: 'comic', fallback: 'x', md5ext: 'f.ttf'})]);
        expect(s.fonts).toEqual([{system: false, family: 'comic', fallback: 'x', md5ext: 'f.ttf'}]);
        s = applyOp(s, op('font.delete', null, {family: 'COMIC'}));
        expect(s.fonts).toEqual([]);
        s = applyOp(s, op('runtime.state', null, {targets: {cat: {x: 9, vars: {}}, stage: {vars: {v1: 42}}}}, {source: 'runtime'}));
        expect(s.targets[1].x).toBe(9);
        expect(s.targets[0].variables.v1.value).toBe(42);
        expect(() => applyOp(s, op('runtime.state', null, {targets: {zz: {x: 1}}}))).toThrow(RewindApplyError);
        const r = op('restore', null, {to: 5, label_user: 'me', diff: [op('target.props', 'cat', {x: 1}), op('target.rename', 'cat', {name: 'Kitty'})]}, {source: 'restore'});
        s = applyOp(s, r);
        expect(s.targets[1]).toMatchObject({x: 1, name: 'Kitty'});
        const same = applyOps(s, [op('system.unknown', null, {reason: 'x'}), op('system.replaced', null, {by_session: 'a', revision: 3}),
            op('art.bitmap', 'cat', {costume: 'k2', op: {tool: 'brush'}}), op('art.keyframe', 'cat', {costume: 'k2', md5ext: 'q.png', format: 'png'})]);
        expect(same).toEqual(s);
    });

    test('art.vector maintains the per-costume doc', () => {
        let s = applyOp(base(), op('art.vector', 'cat', {costume: 'k1', ops: [
            {op: 'add', id: 'a', shape: {d: 1}}, {op: 'add', id: 'b', shape: {d: 2}}, {op: 'add', id: 'c', shape: {d: 3}, index: 0}]}));
        expect(s.targets[1].art.k1).toEqual({order: ['c', 'a', 'b'], shapes: {a: {d: 1}, b: {d: 2}, c: {d: 3}}});
        s = applyOp(s, op('art.vector', 'cat', {costume: 'k1', ops: [{op: 'update', id: 'a', shape: {d: 9}}, {op: 'delete', id: 'b'}, {op: 'reorder', order: ['a', 'c']}]}));
        expect(s.targets[1].art.k1).toEqual({order: ['a', 'c'], shapes: {a: {d: 9}, c: {d: 3}}});
        s = applyOp(s, op('costume.delete', 'cat', {id: 'k1'}));
        expect(s.targets[1].art.k1).toBeUndefined();
    });
});

describe('diffStates', () => {
    const mutate = s => {
        const t = s.targets[1];
        t.blocks.move.inputs.STEPS.block = 'rep';
        t.blocks.rep = blk('rep', 'operator_add', {parent: 'move'});
        delete t.blocks.hat.x;
        t.blocks.hat.topLevel = true;
        t.variables.lv = {id: 'lv', name: 'mine', type: '', value: 3, isCloud: false};
        s.targets[0].variables.v1.value = 7;
        t.costumes.reverse();
        t.costumes[0].name = 'flipped';
        t.costumes.push({id: 'k9', name: 'new', assetId: 'n', dataFormat: 'svg', md5ext: 'n.svg', rotationCenterX: 0, rotationCenterY: 0, bitmapResolution: 1});
        t.sounds = [];
        t.x = 33;
        t.name = 'Kat';
        s.targets.push({id: 'dog', name: 'Dog', isStage: false, layerOrder: 2, currentCostume: 0, volume: 100,
            blocks: {d: blk('d', 'looks_hide', {topLevel: true, x: 0, y: 0})}, variables: {}, comments: {}, costumes: [], sounds: []});
        s.targets = [s.targets[0], s.targets[2], s.targets[1]];
        s.monitors.push({id: 'v1', mode: 'default', opcode: 'data_variable', params: {VARIABLE: 'score'}, visible: true});
        s.extensions.push({id: 'pen'});
        s.fonts.push({system: true, family: 'Comic', fallback: 'cursive'});
        return s;
    };

    test('same id space: exact', () => {
        const from = base();
        const to = mutate(base());
        const ops = diffStates(from, to, {t: 5});
        ops.forEach(o => expect(validateOp(o)).toBeNull());
        const out = applyOps(from, ops);
        expect(out).toEqual(to);
        expect(diffStates(to, to)).toEqual([]);
        expect(applyOps(to, diffStates(to, from))).toEqual(from);
    });

    test('across id spaces: canonical, keeping the live target ids', () => {
        const live = base();
        const old = cloneState(mutate(base()));
        old.targets.forEach(t => {
            t.id = `old-${t.id}`;
        });
        old.targets.find(t => t.name === 'Kat').name = 'Cat';
        old.targets[1].costumes.forEach(c => {
            c.id = `old-${c.id}`;
        });
        const out = applyOps(live, diffStates(live, old));
        expect(equalCanonical(out, old)).toBe(true);
        expect(out.targets.find(t => t.isStage).id).toBe('stage');
        expect(out.targets.find(t => t.name === 'Cat').id).toBe('cat');
        expect(out.targets.find(t => t.name === 'Dog').id).toBe('old-dog');
    });

    test('diffRuntime reports only changed runtime fields', () => {
        const a = base();
        const b = cloneState(a);
        b.targets[1].x = 5;
        b.targets[0].variables.v1.value = 9;
        expect(diffRuntime(readRuntimeFields(a), readRuntimeFields(b))).toEqual({targets: {cat: {x: 5}, stage: {vars: {v1: 9}}}});
        expect(diffRuntime(readRuntimeFields(a), readRuntimeFields(a))).toBeNull();
    });
});
