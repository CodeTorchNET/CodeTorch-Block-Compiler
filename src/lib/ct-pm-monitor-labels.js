import {defineMessages} from 'react-intl';

const messages = defineMessages({
    looks_tintColor: {defaultMessage: 'tint color', description: 'Monitor label', id: 'ct.pm.monitor.tintColor'},
    looks_layersGetLayer: {defaultMessage: 'layer', description: 'Monitor label', id: 'ct.pm.monitor.layer'},
    looks_stretchGetX: {defaultMessage: 'x stretch', description: 'Monitor label', id: 'ct.pm.monitor.stretchX'},
    looks_stretchGetY: {defaultMessage: 'y stretch', description: 'Monitor label', id: 'ct.pm.monitor.stretchY'},
    looks_getSpriteVisible: {defaultMessage: 'visible?', description: 'Monitor label', id: 'ct.pm.monitor.visible'},
    looks_sayWidth: {defaultMessage: 'bubble width', description: 'Monitor label', id: 'ct.pm.monitor.sayWidth'},
    looks_sayHeight: {defaultMessage: 'bubble height', description: 'Monitor label', id: 'ct.pm.monitor.sayHeight'},
    looks_getEffectValue: {
        defaultMessage: '{effect} effect',
        description: 'Monitor label for a graphic effect value',
        id: 'ct.pm.monitor.looksEffect'
    },
    sound_getEffectValue: {
        defaultMessage: '{effect} effect',
        description: 'Monitor label for a sound effect value',
        id: 'ct.pm.monitor.soundEffect'
    },
    sensing_mouseclicked: {
        defaultMessage: 'mouse clicked?',
        description: 'Monitor label',
        id: 'ct.pm.monitor.mouseclicked'
    },
    sensing_getclipboard: {defaultMessage: 'clipboard', description: 'Monitor label', id: 'ct.pm.monitor.clipboard'},
    sensing_getdragmode: {defaultMessage: 'draggable?', description: 'Monitor label', id: 'ct.pm.monitor.dragmode'},
    sensing_loggedin: {defaultMessage: 'logged in?', description: 'Monitor label', id: 'ct.pm.monitor.loggedin'}
});

const CATEGORY = {looks: 'looks', sound: 'sound', sensing: 'sensing'};

/**
 * Add the advanced reporters to an OpcodeLabels map, with their.
 * @param {object} map OpcodeLabels' opcode map
 * @param {function} translate translate
 */
export const addCtPmMonitorLabels = (map, translate) => {
    for (const opcode of Object.keys(messages)) {
        const message = messages[opcode];
        map[opcode] = {
            category: CATEGORY[opcode.split('_')[0]],
            labelFn: params => {
                const effect = params && params.EFFECT ? String(params.EFFECT).toLowerCase() : '';
                return translate(message, {effect}).replace('{effect}', effect);
            }
        };
    }
};
