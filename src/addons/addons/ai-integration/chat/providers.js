export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

const OPENROUTER_HEADERS = {
    'HTTP-Referer': 'https://codetorch.net',
    'X-Title': 'CodeTorch Torchy'
};

const trimSlash = url => String(url || '').trim()
    .replace(/\/+$/, '');

/**
 * @typedef {object} ModelQuery
 * @property {string} group  label of the dropdown group these models go in ('' = provider name only)
 * @property {string} path   path + query appended to baseUrl
 */

/**
 * @typedef {object} Provider
 * @property {string} id
 * @property {string} name          shown as the dropdown group label
 * @property {string} baseUrl       OpenAI-compatible base URL, no trailing slash
 * @property {string} apiKey        '' when the provider needs no key
 * @property {object} headers       extra request headers
 * @property {ModelQuery[]} modelQueries  queries that fill the dropdown, in display order
 */

/**
 * Build the list of active providers from the addon settings, in display order.
 * @param {object} settings  raw addon settings keyed by setting id
 * @returns {Provider[]}
 */
export function buildProviders (settings = {}) {
    const providers = [];

    const geminiKey = String(settings.GeminiAPIKey || '').trim();
    if (geminiKey) {
        providers.push({
            id: 'gemini',
            name: 'Google Gemini',
            baseUrl: GEMINI_BASE_URL,
            apiKey: geminiKey,
            headers: {},
            modelQueries: [{group: '', path: '/models'}]
        });
    }

    const openrouterKey = String(settings.OpenRouterAPIKey || '').trim();
    if (openrouterKey) {
        providers.push({
            id: 'openrouter',
            name: 'OpenRouter',
            baseUrl: OPENROUTER_BASE_URL,
            apiKey: openrouterKey,
            headers: OPENROUTER_HEADERS,
            modelQueries: [
                {group: 'Popular for coding', path: '/models?sort=top-weekly&category=programming'},
                {group: 'Free', path: '/models?sort=top-weekly&max_price=0'}
            ]
        });
    }

    const customUrl = trimSlash(settings.CustomBaseURL);
    if (settings.CustomEnabled && customUrl) {
        providers.push({
            id: 'custom',
            name: 'Custom API',
            baseUrl: customUrl,
            apiKey: String(settings.CustomAPIKey || '').trim(),
            headers: {},
            modelQueries: [{group: '', path: '/models'}]
        });
    }

    return providers;
}

/**
 * Headers for a request to a provider. The Authorization header is only sent when there is a key,
 * so key-less local servers are not confused by an empty bearer token.
 * @param {Provider} provider
 * @param {boolean} json  add Content-Type for a JSON body
 */
export function requestHeaders (provider, json = false) {
    const headers = Object.assign({}, provider.headers);
    if (json) headers['Content-Type'] = 'application/json';
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
    return headers;
}
