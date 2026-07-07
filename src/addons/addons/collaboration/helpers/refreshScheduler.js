import * as constants from './constants.js';
import * as applier from './blocklyApplier.js';

/*
Coalesces the Blockly UI work caused by remote changes. The VM model is
always updated synchronously by the observers; only the (expensive) Blockly
side is deferred here so that bursts of remote events produce one UI update
instead of one full workspace rebuild per event.
*/

const FLUSH_DELAY_MS = 80;
const MAX_WAIT_MS = 600;
const DRAG_RETRY_MS = 200;

const dirtyBlocksByTarget = new Map();
let fullRefreshPending = false;
let toolboxRefreshPending = false;
let flushTimer = null;
let firstQueuedAt = 0;

function getWorkspace() {
    return constants.mutableRefs.BlocklyInstance?.getMainWorkspace?.() || null;
}

function arm() {
    if (!firstQueuedAt) firstQueuedAt = Date.now();
    if (flushTimer) clearTimeout(flushTimer);
    const overdue = (Date.now() - firstQueuedAt) >= MAX_WAIT_MS;
    flushTimer = setTimeout(flush, overdue ? 0 : FLUSH_DELAY_MS);
}

export function queueBlockSync(targetId, blockIds) {
    if (!targetId || !blockIds || blockIds.length === 0) return;
    const editingTarget = constants.mutableRefs.vm?.editingTarget;
    if (!editingTarget || editingTarget.id !== targetId) return;
    let set = dirtyBlocksByTarget.get(targetId);
    if (!set) {
        set = new Set();
        dirtyBlocksByTarget.set(targetId, set);
    }
    blockIds.forEach(id => set.add(id));
    arm();
}

export function queueFullRefresh() {
    fullRefreshPending = true;
    arm();
}

export function queueToolboxRefresh() {
    toolboxRefreshPending = true;
    arm();
}

function flush() {
    flushTimer = null;
    const vm = constants.mutableRefs.vm;
    const Blockly = constants.mutableRefs.BlocklyInstance;
    if (!vm || !Blockly) {
        reset();
        return;
    }

    const workspace = getWorkspace();
    if (workspace && typeof workspace.isDragging === 'function' && workspace.isDragging()) {
        flushTimer = setTimeout(flush, DRAG_RETRY_MS);
        return;
    }

    firstQueuedAt = 0;
    let needFull = fullRefreshPending;
    fullRefreshPending = false;
    const doToolbox = toolboxRefreshPending;
    toolboxRefreshPending = false;
    const dirty = new Map(dirtyBlocksByTarget);
    dirtyBlocksByTarget.clear();

    const previousGroup = Blockly.Events.getGroup();
    Blockly.Events.setGroup('yjs-remote-sync');
    try {
        const editingTarget = vm.editingTarget;
        if (!needFull && dirty.size > 0 && editingTarget) {
            const dirtyIds = dirty.get(editingTarget.id);
            if (dirtyIds && dirtyIds.size > 0) {
                if (!applier.reconcileBlocks(editingTarget, dirtyIds)) {
                    needFull = true;
                }
            }
        }

        if (needFull && editingTarget) {
            if (typeof editingTarget.blocks.validateAndRepair === 'function') {
                editingTarget.blocks.validateAndRepair();
            }
            vm.emitWorkspaceUpdate();
        }

        if (doToolbox) {
            getWorkspace()?.refreshToolboxSelection_();
        }
    } finally {
        Blockly.Events.setGroup(previousGroup || false);
    }
}

export function reset() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    firstQueuedAt = 0;
    fullRefreshPending = false;
    toolboxRefreshPending = false;
    dirtyBlocksByTarget.clear();
}
