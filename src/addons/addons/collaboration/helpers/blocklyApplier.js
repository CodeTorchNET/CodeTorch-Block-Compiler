import * as constants from './constants.js';

/*
Reconciles individual blocks in the live Blockly workspace against the VM
block container (the source of truth, already updated from Yjs) so remote
changes don't require a full workspace reload. Returns false whenever it
hits anything it can't safely patch so the caller can fall back to a full
vm.emitWorkspaceUpdate() rebuild.
*/

function isObscuredShadow(target, vmBlock, blockId) {
    if (!vmBlock.shadow) return false;
    const parent = vmBlock.parent ? target.blocks.getBlock(vmBlock.parent) : null;
    if (!parent) return false;
    for (const inputName of Object.keys(parent.inputs)) {
        const input = parent.inputs[inputName];
        if (input.shadow === blockId) {
            return input.block !== blockId;
        }
    }
    return false;
}

function collectVmSubtreeIds(target, rootId, ids) {
    const block = target.blocks.getBlock(rootId);
    if (!block || ids.has(rootId)) return ids;
    ids.add(rootId);
    for (const inputName of Object.keys(block.inputs)) {
        const input = block.inputs[inputName];
        if (input.block) collectVmSubtreeIds(target, input.block, ids);
        if (input.shadow && input.shadow !== input.block) collectVmSubtreeIds(target, input.shadow, ids);
    }
    if (block.next) collectVmSubtreeIds(target, block.next, ids);
    return ids;
}

function reconcileExistence(Blockly, workspace, target, blockId) {
    const vmBlock = target.blocks.getBlock(blockId);
    const wsBlock = workspace.getBlockById(blockId);

    if (!vmBlock && wsBlock) {
        wsBlock.getChildren().slice().forEach(child => {
            if (target.blocks.getBlock(child.id)) {
                child.unplug(false);
            }
        });
        wsBlock.dispose(false, false);
        return true;
    }

    if (vmBlock && !wsBlock) {
        if (isObscuredShadow(target, vmBlock, blockId)) return true;

        let rootId = blockId;
        let seen = new Set([rootId]);
        for (;;) {
            const current = target.blocks.getBlock(rootId);
            const parentId = current && current.parent;
            if (!parentId || workspace.getBlockById(parentId) || !target.blocks.getBlock(parentId)) break;
            if (seen.has(parentId)) return false;
            seen.add(parentId);
            rootId = parentId;
        }

        const subtreeIds = collectVmSubtreeIds(target, rootId, new Set());
        subtreeIds.forEach(id => {
            const existing = workspace.getBlockById(id);
            if (existing) existing.dispose(false, false);
        });

        const xml = target.blocks.blockToXML(rootId, target.comments);
        if (!xml) return false;
        const dom = Blockly.Xml.textToDom(`<xml>${xml}</xml>`);
        const blockDom = dom.firstElementChild || dom.firstChild;
        if (!blockDom) return false;
        Blockly.Xml.domToBlock(blockDom, workspace);
    }

    return true;
}

function reconcileFields(target, vmBlock, wsBlock) {
    for (const fieldName of Object.keys(vmBlock.fields)) {
        const vmField = vmBlock.fields[fieldName];
        if (!vmField || typeof vmField !== 'object') continue;
        const wsField = wsBlock.getField(fieldName);
        if (!wsField) continue;

        if (vmField.id !== null && typeof vmField.id !== 'undefined') {
            const matchesId = String(wsField.getValue()) === String(vmField.id);
            const matchesText = wsField.getText() === String(vmField.value);
            if (!matchesId && !matchesText) return false;
            continue;
        }

        if (String(wsField.getValue()) !== String(vmField.value)) {
            wsBlock.setFieldValue(String(vmField.value), fieldName);
        }
    }
    return true;
}

function reconcileConnection(workspace, target, vmBlock, wsBlock, blockId) {
    const parentId = vmBlock.parent || null;
    const wsParent = wsBlock.getParent();

    let viaNext = false;
    let expectedInputName = null;
    if (parentId) {
        const vmParent = target.blocks.getBlock(parentId);
        if (!vmParent) return false;
        if (vmParent.next === blockId) {
            viaNext = true;
        } else {
            for (const inputName of Object.keys(vmParent.inputs)) {
                const input = vmParent.inputs[inputName];
                if (input.block === blockId || input.shadow === blockId) {
                    expectedInputName = inputName;
                    break;
                }
            }
            if (!expectedInputName) return false;
        }
    }

    let matches = false;
    if (!parentId) {
        matches = !wsParent;
    } else if (wsParent && wsParent.id === parentId) {
        if (viaNext) {
            matches = !!wsParent.nextConnection && wsParent.nextConnection.targetBlock() === wsBlock;
        } else {
            const input = wsParent.getInput(expectedInputName);
            matches = !!input && !!input.connection && input.connection.targetBlock() === wsBlock;
        }
    }
    if (matches) return true;

    const childConnection = wsBlock.previousConnection || wsBlock.outputConnection;
    if (wsParent) {
        if (!childConnection || !childConnection.isConnected()) return false;
        childConnection.disconnect();
    }
    if (!parentId) return true;

    const wsParentBlock = workspace.getBlockById(parentId);
    if (!wsParentBlock || !childConnection) return false;

    let parentConnection = null;
    if (viaNext) {
        parentConnection = wsParentBlock.nextConnection;
    } else {
        const input = wsParentBlock.getInput(expectedInputName);
        parentConnection = input && input.connection;
    }
    if (!parentConnection) return false;

    const occupant = parentConnection.targetBlock();
    if (occupant && occupant !== wsBlock && !occupant.isShadow()) {
        const occupantConnection = occupant.previousConnection || occupant.outputConnection;
        if (!occupantConnection || !occupantConnection.isConnected()) return false;
        occupantConnection.disconnect();
    }
    parentConnection.connect(childConnection);
    return true;
}

function reconcileState(Blockly, workspace, target, blockId) {
    const vmBlock = target.blocks.getBlock(blockId);
    if (!vmBlock) return true;
    const wsBlock = workspace.getBlockById(blockId);
    if (!wsBlock) {
        return !!vmBlock.shadow;
    }

    if (!!vmBlock.shadow !== wsBlock.isShadow()) return false;

    if (!reconcileFields(target, vmBlock, wsBlock)) return false;
    if (!reconcileConnection(workspace, target, vmBlock, wsBlock, blockId)) return false;

    if (vmBlock.topLevel && !wsBlock.getParent()) {
        const x = Number(vmBlock.x);
        const y = Number(vmBlock.y);
        if (isFinite(x) && isFinite(y)) {
            const xy = wsBlock.getRelativeToSurfaceXY();
            const dx = x - xy.x;
            const dy = y - xy.y;
            if (dx !== 0 || dy !== 0) wsBlock.moveBy(dx, dy);
        }
    }
    return true;
}

export function reconcileBlocks(target, blockIds) {
    const Blockly = constants.mutableRefs.BlocklyInstance;
    const workspace = constants.editorWorkspace();
    if (!workspace || !target || typeof target.blocks.blockToXML !== 'function') return false;
    Blockly.Events.disable();
    try {
        for (const blockId of blockIds) {
            if (!reconcileExistence(Blockly, workspace, target, blockId)) return false;
        }
        for (const blockId of blockIds) {
            if (!reconcileState(Blockly, workspace, target, blockId)) return false;
        }
        return true;
    } catch (e) {
        if (constants.debugging) console.warn('Collaboration: incremental block sync failed, falling back to full refresh.', e);
        return false;
    } finally {
        Blockly.Events.enable();
    }
}
