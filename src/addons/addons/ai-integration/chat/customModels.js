export const CUSTOM_MODELS_GROUP = 'Your models';
const STORAGE_KEY = 'torchy:customModels';

function defaultStorage () {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch (e) {
        return null; // blocked storage throws on access in some browsers
    }
}

/** Provider ids and `models/` prefixes aside, a model id is sent exactly as typed. */
export function cleanModelId (raw) {
    return String(raw || '').trim().replace(/^models\//, '');
}

/** @returns {Object<string, string[]>} typed-in model ids keyed by provider id */
export function loadCustomModelIds (storage = defaultStorage()) {
    if (!storage) return {};
    try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out = {};
        for (const [providerId, ids] of Object.entries(parsed)) {
            if (!Array.isArray(ids)) continue;
            const clean = ids.map(cleanModelId).filter(Boolean);
            if (clean.length) out[providerId] = Array.from(new Set(clean));
        }
        return out;
    } catch (e) {
        return {};
    }
}

function saveCustomModelIds (byProvider, storage) {
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(byProvider));
    } catch (e) {
        // Storage full or blocked
    }
}

/** @returns {import('./models.js').TorchyModel} */
export function makeCustomModel (providerId, modelId) {
    const id = cleanModelId(modelId);
    return {key: `${providerId}:${id}`, providerId, modelId: id, name: id, free: null, group: CUSTOM_MODELS_GROUP, custom: true};
}

/**
 * Remember a typed-in model id for a provider and return its model. Null for a blank id.
 */
export function addCustomModelId (providerId, modelId, storage = defaultStorage()) {
    const id = cleanModelId(modelId);
    if (!id) return null;
    const byProvider = loadCustomModelIds(storage);
    const ids = byProvider[providerId] || [];
    if (!ids.includes(id)) byProvider[providerId] = ids.concat(id);
    saveCustomModelIds(byProvider, storage);
    return makeCustomModel(providerId, id);
}

export function removeCustomModelId (providerId, modelId, storage = defaultStorage()) {
    const id = cleanModelId(modelId);
    const byProvider = loadCustomModelIds(storage);
    const ids = (byProvider[providerId] || []).filter(known => known !== id);
    if (ids.length) byProvider[providerId] = ids;
    else delete byProvider[providerId];
    saveCustomModelIds(byProvider, storage);
}

/**
 * The fetched models plus the typed-in ones of every active provider. A typed-in id the provider
 * also lists is dropped in favour of the listed entry, so nothing shows twice.
 * @param {import('./models.js').TorchyModel[]} fetched
 * @param {import('./providers.js').Provider[]} providers
 */
export function withCustomModels (fetched, providers, storage = defaultStorage()) {
    const byProvider = loadCustomModelIds(storage);
    const models = fetched.filter(model => !model.custom);
    const known = new Set(models.map(model => model.key));
    for (const provider of providers) {
        for (const id of byProvider[provider.id] || []) {
            const model = makeCustomModel(provider.id, id);
            if (known.has(model.key)) continue;
            known.add(model.key);
            models.push(model);
        }
    }
    return models;
}
