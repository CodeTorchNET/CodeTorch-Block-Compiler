import * as constants from './constants.js';
import * as helper from './helper.js';

export function sharedBlocks(event){
    let needsWorkspaceRefresh = false;
    let needsToolboxRefresh = false;
    const path = event.path;
    if (path.length === 0) {
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
                            needsToolboxRefresh = true;
                        }
                        needsWorkspaceRefresh = true;
                    }
                });
            }
        });
    }
    else if (path.length === 1) {
        const targetId = path[0];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);

        if (!target) return;

        event.changes.keys.forEach((change, blockId) => {
            if (blockId === '__targetName') return;
            if (change.action === 'add') {
                const yBlockMap = event.target.get(blockId);
                const block = helper.deserializeBlockFromYjs(yBlockMap);

                if (target.blocks.getBlock(blockId)) {
                    Object.assign(target.blocks._blocks[blockId], block);
                } else {
                    target.blocks.createBlock(block);
                }
                if (block.opcode === 'procedures_prototype') {
                    needsToolboxRefresh = true;
                }
                needsWorkspaceRefresh = true;
            }
            else if (change.action === 'delete') {
                target.blocks.deleteBlock(blockId);
                needsWorkspaceRefresh = true;
            }
        });
    }
    else if (path.length === 2) {
        const targetId = path[0];
        const blockId = path[1];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);

        if (target) {
            const block = target.blocks.getBlock(blockId);
            if (block) {
                event.changes.keys.forEach((change, key) => {
                    if (change.action === 'add' || change.action === 'update') {
                        let val = event.target.get(key);

                        if (key.startsWith('["')) {
                            try {
                                const pathParts = JSON.parse(key);
                                let current = block;
                                for (let i = 0; i < pathParts.length - 1; i++) {
                                    const part = pathParts[i];
                                    if (!current[part]) current[part] = {};
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
                    needsToolboxRefresh = true;
                }
                needsWorkspaceRefresh = true;
            }
        }
    }
    return [needsWorkspaceRefresh,needsToolboxRefresh];
}

export function sharedBlocksRefresh(needsToolboxRefresh,needsWorkspaceRefresh){
    if (needsToolboxRefresh) {
        const workspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
        if (workspace) {
            
            workspace.refreshToolboxSelection_();
        }
    }

    if (needsWorkspaceRefresh) {
        if (constants.mutableRefs.vm.editingTarget) {
            const blocks = constants.mutableRefs.vm.editingTarget.blocks;
            if (typeof blocks.validateAndRepair === 'function') blocks.validateAndRepair();
            constants.mutableRefs.vm.emitWorkspaceUpdate();
        }
    }
}

export function sharedVariables (event) {
    let needsWorkspaceRefresh = false;

    const path = event.path;

    if (path.length === 0) {
        event.changes.keys.forEach((change, targetId) => {
            if (change.action === 'add') {
                const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
                if (!target) return;
                const yTargetVarMap = event.target.get(targetId);
                yTargetVarMap.forEach((yVarMap, varId) => {
                    handleSingleVariableSync(target, yVarMap, varId);
                    needsWorkspaceRefresh = true;
                });
            }
        });
    } else if (path.length === 1) {
        const targetId = path[0];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target) return;

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
        if (!target || !target.variables[varId]) return;

        event.changes.keys.forEach((change, key) => {
            let val = event.target.get(key);
            if (key === 'value' && target.variables[varId].type === 'list') {
                try { val = JSON.parse(val); } catch (e) { }
            }

            
            target.variables[varId][key] = val;

            if (target.variables[varId].type === 'broadcast_msg' && (key === 'name' || key === 'value')) {
                const newName = target.variables[varId].name;
                if (target.variables[varId].value !== newName) {
                    target.variables[varId].value = newName;
                }

                let updateCount = 0;
                const blockContainers = new Set(constants.mutableRefs.vm.runtime.targets.map(i => i.blocks));
                if (constants.mutableRefs.vm.runtime.flyoutBlocks) blockContainers.add(constants.mutableRefs.vm.runtime.flyoutBlocks);

                for (const blockContainer of blockContainers) {
                    let containerUpdated = false;
                    for (const block of Object.values(blockContainer._blocks)) {
                        const broadcastOption = block.fields && block.fields.BROADCAST_OPTION;
                        if (broadcastOption && broadcastOption.id === varId) {
                            if (broadcastOption.value !== newName) {
                                
                                broadcastOption.value = newName;
                                updateCount++;
                                containerUpdated = true;
                            }
                        }
                    }
                    if (containerUpdated && blockContainer.resetCache) {
                        blockContainer.resetCache();
                    }
                }
            }
        });
        needsWorkspaceRefresh = true;
    }
    return needsWorkspaceRefresh;
}

function handleSingleVariableSync(target, yVarMap, varId) {
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

    if (JSON.stringify(target.variables[varId].value) !== JSON.stringify(value)) {
        if (type === 'broadcast_msg') {
            if (target.variables[varId].value !== name) {
                target.variables[varId].value = name;
                target.variables[varId].name = name;
            }
            
            const blockContainers = new Set(constants.mutableRefs.vm.runtime.targets.map(i => i.blocks));
            if (constants.mutableRefs.vm.runtime.flyoutBlocks) blockContainers.add(constants.mutableRefs.vm.runtime.flyoutBlocks);

            for (const blockContainer of blockContainers) {
                for (const block of Object.values(blockContainer._blocks)) {
                    const broadcastOption = block.fields && block.fields.BROADCAST_OPTION;
                    if (broadcastOption && broadcastOption.id === varId) {
                        if (broadcastOption.value !== name) {
                            broadcastOption.value = name;
                        }
                    }
                }
                if (blockContainer.resetCache) blockContainer.resetCache();
            }
        } else {
            target.variables[varId].value = value;
        }
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
        constants.mutableRefs.vm.emitWorkspaceUpdate();
    }
    else if (path.length === 1) {
        const monitorId = path[0];
        const yMonitorMap = event.target;
        const monitorData = helper.deserializeMonitorFromYjs(yMonitorMap, constants.mutableRefs.vm.runtime);
        monitorData.id = monitorId;
        constants.mutableRefs.vm.deserializeMonitor(monitorData);
        constants.mutableRefs.vm.emitWorkspaceUpdate();
    }
}

export function sharedComments (event){
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
                    }
                });
                constants.mutableRefs.vm.emitWorkspaceUpdate();
            }
        });
    } else if (path.length === 1) {
        const targetId = path[0];
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target) return;

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
                delete target.comments[commentId];
            }
        });
        constants.mutableRefs.vm.emitWorkspaceUpdate();
    } else if (path.length === 2) {
        const [targetId, commentId] = path;
        const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
        if (!target || !target.comments[commentId]) return;

        event.changes.keys.forEach((change, key) => {
            target.comments[commentId][key] = event.target.get(key);
        });
        constants.mutableRefs.vm.emitWorkspaceUpdate();
    }              
}