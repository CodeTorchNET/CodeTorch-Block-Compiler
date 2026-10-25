import blockDefinitions from './blockDefinitions.js';
import {store} from '../state/sessions.js';

export default class helpers {
    constructor () {
    }
    static FireAnimation = '<style>@keyframes scaleUpDown{0%,100%{transform:scaleY(1) scaleX(1)}50%,90%{transform:scaleY(1.1)}75%{transform:scaleY(.95)}80%{transform:scaleX(.95)}}@keyframes shake{0%,100%{transform:skewX(0) scale(1)}50%{transform:skewX(5deg) scale(.9)}}@keyframes particleUp{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0;top:-100%;transform:scale(.5)}}@keyframes glow{0%,100%{background-color:#ef5a00}50%{background-color:#ff7800}}.fire{width:60px;height:60px;background-color:transparent;margin-left:8px;margin-top:17px;position:relative;display:block;}.fire-center{position:absolute;height:100%;width:100%;animation:scaleUpDown 3s ease-out;animation-iteration-count:infinite;animation-fill-mode:both}.fire-center .main-fire{position:absolute;width:100%;height:100%;background-image:radial-gradient(farthest-corner at 10px 0,#d43300 0,#ef5a00 95%);transform:scaleX(.8) rotate(45deg);border-radius:0 40% 60% 40%;filter:drop-shadow(0 0 10px #d43322)}.fire-center .particle-fire{position:absolute;top:60%;left:45%;width:2px;height:2px;background-color:#ef5a00;border-radius:50%;filter:drop-shadow(0 0 10px #d43322);animation:particleUp 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-right{height:100%;width:100%;position:absolute;animation:shake 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-right .main-fire{position:absolute;top:15%;right:-25%;width:80%;height:80%;background-color:#ef5a00;transform:scaleX(.8) rotate(45deg);border-radius:0 40% 60% 40%;filter:drop-shadow(0 0 10px #d43322)}.fire-right .particle-fire{position:absolute;top:45%;left:50%;width:3.0303030303030303px;height:3.0303030303030303px;background-color:#ef5a00;transform:scaleX(.8) rotate(45deg);border-radius:50%;filter:drop-shadow(0 0 10px #d43322);animation:particleUp 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-left{position:absolute;height:100%;width:100%;animation:shake 3s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-left .main-fire{position:absolute;top:15%;left:-20%;width:80%;height:80%;background-color:#ef5a00;transform:scaleX(.8) rotate(45deg);border-radius:0 40% 60% 40%;filter:drop-shadow(0 0 10px #d43322)}.fire-left .particle-fire{position:absolute;top:10%;left:20%;width:10%;height:10%;background-color:#ef5a00;border-radius:50%;filter:drop-shadow(0 0 10px #d43322);animation:particleUp 3s infinite ease-out 0;animation-fill-mode:both}.fire-bottom .main-fire{position:absolute;top:30%;left:20%;width:75%;height:75%;background-color:#ff7800;transform:scaleX(.8) rotate(45deg);border-radius:0 40% 100% 40%;filter:blur(10px);animation:glow 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}</style><div class=fire><div class=fire-left><div class=main-fire></div><div class=particle-fire></div></div><div class=fire-center><div class=main-fire></div><div class=particle-fire></div></div><div class=fire-right><div class=main-fire></div><div class=particle-fire></div></div><div class=fire-bottom><div class=main-fire></div></div></div>';
    /** The addon API object, set once by main.init(). */
    static get addon () {
        return store.addon;
    }
    static getWorkspace () {
        const addon = store.addon;
        return addon ? addon.tab.traps.getWorkspace() : null;
    }
    static getVM () {
        const addon = store.addon;
        return addon ? addon.tab.traps.vm : window.vm;
    }
    static isLightTheme () {
        const addon = store.addon;
        try {
            return addon.tab.redux.state.scratchGui.theme.theme.gui === 'light';
        } catch (e) {
            return false;
        }
    }
    /** Shows one of the GUI's own alerts. */
    static showAlert (alertId) {
        try {
            window.ReduxStore.dispatch({type: 'scratch-gui/alerts/SHOW_ALERT', alertId});
        } catch (e) {
            console.error('[Torchy] could not show alert', alertId, e);
        }
    }
    static currentSpriteName () {
        return helpers.getVM().runtime.getEditingTarget().sprite.name;
    }
    static workspaceVariables (includeBroadcast = false, workspace) {
        const allVariables = workspace.getAllVariables(); // Get all variables
        const lists = allVariables.filter(variable => variable.type === 'list');
        const listNames = lists.map(list => list.name);
        const variables = allVariables.filter(variable => variable.type === '');
        const variableNames = variables.map(variable => variable.name);
        if (includeBroadcast) {
            const broadcastNames = workspace.getAllVariables().filter(variable => variable.type === 'broadcast_msg')
                .map(variable => variable.name);
            return [listNames, variableNames, broadcastNames];
        }
        return [listNames, variableNames];
    }
    static getCustomBlockNames (xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

        const result = [];

        // Find all blocks of type 'procedures_definition'
        const blocks = xmlDoc.getElementsByTagName('block');

        for (const block of blocks) {
            if (block.getAttribute('type') !== 'procedures_definition') continue;

            const mutation = helpers.getPrototypeMutation(block);
            if (mutation && mutation.hasAttribute('proccode')) {
                result.push({
                    blockId: block.getAttribute('id'),
                    customBlockName: mutation.getAttribute('proccode')
                });
            }
        }

        return result;
    }
    static getPrototypeMutation (definitionBlock) {
        for (const child of Array.from(definitionBlock.children)) {
            if (child.tagName !== 'statement' && child.tagName !== 'value') continue;
            for (const shadow of Array.from(child.children)) {
                if (shadow.tagName !== 'shadow' || shadow.getAttribute('type') !== 'procedures_prototype') continue;
                for (const node of Array.from(shadow.children)) {
                    if (node.tagName === 'mutation') return node;
                }
            }
        }
        return null;
    }
    static generateExtensionDefinitions (runtime) {
        const definitions = [];
        if (!runtime || !runtime._blockInfo) return definitions;

        // Core categories that are already covered by blockDefinitions.js
        const ignoredCategories = ['motion', 'looks', 'sound', 'events', 'control', 'sensing', 'operators', 'data', 'myBlocks', 'procedures'];

        for (const category of runtime._blockInfo) {
            if (ignoredCategories.includes(category.id)) continue;

            for (const block of category.blocks) {
                // Skip separators, buttons, etc.
                if (typeof block !== 'object' || !block.info || !block.json) continue;
                const info = block.info;
                if (info.hideFromPalette) continue;
                // Map BlockType to Torchy shape
                let shape = 'stack';
                if (info.blockType === 'reporter') shape = 'reporter';
                else if (info.blockType === 'boolean') shape = 'boolean';
                else if (info.blockType === 'hat' || info.blockType === 'event') shape = 'hat';
                else if (info.blockType === 'conditional' || info.blockType === 'loop') shape = 'c-block';

                // Construct ID (Extension blocks usually follow extensionId_opcode)
                // However, runtime._blockInfo often stores just the opcode in info.opcode,
                // while json.type has the full ID.
                const id = block.json.type;

                // Parse text and arguments to build spec and input list
                const argsMap = info.arguments || {};
                const inputs = [];
                const xmlArgs = [];
                
                let argCounter = 1;
                
                // Replace [ARG_NAME] with %1, %2, etc.
                let spec = info.text.replace(/\[([^\]]+)\]/g, (match, argName) => {
                    const argDef = argsMap[argName] || {};
                    let typeCode = '%s'; // Default string
                    let shadowType = 'text';
                    let fieldName = 'TEXT';
                    const variableType = null;

                    // Determine type based on argument definition
                    if (argDef.type === 'number') {
                        typeCode = '%n';
                        shadowType = 'math_number';
                        fieldName = 'NUM';
                    } else if (argDef.type === 'angle') {
                        typeCode = '%n';
                        shadowType = 'math_angle';
                        fieldName = 'NUM';
                    } else if (argDef.type === 'color') {
                        typeCode = '%c';
                        shadowType = 'colour_picker';
                        fieldName = 'COLOUR';
                    } else if (argDef.type === 'boolean') {
                        typeCode = '%b';
                        shadowType = null; // Boolean inputs usually don't have shadows in extensions context unless specialized
                    } else if (argDef.menu) {
                        typeCode = `%m.${argDef.menu}`;
                        // Extension menus usually follow this ID pattern
                        shadowType = `${category.id}_menu_${argDef.menu}`;
                        fieldName = argDef.menu;
                    }

                    inputs.push(typeCode);

                    // Build XML arg definition
                    const xmlArg = {
                        name: argName,
                        shadow: shadowType,
                        field: fieldName,
                        default: argDef.defaultValue !== undefined ? argDef.defaultValue : ''
                    };
                    
                    if (variableType) xmlArg.variableType = variableType;
                    
                    xmlArgs.push(xmlArg);

                    return `%${argCounter++}`;
                });

                const isConflict = blockDefinitions.some(
                    def => def.spec === spec && def.inputs.length === inputs.length
                );
        
                if (isConflict) {
                    spec = `${category.id} ${spec}`;
                }

                definitions.push({
                    id: id,
                    spec: spec,
                    inputs: inputs,
                    shape: shape,
                    category: category.id,
                    xml: {
                        args: xmlArgs
                    }
                });
            }
        }
        return definitions;
    }
}
