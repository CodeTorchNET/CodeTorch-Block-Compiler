import * as constants from './constants.js';
import * as helper from './helper.js';

export function sharedBlocks(event){
    const result = {
        targetId: null,
        dirtyIds: [],
        promotedIds: [],
        detachedSlots: [],
        deletedAny: false,
        cancelledDrags: 0,
        needsFullRefresh: false,
        needsToolboxRefresh: false
    };
    const path = event.path;
    if (path.length === 0) {
        const editingTargetId = constants.mutableRefs.vm.editingTarget?.id;
        event.changes.keys.forEach((change, targetId) => {
            if (change.action === 'add') {
                const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
                if (!target) return;

                const yTargetBlockMap = event.target.get(targetId);
                yTargetBlockMap.forEach((yBlockMap, blockId) => {
                    if (blockId === '__targetName') return;
                    const block = helper.deserializeBlockFromYjs(yBlockMap);

                    if (!target.blocks.getBlock(blockId)) {
                        target.blocks.createBlock(block);
                        if (block.opcode === 'procedures_prototype') {
                            result.needsToolboxRefresh = true;
                        }
                        if (targetId === editingTargetId) {
                            result.needsFullRefresh = true;
                        }
                    }
                });
            }
        });
    }
    else if (path.length === 1) {
        const targetId = path[0];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);

        if (!target) return result;
        result.targetId = targetId;

        event.changes.keys.forEach((change, blockId) => {
            if (blockId === '__targetName') return;
            if (change.action === 'add' || change.action === 'update') {
                const yBlockMap = event.target.get(blockId);
                if (!yBlockMap) return;
                const block = helper.deserializeBlockFromYjs(yBlockMap);

                if (target.blocks.getBlock(blockId)) {
                    Object.assign(target.blocks._blocks[blockId], block);
                    target.blocks.updateBlock(target.blocks._blocks[blockId]);
                } else {
                    target.blocks.createBlock(block);
                }
                if (block.opcode === 'procedures_prototype') {
                    result.needsToolboxRefresh = true;
                }
                result.dirtyIds.push(blockId);
            }
            else if (change.action === 'delete') {

                if (helper.cancelDragOf(blockId)) {
                    result.cancelledDrags++;
                }

                const doomed = target.blocks.getBlock(blockId);
                const attachment = [];
                if (doomed && doomed.parent) {
                    const parent = target.blocks.getBlock(doomed.parent);
                    if (parent) {
                        if (parent.next === blockId) {
                            attachment.push([doomed.parent, 'next']);
                        }
                        for (const name in parent.inputs || {}) {
                            const input = parent.inputs[name];
                            if (!input) continue;
                            if (input.block === blockId) {
                                attachment.push([doomed.parent, JSON.stringify(['inputs', name, 'block'])]);
                            }
                            if (input.shadow === blockId) {
                                attachment.push([doomed.parent, JSON.stringify(['inputs', name, 'shadow'])]);
                            }
                        }
                    }
                }

                const promoted = target.blocks.deleteBlock(blockId, {cascade: false});
                result.deletedAny = true;
                result.dirtyIds.push(blockId);
                promoted.forEach(promotedId => {
                    result.dirtyIds.push(promotedId);
                    result.promotedIds.push(promotedId);
                });

                attachment.forEach(([parentId, prop]) => {
                    const parent = target.blocks.getBlock(parentId);
                    if (!parent) return;
                    const stillThere = prop === 'next' ?
                        parent.next === blockId :
                        (() => {
                            try {
                                const [, name, slot] = JSON.parse(prop);
                                return parent.inputs?.[name]?.[slot] === blockId;
                            } catch (e) {
                                return true;
                            }
                        })();
                    if (stillThere) return;
                    result.detachedSlots.push([parentId, prop]);
                    result.dirtyIds.push(parentId);
                });
            }
        });
    }
    else if (path.length === 2) {
        const targetId = path[0];
        const blockId = path[1];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);

        const yTargetBlockMap = constants.mutableRefs.sharedBlocks?.get(targetId);
        const superseded = yTargetBlockMap && yTargetBlockMap.get(blockId) !== event.target;

        if (target && !superseded) {
            const block = target.blocks.getBlock(blockId);
            if (block) {
                result.targetId = targetId;
                let mutationTouched = false;
                event.changes.keys.forEach((change, key) => {
                    if (key === 'mutation' || (key.startsWith('["') && key.includes('"mutation"'))) {
                        mutationTouched = true;
                    }
                    if (change.action === 'add' || change.action === 'update') {
                        let val = event.target.get(key);

                        if (key.startsWith('["')) {
                            try {
                                const pathParts = JSON.parse(key);
                                let current = block;
                                for (let i = 0; i < pathParts.length - 1; i++) {
                                    const part = pathParts[i];
                                    if (!current[part]) {
                                        current[part] = (pathParts[0] === 'inputs' && i === 1)
                                            ? { name: part, block: null, shadow: null }
                                            : {};
                                    }
                                    current = current[part];
                                }
                                current[pathParts[pathParts.length - 1]] = val;
                            } catch (e) {
                                block[key] = val;
                            }
                        } else {
                            if (key === 'inputs' || key === 'fields' || key === 'mutation') {
                                try { val = JSON.parse(val); } catch (e) { }
                            }
                            block[key] = val;
                        }
                    } else if (change.action === 'delete') {
                        if (key.startsWith('["')) {
                            try {
                                const pathParts = JSON.parse(key);
                                let current = block;
                                for (let i = 0; i < pathParts.length - 1 && current; i++) {
                                    current = current[pathParts[i]];
                                }
                                if (current) delete current[pathParts[pathParts.length - 1]];
                            } catch (e) {
                                delete block[key];
                            }
                        } else {
                            delete block[key];
                        }
                    }
                });
                target.blocks.updateBlock(block);

                if (block.opcode === 'procedures_prototype') {
                    result.needsToolboxRefresh = true;
                }
                if (mutationTouched) {
                    result.needsFullRefresh = true;
                } else {
                    result.dirtyIds.push(blockId);
                }
            }
        }
    }
    return result;
}

export function sharedVariables (event) {
    let needsWorkspaceRefresh = false;

    const path = event.path;

    if (path.length === 0) {
        event.changes.keys.forEach((change, targetId) => {
            if (change.action !== 'add' && change.action !== 'update') return;
            const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
            if (!target) return;
            const yTargetVarMap = event.target.get(targetId);
            if (!yTargetVarMap) return;
            yTargetVarMap.forEach((yVarMap, varId) => {
                handleSingleVariableSync(target, yVarMap, varId);
                needsWorkspaceRefresh = true;
            });
        });
    } else if (path.length === 1) {
        const targetId = path[0];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target) return needsWorkspaceRefresh;

        event.changes.keys.forEach((change, varId) => {
            const yVarMap = event.target.get(varId);
            if (change.action === 'add' || change.action === 'update') {
                if (handleSingleVariableSync(target, yVarMap, varId)) {
                    needsWorkspaceRefresh = true;
                }
            } else if (change.action === 'delete') {
                
                target.deleteVariable(varId, true);
                needsWorkspaceRefresh = true;
            }
        });
    } else if (path.length === 2) {
        const targetId = path[0];
        const varId = path[1];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target) return needsWorkspaceRefresh;

        if (handleSingleVariableSync(target, event.target, varId)) {
            needsWorkspaceRefresh = true;
        }
    }
    return needsWorkspaceRefresh;
}

function syncBroadcastOptionFields(varId, name) {
    const blockContainers = new Set(constants.mutableRefs.vm.runtime.targets.map(i => i.blocks));
    if (constants.mutableRefs.vm.runtime.flyoutBlocks) blockContainers.add(constants.mutableRefs.vm.runtime.flyoutBlocks);

    for (const blockContainer of blockContainers) {
        let containerUpdated = false;
        for (const block of Object.values(blockContainer._blocks)) {
            const broadcastOption = block.fields && block.fields.BROADCAST_OPTION;
            if (broadcastOption && broadcastOption.id === varId && broadcastOption.value !== name) {
                broadcastOption.value = name;
                containerUpdated = true;
            }
        }
        if (containerUpdated && blockContainer.resetCache) blockContainer.resetCache();
    }
}

function handleSingleVariableSync(target, yVarMap, varId) {
    if (!yVarMap || typeof yVarMap.get !== 'function') return false;

    const name = yVarMap.get('name');
    const type = yVarMap.get('type');
    const isCloud = yVarMap.get('isCloud');
    let value = yVarMap.get('value');
    let didChange = false;

    if (type === 'list') {
        try { value = JSON.parse(value); } catch (e) { }
    }

    if (!target.variables[varId]) {
        target.createVariable(varId, name, type, isCloud, true);
        didChange = true;
    }

    const variable = target.variables[varId];
    if (!variable) return didChange;

    if (typeof name !== 'undefined' && variable.name !== name) {
        variable.name = name;
        didChange = true;
    }

    if (variable.type === 'broadcast_msg') {
        if (typeof name !== 'undefined' && variable.value !== name) {
            variable.value = name;
            didChange = true;
        }
        if (didChange) syncBroadcastOptionFields(varId, variable.name);
    } else if (JSON.stringify(variable.value) !== JSON.stringify(value)) {
        variable.value = value;
        didChange = true;
    }

    return didChange;
}

export function sharedMonitors (event) {
    const path = event.path;
    if (path.length === 0) {
        event.changes.keys.forEach((change, monitorId) => {
            if (change.action === 'add' || change.action === 'update') {
                const yMonitorMap = event.target.get(monitorId);
                const monitorData = helper.deserializeMonitorFromYjs(yMonitorMap, constants.mutableRefs.vm.runtime);
                monitorData.id = monitorId;
                constants.mutableRefs.vm.deserializeMonitor(monitorData);
            } else if (change.action === 'delete') {
                constants.mutableRefs.vm.runtime.requestRemoveMonitor(monitorId, true);
            }
        });
    }
    else if (path.length === 1) {
        const monitorId = path[0];
        const yMonitorMap = event.target;
        const monitorData = helper.deserializeMonitorFromYjs(yMonitorMap, constants.mutableRefs.vm.runtime);
        monitorData.id = monitorId;
        constants.mutableRefs.vm.deserializeMonitor(monitorData);
    }
}

export function sharedComments (event){
    let needsWorkspaceRefresh = false;
    const path = event.path;

    if (path.length === 0) {
        event.changes.keys.forEach((change, targetId) => {
            if (change.action === 'add') {
                const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
                if (!target) return;
                const yTargetCommentMap = event.target.get(targetId);
                yTargetCommentMap.forEach((yCommentMap, commentId) => {
                    const commentData = helper.deserializeCommentFromYjs(yCommentMap);
                    if (!target.comments[commentId]) {
                        target.createComment(
                            commentData.id, commentData.blockId, commentData.text,
                            commentData.x, commentData.y, commentData.width,
                            commentData.height, commentData.minimized, true
                        );
                        needsWorkspaceRefresh = true;
                    }
                });
            }
        });
    } else if (path.length === 1) {
        const targetId = path[0];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target) return needsWorkspaceRefresh;

        event.changes.keys.forEach((change, commentId) => {
            if (change.action === 'add' || change.action === 'update') {
                const yCommentMap = event.target.get(commentId);
                if (!yCommentMap) return;
                const commentData = helper.deserializeCommentFromYjs(yCommentMap);

                if (!target.comments[commentId]) {
                    target.createComment(
                        commentData.id, commentData.blockId, commentData.text,
                        commentData.x, commentData.y, commentData.width,
                        commentData.height, commentData.minimized, true
                    );
                } else {
                    Object.assign(target.comments[commentId], commentData);
                }
            } else if (change.action === 'delete') {
                const deletedComment = target.comments[commentId];
                if (deletedComment && deletedComment.blockId) {
                    const owningBlock = target.blocks.getBlock(deletedComment.blockId);
                    if (owningBlock && owningBlock.comment === commentId) {
                        delete owningBlock.comment;
                    }
                }
                delete target.comments[commentId];
            }
        });
        needsWorkspaceRefresh = true;
    } else if (path.length === 2) {
        const [targetId, commentId] = path;
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target || !target.comments[commentId]) return needsWorkspaceRefresh;

        event.changes.keys.forEach((change, key) => {
            target.comments[commentId][key] = event.target.get(key);
        });
        needsWorkspaceRefresh = true;
    }
    return needsWorkspaceRefresh;
}
