import Blocks from 'scratch-vm/src/engine/blocks';
import xmlEscape from 'scratch-vm/src/util/xml-escape';
import {findTarget} from '../../lib/rewind/state';

const variableXml = (v, isLocal) => `<variable type="${xmlEscape(v.type || '')}" id="${xmlEscape(v.id)}" ` +
    `islocal="${isLocal}" iscloud="${!!v.isCloud}">${xmlEscape(String(v.name))}</variable>`;

const commentXml = c => `<comment id="${xmlEscape(c.id)}" x="${c.x}" y="${c.y}" w="${c.width}" h="${c.height}" ` +
    `pinned="${c.blockId !== null && typeof c.blockId !== 'undefined'}" minimized="${!!c.minimized}">` +
    `${xmlEscape(String(c.text || ''))}</comment>`;

export const targetToWorkspaceXml = (state, targetId) => {
    const target = findTarget(state, targetId);
    if (!target) return null;
    const stage = state.targets.find(t => t.isStage) || target;
    const comments = {};
    for (const id of Object.keys(target.comments || {})) {
        const c = target.comments[id];
        comments[id] = {toXML: () => commentXml(Object.assign({id}, c))};
    }
    const serializer = {
        _blocks: target.blocks || {},
        blockToXML: Blocks.prototype.blockToXML,
        mutationToXML: Blocks.prototype.mutationToXML
    };
    const scripts = Object.keys(serializer._blocks).filter(id => {
        const b = serializer._blocks[id];
        return b && b.topLevel && !b.parent;
    });
    const globals = Object.keys(stage.variables || {}).map(id => variableXml(stage.variables[id], false));
    const locals = target.isStage ? [] :
        Object.keys(target.variables || {}).map(id => variableXml(target.variables[id], true));
    const workspaceComments = Object.keys(target.comments || {})
        .filter(id => !target.comments[id].blockId)
        .map(id => comments[id].toXML());
    const scriptXml = scripts.map(id => {
        try {
            return serializer.blockToXML(id, comments) || '';
        } catch (e) {
            return '';
        }
    });
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
        `${workspaceComments.join('')}${scriptXml.join('')}</xml>`;
};

export const workspaceKey = (state, targetId) => {
    const target = findTarget(state, targetId);
    if (!target) return '';
    const stage = state.targets.find(t => t.isStage) || target;
    const vars = v => Object.keys(v || {}).map(id => `${id}:${v[id].name}:${v[id].type}`)
        .join(',');
    return JSON.stringify([target.blocks, target.comments]) + vars(stage.variables) + vars(target.variables);
};
