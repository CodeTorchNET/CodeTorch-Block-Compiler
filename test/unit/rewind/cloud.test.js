import {makeVm, loadFixture} from './helpers/headless-vm';
import * as E from './helpers/editor';
import {RewindRecorder} from '../../../src/lib/rewind/recorder';
import {serializeState, equalCanonical, diffCanonical, cloneState, CLOUD_VALUE} from '../../../src/lib/rewind/state';
import {applyOps} from '../../../src/lib/rewind/apply';
import {restoreTo} from '../../../src/lib/rewind/restore';
import {muteCloud, withCloudMuted, resyncCloud} from '../../../src/lib/cloud-mute';

const quiet = {warn: () => {}, info: () => {}};

const fakeProvider = () => ({
    createVariable: jest.fn(),
    updateVariable: jest.fn(),
    renameVariable: jest.fn(),
    deleteVariable: jest.fn(),
    connection: {close: jest.fn()}
});
const providerCalls = p => p.createVariable.mock.calls.length + p.updateVariable.mock.calls.length +
    p.renameVariable.mock.calls.length + p.deleteVariable.mock.calls.length;

const stage = vm => vm.runtime.getTargetForStage();

const setup = async () => {
    const vm = makeVm();
    await loadFixture(vm, 'rich-project.json');
    let t = 1700000000000;
    const rec = new RewindRecorder(vm, {session: 's1', now: () => (t += 7), log: quiet});
    return {vm, rec};
};

const allVarOps = ops => ops.filter(o => /^var\./.test(o.k) || o.k === 'runtime.state' || o.k === 'restore');

describe('rewind and cloud variables', () => {
    test('recording keeps cloud structure, never a cloud value', async () => {
        const {vm, rec} = await setup();
        const cloudId = E.varCreate(vm, {varName: '☁ score', isCloud: true});
        stage(vm).variables[cloudId].value = 41;
        const base = rec.start();
        expect(base.targets.find(t => t.isStage).variables[cloudId]).toMatchObject({isCloud: true, value: CLOUD_VALUE});

        const plainId = E.varCreate(vm, {varName: 'lives'});
        const newCloud = E.varCreate(vm, {varName: '☁ best', isCloud: true});
        stage(vm).variables[cloudId].value = 1234;
        stage(vm).variables[newCloud].value = 77;
        stage(vm).variables[plainId].value = 3;
        rec.checkpointRuntime('test');
        E.varRename(vm, cloudId, '☁ points');
        await E.flushMicrotasks();
        const ops = rec.takeBatch({repair: false}).ops;

        const json = JSON.stringify(allVarOps(ops).map(o => o.d));
        expect(json).not.toContain('1234');
        expect(json).not.toContain('77');
        const add = ops.find(o => o.k === 'var.add' && o.d.id === newCloud);
        expect(add.d.data).toEqual({name: '☁ best', isCloud: true});
        const rt = ops.find(o => o.k === 'runtime.state');
        const stageVars = rt.d.targets[stage(vm).id].vars;
        expect(stageVars[plainId]).toBe(3);
        expect(Object.keys(stageVars)).not.toContain(cloudId);
        expect(ops.find(o => o.k === 'var.update' && o.d.id === cloudId).d.data).toEqual({name: '☁ points'});

        expect(diffCanonical(applyOps(base, ops), serializeState(vm))).toEqual([]);
    });

    test('canonical compare ignores cloud values, not cloud structure', async () => {
        const {vm} = await setup();
        const id = E.varCreate(vm, {varName: '☁ score', isCloud: true});
        const a = serializeState(vm);
        const b = cloneState(a);
        const sv = s => s.targets.find(t => t.isStage).variables[id];
        sv(b).value = 999;
        expect(equalCanonical(a, b)).toBe(true);
        sv(b).name = '☁ other';
        expect(equalCanonical(a, b)).toBe(false);
    });

    test('older histories with recorded cloud values still replay and verify', async () => {
        const {vm} = await setup();
        const id = E.varCreate(vm, {varName: '☁ score', isCloud: true});
        const base = serializeState(vm);
        const stageId = stage(vm).id;
        const old = [
            {id: 'o1', t: 1, k: 'var.update', tg: stageId, d: {id, type: '', data: {value: 55}}},
            {id: 'o2', t: 2, k: 'runtime.state', tg: null, d: {targets: {[stageId]: {vars: {[id]: 66}}}}},
            {id: 'o3', t: 3, k: 'var.add', tg: stageId, d: {id: 'c2', type: '', data: {name: '☁ x', value: 5, isCloud: true}}}
        ];
        const replayed = applyOps(base, old);
        const sv = replayed.targets.find(t => t.isStage).variables;
        expect(sv[id].value).toBe(CLOUD_VALUE);
        expect(sv.c2.value).toBe(CLOUD_VALUE);
        const nextChunk = cloneState(replayed);
        nextChunk.targets.find(t => t.isStage).variables[id].value = 66;
        expect(equalCanonical(replayed, nextChunk)).toBe(true);
    });

    test('restore sends nothing to the cloud server, keeps live values, then resyncs', async () => {
        const {vm, rec} = await setup();
        const provider = fakeProvider();
        vm.setCloudProvider(provider);
        const a = E.varCreate(vm, {varName: '☁ a', isCloud: true});
        const b = E.varCreate(vm, {varName: '☁ b', isCloud: true});
        stage(vm).variables[b].value = 7;
        rec.start();
        const atT = serializeState(vm);
        atT.targets.find(t => t.isStage).variables[b].value = 7;

        E.varRename(vm, a, '☁ a2');
        E.varDelete(vm, b);
        const c = E.varCreate(vm, {varName: '☁ c', isCloud: true});
        stage(vm).variables[a].value = 99;
        await E.flushMicrotasks();
        rec.takeBatch({repair: false});
        for (const k of ['createVariable', 'updateVariable', 'renameVariable', 'deleteVariable']) provider[k].mockClear();

        const res = await restoreTo(vm, atT, {recorder: rec, to: 123, labelUser: 'maya'});
        expect(providerCalls(provider)).toBe(0);
        expect(provider.connection.close).toHaveBeenCalledTimes(1);
        expect(vm.runtime.ioDevices.cloud.provider).toBe(provider);

        const vars = stage(vm).variables;
        expect(vars[a].name).toBe('☁ a');
        expect(vars[a].value).toBe(99);
        expect(vars[b]).toBeTruthy();
        expect(vars[b].value).toBe(0);
        expect(vars[c]).toBeUndefined();
        expect(res.ok).toBe(true);

        const ops = rec.takeBatch({repair: false}).ops;
        expect(ops.map(o => o.k)).toEqual(['restore']);
        expect(JSON.stringify(ops)).not.toMatch(/"value":(7|99)\b/);
    });

    test('restore without cloud changes does not reconnect; a provider swapped mid-restore wins', async () => {
        const {vm, rec} = await setup();
        const provider = fakeProvider();
        vm.setCloudProvider(provider);
        rec.start();
        const atT = serializeState(vm);
        E.varCreate(vm, {varName: 'lives'});
        await E.flushMicrotasks();
        await restoreTo(vm, atT, {recorder: rec, to: 1});
        expect(provider.connection.close).not.toHaveBeenCalled();

        const unmute = muteCloud(vm.runtime);
        expect(vm.runtime.ioDevices.cloud.provider).toBeNull();
        const other = fakeProvider();
        vm.setCloudProvider(other);
        unmute();
        expect(vm.runtime.ioDevices.cloud.provider).toBe(other);
    });

    test('withCloudMuted: a remote create sends no frame; resyncCloud without a connection is a no-op', async () => {
        const {vm} = await setup();
        const provider = fakeProvider();
        vm.setCloudProvider(provider);
        withCloudMuted(vm.runtime, () => stage(vm).createVariable('r1', '☁ remote', '', true, true));
        withCloudMuted(vm.runtime, () => stage(vm).deleteVariable('r1', true));
        expect(providerCalls(provider)).toBe(0);
        stage(vm).createVariable('r2', '☁ control', '', true, true);
        expect(provider.createVariable).toHaveBeenCalledWith('☁ control', 0);
        vm.setCloudProvider(null);
        expect(resyncCloud(vm.runtime)).toBe(false);
    });
});
