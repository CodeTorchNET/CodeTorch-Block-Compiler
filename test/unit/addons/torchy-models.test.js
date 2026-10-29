import {buildProviders} from '../../../src/addons/addons/ai-integration/chat/providers.js';
import {normalizeModel, fetchProviderModels, fetchAllModels, pickDefaultModel} from '../../../src/addons/addons/ai-integration/chat/models.js';

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
});

describe('Torchy models', () => {
    const [gemini] = buildProviders({GeminiAPIKey: 'g'});
    const [openrouter] = buildProviders({OpenRouterAPIKey: 'o'});

    test('normalises Gemini ids and drops non-chat models', () => {
        expect(normalizeModel(gemini, {id: 'models/gemini-2.5-flash'})).toMatchObject({
            key: 'gemini:gemini-2.5-flash', modelId: 'gemini-2.5-flash', name: 'gemini-2.5-flash', free: null
        });
        expect(normalizeModel(gemini, {id: 'models/text-embedding-004'})).toBeNull();
        expect(normalizeModel(gemini, {id: 'models/gemini-2.5-flash-image'})).toBeNull();
        expect(normalizeModel(gemini, {id: 'models/imagen-4.0'})).toBeNull();
        expect(normalizeModel(gemini, {})).toBeNull();
    });

    test('reads OpenRouter pricing into the free flag', () => {
        const free = normalizeModel(openrouter, {id: 'a/b:free', name: 'A: B (free)', pricing: {prompt: '0', completion: '0'}}, 'Free');
        expect(free).toMatchObject({key: 'openrouter:a/b:free', name: 'A: B (free)', free: true, group: 'Free'});
        const paid = normalizeModel(openrouter, {id: 'a/c', name: 'A: C', pricing: {prompt: '0.000001', completion: '0'}});
        expect(paid.free).toBe(false);
    });

    test('runs every query of a provider and dedupes across groups', async () => {
        const calls = [];
        const fetchImpl = async url => {
            calls.push(url);
            if (url.includes('category=programming')) {
                return jsonResponse({data: [
                    {id: 'x/pro', name: 'Pro', pricing: {prompt: '1', completion: '1'}},
                    {id: 'y/free:free', name: 'Free one', pricing: {prompt: '0', completion: '0'}}
                ]});
            }
            return jsonResponse({data: [
                {id: 'y/free:free', name: 'Free one', pricing: {prompt: '0', completion: '0'}},
                {id: 'z/free:free', name: 'Other free', pricing: {prompt: '0', completion: '0'}}
            ]});
        };
        const {models, error} = await fetchProviderModels(openrouter, fetchImpl);
        expect(error).toBeNull();
        expect(calls).toHaveLength(2);
        expect(models.map(m => [m.modelId, m.group])).toEqual([
            ['x/pro', 'Popular for coding'], ['y/free:free', 'Popular for coding'], ['z/free:free', 'Free']
        ]);
    });

    test('reports failures per provider without throwing', async () => {
        const fetchImpl = async url => {
            if (url.startsWith(gemini.baseUrl)) return jsonResponse({error: {message: 'API key not valid'}}, 401);
            return jsonResponse({data: [{id: 'a/b', name: 'B'}]});
        };
        const {models, errors} = await fetchAllModels([gemini, openrouter], fetchImpl);
        expect(models.map(m => m.key)).toEqual(['openrouter:a/b']);
        expect(errors).toEqual({gemini: 'the API key was rejected'});

        // Gemini answers a bad key with 400, not 401
        const gemini400 = await fetchProviderModels(gemini, async () => jsonResponse({error: {message: 'Please pass a valid API key'}}, 400));
        expect(gemini400.error).toBe('the API key was rejected');
        const other400 = await fetchProviderModels(gemini, async () => jsonResponse({error: {message: 'bad request'}}, 400));
        expect(other400.error).toBe('HTTP 400: bad request');

        const network = await fetchProviderModels(gemini, async () => {
            throw new TypeError('Failed to fetch');
        });
        expect(network.models).toEqual([]);
        expect(network.error).toMatch(/could not reach the server/);

        const empty = await fetchProviderModels(gemini, async () => jsonResponse({data: []}));
        expect(empty.error).toMatch(/no chat models/);
    });

    test('prefers a plain Gemini flash model as default', () => {
        const models = [
            normalizeModel(openrouter, {id: 'a/b', name: 'B'}),
            normalizeModel(gemini, {id: 'models/gemini-2.5-pro'}),
            normalizeModel(gemini, {id: 'models/gemini-2.5-flash-lite'}),
            normalizeModel(gemini, {id: 'models/gemini-2.5-flash'})
        ];
        expect(pickDefaultModel(models).key).toBe('gemini:gemini-2.5-flash');
        expect(pickDefaultModel([models[0]]).key).toBe('openrouter:a/b');
        expect(pickDefaultModel([])).toBeNull();
    });
});
