import {adoptIds} from '../collab-snapshot.js';

export const buildIdsSidecar = vm => vm.runtime.targets
    .filter(t => t.isOriginal)
    .map(t => ({
        id: t.id,
        name: t.getName(),
        costumeIds: ((t.sprite && t.sprite.costumes) || []).map(c => c.id),
        soundIds: ((t.sprite && t.sprite.sounds) || []).map(s => s.id)
    }));

export const adoptHeadIds = (vm, headIds) => {
    if (!Array.isArray(headIds) || !headIds.length) return false;
    return adoptIds(vm, headIds, 'rewind');
};
