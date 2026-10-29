import {requestHeaders} from './providers.js';

const MODELS_TIMEOUT_MS = 20000;

// Gemini's model list includes embedding, image, video and speech models that cannot chat.
const GEMINI_NON_CHAT = /embedding|imagen|veo|tts|image|audio|live|robotics|aqa|learnlm|computer-use/i;

/**
 * @typedef {object} TorchyModel
 * @property {string} key        unique across providers: `${providerId}:${modelId}`
 * @property {string} providerId
 * @property {string} modelId    the id sent as `model` in chat requests
 * @property {string} name       display name
 * @property {boolean|null} free  true/false when the provider publishes pricing, null otherwise
 * @property {string} group      dropdown group label within the provider ('' = none)
 */

const isZeroPrice = value => value === undefined || value === null || Number(value) === 0;

/**
 * Turn one entry of a `/models` response into a TorchyModel, or null if it is not a chat model.
 * @param {import('./providers.js').Provider} provider
 * @param {object} raw
 * @param {string} group
 * @returns {TorchyModel|null}
 */
export function normalizeModel (provider, raw, group = '') {
    if (!raw || typeof raw.id !== 'string') return null;
    // Gemini's OpenAI layer lists ids as "models/gemini-…"; chat accepts the bare id.
    const modelId = raw.id.trim().replace(/^models\//, '');
    if (!modelId) return null;
    if (provider.id === 'gemini') {
        if (!/gemini/i.test(modelId) || GEMINI_NON_CHAT.test(modelId)) return null;
    }

    let free = null;
    if (raw.pricing && typeof raw.pricing === 'object') {
        free = isZeroPrice(raw.pricing.prompt) && isZeroPrice(raw.pricing.completion);
    }

    const name = typeof raw.name === 'string' && raw.name.trim() && raw.name !== raw.id ? raw.name.trim() : modelId;
    return {key: `${provider.id}:${modelId}`, providerId: provider.id, modelId, name, free, group};
}

function withTimeout (promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function describeFailure (response) {
    let detail = '';
    try {
        const text = await response.text();
        try {
            const parsed = JSON.parse(text);
            const value = parsed && (parsed.error || parsed.message);
            detail = typeof value === 'string' ? value : value && value.message ? value.message : '';
        } catch (e) {
            detail = text;
        }
    } catch (e) {
        detail = '';
    }
    detail = String(detail || '').trim().slice(0, 200);
    if (response.status === 401 || response.status === 403 || /api key/i.test(detail)) return 'the API key was rejected';
    return `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
}

/**
 * Fetch the models of one provider. Never throws: a failure comes back as `error`.
 * @param {import('./providers.js').Provider} provider
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{models: TorchyModel[], error: string|null}>}
 */
export async function fetchProviderModels (provider, fetchImpl = fetch) {
    const models = [];
    const seen = new Set();
    let error = null;

    for (const query of provider.modelQueries) {
        try {
            const response = await withTimeout(
                fetchImpl(`${provider.baseUrl}${query.path}`, {method: 'GET', headers: requestHeaders(provider)}),
                MODELS_TIMEOUT_MS,
                'the server did not respond in time'
            );
            if (!response.ok) throw new Error(await describeFailure(response));
            const body = await response.json();
            const list = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
            for (const raw of list) {
                const model = normalizeModel(provider, raw, query.group);
                if (!model || seen.has(model.key)) continue;
                seen.add(model.key);
                models.push(model);
            }
        } catch (e) {
            const message = e && e.message ? e.message : String(e);
            error = /Failed to fetch|NetworkError|Load failed/i.test(message) ?
                'could not reach the server (is it running, and does it allow browser requests?)' :
                message;
            break;
        }
    }

    if (!error && models.length === 0) error = 'the server returned no chat models';
    return {models, error};
}

/**
 * Fetch the models of every active provider in parallel.
 * @param {import('./providers.js').Provider[]} providers
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{models: TorchyModel[], errors: Object<string, string>}>}
 */
export async function fetchAllModels (providers, fetchImpl = fetch) {
    const results = await Promise.all(providers.map(provider => fetchProviderModels(provider, fetchImpl)));
    const models = [];
    const errors = {};
    results.forEach((result, index) => {
        models.push(...result.models);
        if (result.error) errors[providers[index].id] = result.error;
    });
    return {models, errors};
}

/**
 * The model to preselect when a session has none: a Gemini flash model when available (fast, the
 * most tested for Torchy's block syntax), otherwise the first model offered.
 * @param {TorchyModel[]} models
 * @returns {TorchyModel|null}
 */
export function pickDefaultModel (models) {
    if (!models.length) return null;
    const flash = models.find(m =>
        m.providerId === 'gemini' && /flash/i.test(m.modelId) && !/lite|preview|exp|8b|thinking/i.test(m.modelId)
    );
    return flash || models.find(m => m.providerId === 'gemini' && /flash/i.test(m.modelId)) || models[0];
}
