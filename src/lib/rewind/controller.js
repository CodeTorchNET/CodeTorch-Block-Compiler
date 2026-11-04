import {RewindRecorder} from './recorder.js';
import {RewindFlusher} from './flush.js';
import {createQueue} from './queue.js';
import {rewindApi} from './api.js';
import {adoptHeadIds} from './ids.js';
import {uuidv4} from './ops.js';
import rewindHooks, {roomGenerationNumber} from './hooks.js';
import {onArtChanged} from '../collab-art-bus.js';
import {setShapeReporting} from 'scratch-paint/src/helper/collab-live.js';
import * as collabSnapshot from '../collab-snapshot.js';
import storage from '../storage';
import * as rewindState from './state.js';
import * as rewindApply from './apply.js';
import * as rewindTimeline from './timeline.js';
import {continueFrom, takePendingRecovery} from './recover.js';

export const collabArtSource = costumeId => {
    if (!collabSnapshot.getIsCollaborative()) return null;
    const c = typeof window === 'undefined' ? null : window.collab;
    const root = c && typeof c.getSharedCostumeArt === 'function' ? c.getSharedCostumeArt() : null;
    if (!root || typeof root.has !== 'function' || !root.has(costumeId)) return null;
    const entry = root.get(costumeId);
    const order = entry && entry.get('order');
    const shapes = entry && entry.get('shapes');
    if (!order || !shapes) return null;
    const out = {};
    const ids = [];
    for (const id of order.toArray()) {
        if (out[id]) continue;
        const sh = shapes.get(id);
        if (!sh) continue;
        out[id] = typeof sh.toJSON === 'function' ? sh.toJSON() : sh;
        ids.push(id);
    }
    return ids.length ? {order: ids, shapes: out} : null;
};

const isViewingRewind = () => {
    try {
        return new URLSearchParams(window.location.search).get('rewind') === '1';
    } catch (e) {
        return false;
    }
};

export class RewindSession {
    constructor ({vm, projectId, meta, api, queue, log}) {
        this.vm = vm;
        this.projectId = projectId;
        this.meta = meta || {};
        this.log = log || console;
        this.id = uuidv4();
        this.recorder = new RewindRecorder(vm, {session: this.id, log: this.log, artSource: collabArtSource});
        this.api = api || rewindApi;
        this.queue = queue || createQueue();
        this.cleanups = [];
        this.stopped = false;
    }

    /**
     * @param {object} [opts] options
     * @param {?object} [opts.recovery] recovery
     * @returns {object} the session's base state
     */
    start (opts = {}) {
        let base = this.recorder.start();
        if (opts.recovery) base = continueFrom(this.recorder, this.vm, opts.recovery) || base;
        this.flusher = new RewindFlusher({
            vm: this.vm,
            recorder: this.recorder,
            api: this.api,
            queue: this.queue,
            projectId: this.projectId,
            user: storage.username || '',
            session: this.id,
            baseRevision: typeof this.meta.revision === 'number' ? this.meta.revision : null,
            storeAsset: (asset, md5ext) => {
                const type = storage.AssetType[asset.assetType] ||
                    (asset.dataFormat === 'svg' ? storage.AssetType.ImageVector :
                        ['wav', 'mp3'].includes(asset.dataFormat) ? storage.AssetType.Sound :
                            ['ttf', 'otf', 'woff', 'woff2'].includes(asset.dataFormat) ? storage.AssetType.Font :
                                storage.AssetType.ImageBitmap);
                return storage.store(type, asset.dataFormat, asset.data, md5ext.split('.')[0])
                    .then(res => {
                        if (res && res.status && res.status !== 'ok') throw new Error(res.code || 'upload failed');
                    });
            },
            log: this.log,
            onStop: () => this.stop()
        });
        this.cleanups.push(onArtChanged(art => this.recorder.onArt(art)));
        setShapeReporting(true, 'rewind');
        this.cleanups.push(() => setShapeReporting(false, 'rewind'));
        const onPagehide = () => this.flusher.pagehide();
        window.addEventListener('pagehide', onPagehide);
        this.cleanups.push(() => window.removeEventListener('pagehide', onPagehide));
        this.flusher.sendQueued().catch(e => this.log.warn('[rewind] could not send queued ops', e));
        return base;
    }

    stop () {
        if (this.stopped) return;
        this.stopped = true;
        this.recorder.stop();
        for (const fn of this.cleanups.splice(0)) {
            try {
                fn();
            } catch (e) {
                // ignore
            }
        }
        if (rewindHooks.getActive() === this) rewindHooks.setActive(null);
    }

    beginSuppress (reason) {
        this.recorder.beginSuppress(reason);
    }
    endSuppress () {
        this.recorder.endSuppress();
    }
    addProbe (fn) {
        return this.recorder.addSuppressionProbe(fn);
    }
    hintSource (kind, source, opts) {
        this.recorder.hintSource(kind, source, opts);
    }
    paintEditorClosed () {
        this.recorder.paintEditorClosed();
    }
    roomJoined (room) {
        if (!room || !room.id) return;
        this.flusher.setRoom({id: room.id, generation: roomGenerationNumber(room.generation)});
    }
    roomLeft () {
        if (this.flusher.room) this.flusher.setRoom(null);
    }
    saveHeaders () {
        return this.flusher.saveHeaders();
    }
    afterSave ({projectId, revision} = {}) {
        if (projectId && String(projectId) !== String(this.projectId)) return null;
        return this.flusher.afterSave({revision}).catch(e => this.log.warn('[rewind] flush failed', e));
    }
}

class Controller {
    constructor () {
        this.vm = null;
        this.projectId = null;
        this.meta = null;
        this.metaProjectId = null;
        this.session = null;
    }

    projectLoaded (vm, projectId) {
        this.stopSession();
        this.vm = vm;
        this.projectId = projectId ? String(projectId) : null;
        this.maybeStart();
    }

    metaLoaded (projectId, meta) {
        this.metaProjectId = String(projectId);
        this.meta = (meta && meta.rewind) || null;
        rewindHooks.setMeta(this.metaProjectId, this.meta);
        this.maybeStart();
    }

    /**
     * @param {object} vm the editing VM
     * @param {string|number} projectId the new project's id
     */
    projectCreated (vm, projectId) {
        if (!projectId || String(projectId) === '0') return;
        if (this.session && String(this.session.projectId) === String(projectId)) return;
        this.stopSession();
        this.vm = vm;
        this.projectId = String(projectId);
        this.maybeStart();
    }

    projectUnloaded () {
        this.stopSession();
        this.projectId = null;
    }

    stopSession () {
        if (this.session) this.session.stop();
        this.session = null;
    }

    maybeStart () {
        if (this.session || !this.vm || !this.projectId || this.projectId === '0') return;
        if (!this.meta || this.metaProjectId !== this.projectId || !this.meta.recording) return;
        if (isViewingRewind()) return;
        const recovery = takePendingRecovery(this.projectId);
        if (!recovery && !collabSnapshot.getIsCollaborative() && Array.isArray(this.meta.head_ids)) {
            if (adoptHeadIds(this.vm, this.meta.head_ids)) this.vm.emitTargetsUpdate(false);
        }
        const session = new RewindSession({vm: this.vm, projectId: this.projectId, meta: this.meta});
        this.session = session;
        rewindHooks.setActive(session);
        session.start({recovery});
    }
}

export const rewindController = new Controller();
if (typeof window !== 'undefined') {
    window.__ctRewind = {
        controller: rewindController,
        hooks: rewindHooks,
        artSource: collabArtSource,
        lib: {state: rewindState, apply: rewindApply, timeline: rewindTimeline}
    };
}
export default rewindController;
