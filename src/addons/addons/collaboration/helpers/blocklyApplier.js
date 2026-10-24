import * as constants from './constants.js';
import * as recorder from './recorder.js';

/*
Reconciles individual blocks in the live Blockly workspace against the VM
block container (the source of truth, already updated from Yjs) so remote
changes don't require a full workspace reload. Returns false whenever it
hits anything it can't safely patch so the caller can fall back to a full
vm.emitWorkspaceUpdate() rebuild.
*/

function bail(where, blockId, extra) {
    recorder.record('applier.bail', Object.assign({where, block: blockId}, extra || {}));
    return false;
}

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

    if (!!vmBlock.shadow !== wsBlock.isShadow()) return bail('shadowness', blockId);

    if (!reconcileFields(target, vmBlock, wsBlock)) return bail('fields', blockId);
    if (!reconcileConnection(workspace, target, vmBlock, wsBlock, blockId)) return bail('connection', blockId);

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
            if (!reconcileExistence(Blockly, workspace, target, blockId)) return bail('existence', blockId);
        }
        for (const blockId of blockIds) {
            if (!reconcileState(Blockly, workspace, target, blockId)) return false;
        }
        return true;
    } catch (e) {
        if (constants.debugging) console.warn('Collaboration: incremental block sync failed, falling back to full refresh.', e);
        return bail('threw', null, {message: String(e && e.message || e)});
    } finally {
        Blockly.Events.enable();
    }
}

function commentText(wsComment) {
    if (typeof wsComment.getText === 'function') return wsComment.getText();
    if (typeof wsComment.getContent === 'function') return wsComment.getContent();
    return null;
}

function commentMinimized(wsComment) {
    if (typeof wsComment.isMinimized === 'function') return !!wsComment.isMinimized();
    return !!wsComment.isMinimized_;
}

function createComment(Blockly, workspace, vmComment) {
    if (vmComment.blockId) {
        const block = workspace.getBlockById(vmComment.blockId);
        if (!block) return null;
        if (block.comment) return block.comment.id === vmComment.id ? block.comment : null;
        block.setCommentText(String(vmComment.text == null ? '' : vmComment.text), vmComment.id,
            Number(vmComment.x), Number(vmComment.y), !!vmComment.minimized);
        return block.comment || null;
    }
    if (typeof vmComment.toXML !== 'function') return null;
    const dom = Blockly.Xml.textToDom(`<xml>${vmComment.toXML()}</xml>`);
    const commentDom = dom.firstElementChild || dom.firstChild;
    if (!commentDom) return null;
    return Blockly.WorkspaceCommentSvg.fromXml(commentDom, workspace);
}

export function reconcileComments(target, commentIds) {
    const Blockly = constants.mutableRefs.BlocklyInstance;
    const workspace = constants.editorWorkspace();
    if (!workspace || !target || !target.comments) return false;
    // The VM holds a comment's position as an LTR workspace reports it; a mirrored workspace is
    // rebuilt, as it was.
    if (workspace.RTL) return bail('comments-rtl', null);
    Blockly.Events.disable();
    try {
        for (const id of commentIds) {
            const vmComment = target.comments[id];
            let wsComment = workspace.getCommentById(id);
            if (!vmComment) {
                if (wsComment) wsComment.dispose();
                continue;
            }
            if (!wsComment) {
                wsComment = createComment(Blockly, workspace, vmComment);
                if (!wsComment) return bail('comment-create', id);
            }
            if (vmComment.blockId) {
                const block = workspace.getBlockById(vmComment.blockId);
                if (!block || block.comment !== wsComment) return bail('comment-block', id);
            }

            const text = String(vmComment.text == null ? '' : vmComment.text);
            // Not while this person is typing in it: their text is published when they blur, and
            // the room settles it then. Overwriting the textarea under them is the report.
            const typingHere = !!wsComment.textarea_ && document.activeElement === wsComment.textarea_;
            if (!typingHere && commentText(wsComment) !== text) wsComment.setText(text);

            const minimized = !!vmComment.minimized;
            if (commentMinimized(wsComment) !== minimized) wsComment.setMinimized(minimized);

            const width = Number(vmComment.width);
            const height = Number(vmComment.height);
            if (!minimized && isFinite(width) && isFinite(height)) {
                const size = wsComment.getHeightWidth();
                if (Math.abs(size.width - width) > 0.5 || Math.abs(size.height - height) > 0.5) {
                    wsComment.setSize(width, height);
                }
            }

            const x = Number(vmComment.x);
            const y = Number(vmComment.y);
            if (isFinite(x) && isFinite(y)) {
                const xy = wsComment.getXY();
                if (Math.abs(xy.x - x) > 0.5 || Math.abs(xy.y - y) > 0.5) wsComment.moveTo(x, y);
            }
        }
        return true;
    } catch (e) {
        return bail('comments-threw', null, {message: String(e && e.message || e)});
    } finally {
        Blockly.Events.enable();
    }
}
