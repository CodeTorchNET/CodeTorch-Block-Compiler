import * as constants from './constants.js';

const FONTS_KEY = 'customFonts';
const SHARED_KEY = 'customFontsShared';

let active = false;
let applying = 0;
let applyChain = Promise.resolve();
let publishChain = Promise.resolve();
const uploaded = new Set();

const fontManager = () => constants.mutableRefs.vm && constants.mutableRefs.vm.runtime.fontManager;
const sharedFonts = () => constants.mutableRefs.ydoc && constants.mutableRefs.ydoc.getArray(FONTS_KEY);
const meta = () => constants.mutableRefs.ydoc && constants.mutableRefs.ydoc.getMap('meta');

const plain = entry => (entry && typeof entry.toJSON === 'function' ? entry.toJSON() : entry);
const localList = () => {
    const fm = fontManager();
    return (fm && fm.serializeJSON()) || [];
};
const roomList = () => sharedFonts().toArray().map(plain)
    .filter(f => f && typeof f === 'object');
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const roomCarriesFonts = () => meta().get(SHARED_KEY) === true;

/**
 * Puts a font file in permanent storage, the way a normal save does.
 * @param {object} asset the font's asset
 * @returns {Promise<void>} done; failures are logged (the next editor autosave retries)
 */
const upload = async asset => {
    const md5ext = `${asset.assetId}.${asset.dataFormat}`;
    if (uploaded.has(md5ext) || asset.clean) return;
    const storage = constants.mutableRefs.vm.runtime.storage;
    try {
        const response = await storage.store(asset.assetType, asset.dataFormat, asset.data, asset.assetId);
        if (response && response.status && response.status !== 'ok') throw new Error(response.code || 'refused');
        asset.clean = true;
        uploaded.add(md5ext);
    } catch (e) {
        console.warn(`[collaboration] could not store font ${md5ext}; the next save retries`, e);
    }
};

/**
 * Publishes this editor's font list to the room, after storing any new font files so the others.
 * @returns {Promise<void>} done
 */
export function publishFonts () {
    publishChain = publishChain.then(async () => {
        if (!active || applying || constants.mutableRefs.isViewer || !constants.mutableRefs.ydoc) return;
        const fm = fontManager();
        if (!fm) return;
        await Promise.all(fm.serializeAssets().map(upload));
        if (!active || applying || !constants.mutableRefs.ydoc) return;
        const list = localList();
        if (roomCarriesFonts() && sameList(list, roomList())) return;
        const shared = sharedFonts();
        const m = meta();
        constants.mutableRefs.ydoc.transact(() => {
            if (shared.length) shared.delete(0, shared.length);
            if (list.length) shared.insert(0, list);
            m.set(SHARED_KEY, true);
        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    }).catch(e => console.warn('[collaboration] could not publish fonts', e));
    return publishChain;
}

/**
 * Makes this editor's fonts the room's list.
 * @returns {Promise<void>} done
 */
export function applyFontsFromRoom () {
    applyChain = applyChain.then(async () => {
        if (!active || !constants.mutableRefs.ydoc || !roomCarriesFonts()) return;
        const fm = fontManager();
        const wanted = roomList();
        if (!fm || sameList(localList(), wanted)) return;
        applying++;
        try {
            await fm.deserialize(wanted, null, false);
            fm.serializeAssets().forEach(asset => {
                asset.clean = true;
                uploaded.add(`${asset.assetId}.${asset.dataFormat}`);
            });
        } finally {
            applying--;
        }
    }).catch(e => console.warn('[collaboration] could not load the room\'s fonts', e));
    return applyChain;
}

const handleFontsChanged = () => {
    if (!active || applying || constants.mutableRefs.isInitialRoomSync) return;
    publishFonts();
};

const handleRoomFonts = event => {
    if (event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN) return;
    applyFontsFromRoom();
};

/**
 * Starts sharing fonts once the room is joined.
 * @returns {Promise<void>} done
 */
export function start () {
    if (active || !constants.mutableRefs.ydoc) return Promise.resolve();
    active = true;
    fontManager().on('change', handleFontsChanged);
    sharedFonts().observe(handleRoomFonts);
    if (roomCarriesFonts()) return applyFontsFromRoom();
    if (localList().length) return publishFonts();
    return Promise.resolve();
}

export function stop () {
    if (!active) return;
    active = false;
    const fm = fontManager();
    if (fm) fm.removeListener('change', handleFontsChanged);
    const shared = sharedFonts();
    if (shared) shared.unobserve(handleRoomFonts);
}
