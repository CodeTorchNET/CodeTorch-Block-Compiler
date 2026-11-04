import Timeline from './timeline.js';
import {rewindApi} from './api.js';
import {cloneState, equalCanonical, loadStateIntoVm, readRuntimeFieldsFromVm} from './state.js';
import {diffStates} from './diff.js';
import {makeRestoreOps} from './restore.js';

export const MAX_CANDIDATES = 10;

/**
 * Whether the error screen should offer recovery for this project.
 * @param {?object} meta the project's `rewind` meta block
 * @returns {boolean} true if recovery is offered
 */
export const canRecover = meta => !!(meta && meta.can_restore && meta.can_view);

/**
 * Loads the project's history.
 * @param {string|number} projectId project
 * @returns {Promise<Timeline>} loaded timeline
 */
export const loadRecoveryTimeline = async projectId => {
    const timeline = new Timeline({
        fetchIndex: () => rewindApi.getIndex(projectId),
        fetchChunk: n => rewindApi.getChunk(projectId, n),
        fetchSegment: n => rewindApi.getSegment(projectId, n),
        postVerify: () => Promise.resolve()
    });
    await timeline.load();
    return timeline;
};

/**
 * The newest state in the history.
 * @param {Timeline} timeline loaded timeline
 * @returns {Promise<?{state: object, t: number}>} head head
 */
export const headOf = async timeline => {
    if (timeline.isEmpty) return null;
    const last = timeline.segments[timeline.segments.length - 1];
    await timeline.ensureLoaded(last);
    const at = await timeline.stateAt(last.lastTs);
    return {state: cloneState(at.state), t: at.t};
};

/**
 * Walks back through the history's session ends, newest first, and returns.
 * @param {Timeline} timeline loaded timeline
 * @param {function(object): Promise<*>} tryLoad tryLoad
 * @param {object} [opts] options
 * @param {number} [opts.max] versions to try
 * @param {function(number): void} [opts.onTry] onTry
 * @returns {Promise<?{state: object, t: number, warnings: Array<object>}>} the version, or null
 */
export const findWorkingVersion = async (timeline, tryLoad, opts = {}) => {
    const max = opts.max || MAX_CANDIDATES;
    const tried = [];
    for (let i = timeline.segments.length - 1; i >= 0 && tried.length < max; i--) {
        const seg = timeline.segments[i];
        try {
            await timeline.ensureLoaded(seg);
        } catch (e) {
            continue;
        }
        const candidate = await timeline.restoreStateAt(seg.lastTs);
        if (tried.some(state => equalCanonical(state, candidate.state))) continue;
        tried.push(candidate.state);
        if (opts.onTry) opts.onTry(candidate.t);
        try {
            await tryLoad(candidate.state);
            return candidate;
        } catch (e) {
            // ignore
        }
    }
    return null;
};

/**
 * Loads a recovered state into the VM, keeping the history's target, costume.
 * @param {object} vm the VM
 * @param {object} state the version to load
 * @param {object} [additionalInfo] passed on to vm.loadProject
 * @returns {Promise<void>} done
 */
export const loadRecoveredState = (vm, state, additionalInfo) => loadStateIntoVm(vm, state, additionalInfo);

/**
 * Starts a recovered project's recording as a continuation of the history.
 * @param {object} recorder recorder
 * @param {object} vm the VM
 * @param {object} recovery recovery
 * @returns {?object} the new base, or null when the live snapshot already continues the history
 */
export const continueFrom = (recorder, vm, recovery) => {
    const live = recorder.base;
    if (!recovery.head || !live) return null;
    const diff = diffStates(recovery.head, live, {source: 'restore', t: recorder.nextT()});
    if (!diff.length) return null;
    const base = Object.assign(cloneState(recovery.head), {t: live.t, session: live.session, room: live.room});
    recorder.base = base;
    recorder.shadow = recorder.shadowEnabled ? cloneState(base) : null;
    const ops = makeRestoreOps({to: recovery.t || 0, label_user: recovery.labelUser || '', diff}, {});
    for (const op of ops) {
        op.t = recorder.nextT();
        recorder.commit(op);
    }
    recorder.shadow = recorder.shadowEnabled ? cloneState(live) : null;
    recorder.baseline = readRuntimeFieldsFromVm(vm);
    return base;
};

let pending = null;

/**
 * @param {object} recovery what was chosen
 * @param {string|number} recovery.projectId project
 * @param {object} recovery.state the version to open
 * @param {number} recovery.t its time in the history
 * @param {?object} recovery.head head
 * @param {string} recovery.labelUser labelUser
 */
export const setPendingRecovery = recovery => {
    pending = Object.assign({}, recovery, {projectId: String(recovery.projectId)});
};

/**
 * The recovery waiting for this project, if any.
 * @param {string|number} projectId project
 * @returns {?object} recovery
 */
export const peekPendingRecovery = projectId => (
    pending && pending.projectId === String(projectId) ? pending : null
);

/**
 * Takes the recovery waiting for this project, so it applies once.
 * @param {string|number} projectId project
 * @returns {?object} recovery
 */
export const takePendingRecovery = projectId => {
    const out = peekPendingRecovery(projectId);
    if (out) pending = null;
    return out;
};

export const clearPendingRecovery = () => {
    pending = null;
};
