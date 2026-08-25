import * as constants from './constants.js';
import * as applier from './blocklyApplier.js';
import * as helper from './helper.js';

const FLUSH_DELAY_MS = 80;
const MAX_WAIT_MS = 600;
const DRAG_RETRY_MS = 200;

const dirtyBlocksByTarget = new Map();
const repairPending = new Set();
let fullRefreshPending = false;
let toolboxRefreshPending = false;
let flushTimer = null;
let firstQueuedAt = 0;

function getWorkspace() {
    return constants.editorWorkspace();
}

export function rebuildWorkspace() {
    const vm = constants.mutableRefs.vm;
    if (!vm) return;
    const workspace = getWorkspace();
    const targetBefore = vm.editingTarget ? vm.editingTarget.id : null;
    const undoStack = workspace ? workspace.undoStack_.slice() : null;
    const redoStack = workspace ? workspace.redoStack_.slice() : null;

    vm.emitWorkspaceUpdate();

    const targetAfter = vm.editingTarget ? vm.editingTarget.id : null;
    if (workspace && undoStack && targetAfter === targetBefore && workspace.undoStack_.length === 0) {
        workspace.undoStack_ = undoStack;
        workspace.redoStack_ = redoStack;
    }
}

function claimsChild(parent, childId) {
    if (!parent) return false;
    if (parent.next === childId) return true;
    for (const name in parent.inputs) {
        const input = parent.inputs[name];
        if (input && (input.block === childId || input.shadow === childId)) return true;
    }
    return false;
}

function attachmentsDisagree(target, dirtyIds) {
    const blocks = target?.blocks?._blocks;
    if (!blocks) return false;
    for (const id of dirtyIds) {
        const block = blocks[id];
        if (!block) continue;
        if (block.parent && blocks[block.parent] && !claimsChild(blocks[block.parent], id)) return true;
        if (block.next && blocks[block.next] && blocks[block.next].parent !== id) return true;
        for (const name in block.inputs) {
            const input = block.inputs[name];
            if (!input || !input.block || input.block === input.shadow) continue;
            const child = blocks[input.block];
            if (child && child.parent !== id) return true;
        }
    }
    return false;
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

export function queueRepair(targetId) {
    repairPending.add(targetId);
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
    const toRepair = [...repairPending];
    repairPending.clear();
    const doToolbox = toolboxRefreshPending;
    toolboxRefreshPending = false;
    const dirty = new Map(dirtyBlocksByTarget);
    dirtyBlocksByTarget.clear();

    const previousGroup = Blockly.Events.getGroup();
    Blockly.Events.setGroup('yjs-remote-sync');
    constants.beginRemoteApply();
    try {

        toRepair.forEach(targetId => {
            const target = vm.runtime.getTargetById(targetId);
            if (!target || typeof target.blocks.validateAndRepair !== 'function') return;
            const repaired = new Map();
            if (target.blocks.validateAndRepair(repaired) > 0) {
                needFull = true;
                if (repaired.size > 0) {
                    setTimeout(() => helper.publishBlocksToYjs(targetId, repaired), 0);
                }
            }
        });

        const editingTarget = vm.editingTarget;
        if (!needFull && dirty.size > 0 && editingTarget) {
            const dirtyIds = dirty.get(editingTarget.id);
            if (dirtyIds && dirtyIds.size > 0) {
                if (attachmentsDisagree(editingTarget, dirtyIds) ||
                    !applier.reconcileBlocks(editingTarget, dirtyIds)) {
                    needFull = true;
                }
            }
        }

        if (needFull && editingTarget) {
            const repairedByTarget = new Map();
            vm.runtime.targets.forEach(target => {
                if (!target.isOriginal) return;
                if (typeof target.blocks.validateAndRepair !== 'function') return;
                const repaired = new Map();
                if (target.blocks.validateAndRepair(repaired) > 0 && repaired.size > 0) {
                    repairedByTarget.set(target.id, repaired);
                }
            });
            rebuildWorkspace();
            if (repairedByTarget.size > 0) {
                setTimeout(() => {
                    repairedByTarget.forEach((repaired, targetId) => {
                        helper.publishBlocksToYjs(targetId, repaired);
                    });
                }, 0);
            }
        }

        if (doToolbox) {
            getWorkspace()?.refreshToolboxSelection_();
        }
    } finally {
        constants.endRemoteApply();
        Blockly.Events.setGroup(previousGroup || false);
    }
}

export function reset() {
    repairPending.clear();
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    firstQueuedAt = 0;
    fullRefreshPending = false;
    toolboxRefreshPending = false;
    dirtyBlocksByTarget.clear();
}
