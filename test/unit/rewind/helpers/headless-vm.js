import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VM = require('scratch-vm');
const ScratchStorage = require('scratch-storage');

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const wav = () => {
    const samples = 8;
    const b = Buffer.alloc(44 + samples * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(22050, 24); b.writeUInt32LE(44100, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
    return b;
};

export const makeStorage = () => {
    const storage = new ScratchStorage();
    const helper = {
        load (assetType, assetId, dataFormat) {
            let data;
            if (dataFormat === 'svg') data = Buffer.from(SVG);
            else if (dataFormat === 'png' || dataFormat === 'jpg') data = PNG;
            else if (dataFormat === 'wav' || dataFormat === 'mp3') data = wav();
            else return Promise.resolve(null);
            return Promise.resolve(storage.createAsset(assetType, dataFormat, new Uint8Array(data), assetId));
        }
    };
    storage.addHelper(helper, 100);
    return storage;
};

if (typeof afterEach === 'function') {
    afterEach(() => new Promise(resolve => setTimeout(resolve, 100)));
}

export const makeVm = () => {
    const vm = new VM();
    vm.attachStorage(makeStorage());
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.extensionManager.loadExtensionURL = async () => {};
    return vm;
};

export const FIXTURES = path.resolve(__dirname, '../fixtures');

export const loadFixture = async (vm, name) => {
    const json = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
    await vm.loadProject(json);
    return vm;
};

export const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');
