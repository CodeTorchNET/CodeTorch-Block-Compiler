import {
    addCustomModelId,
    removeCustomModelId,
    loadCustomModelIds,
    withCustomModels,
    CUSTOM_MODELS_GROUP
} from '../../../src/addons/addons/ai-integration/chat/customModels.js';

const fakeStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value))
    };
};

const providers = [{id: 'openrouter', name: 'OpenRouter'}, {id: 'custom', name: 'Custom API'}];

describe('Torchy typed-in models', () => {
    test('adding remembers a cleaned id once and returns its model', () => {
        const storage = fakeStorage();
        const model = addCustomModelId('openrouter', '  models/anthropic/claude-sonnet-4.5 ', storage);
        expect(model).toEqual({
            key: 'openrouter:anthropic/claude-sonnet-4.5', providerId: 'openrouter', modelId: 'anthropic/claude-sonnet-4.5',
            name: 'anthropic/claude-sonnet-4.5', free: null, group: CUSTOM_MODELS_GROUP, custom: true
        });
        addCustomModelId('openrouter', 'anthropic/claude-sonnet-4.5', storage);
        addCustomModelId('custom', 'llama3.1', storage);
        expect(loadCustomModelIds(storage)).toEqual({openrouter: ['anthropic/claude-sonnet-4.5'], custom: ['llama3.1']});
        expect(addCustomModelId('custom', '   ', storage)).toBeNull();
    });

    test('removing forgets the id and drops empty providers', () => {
        const storage = fakeStorage();
        addCustomModelId('custom', 'llama3.1', storage);
        addCustomModelId('custom', 'qwen2.5-coder', storage);
        removeCustomModelId('custom', 'llama3.1', storage);
        expect(loadCustomModelIds(storage)).toEqual({custom: ['qwen2.5-coder']});
        removeCustomModelId('custom', 'qwen2.5-coder', storage);
        expect(loadCustomModelIds(storage)).toEqual({});
    });

    test('corrupt or missing storage reads as nothing', () => {
        expect(loadCustomModelIds(fakeStorage({'torchy:customModels': '{not json'}))).toEqual({});
        expect(loadCustomModelIds(fakeStorage({'torchy:customModels': '[1,2]'}))).toEqual({});
        expect(loadCustomModelIds(null)).toEqual({});
        expect(withCustomModels([], providers, null)).toEqual([]);
    });

    test('merging appends typed-in models of active providers without duplicates', () => {
        const storage = fakeStorage();
        addCustomModelId('openrouter', 'deepseek/deepseek-chat', storage);
        addCustomModelId('openrouter', 'anthropic/claude-sonnet-4.5', storage);
        addCustomModelId('gemini', 'gemma-3-27b-it', storage); // gemini is not active below
        const fetched = [
            {key: 'openrouter:deepseek/deepseek-chat', providerId: 'openrouter', modelId: 'deepseek/deepseek-chat', name: 'DeepSeek', free: false, group: 'Popular'},
            {key: 'openrouter:stale', providerId: 'openrouter', modelId: 'stale', name: 'stale', free: null, group: '', custom: true}
        ];
        const merged = withCustomModels(fetched, providers, storage);
        expect(merged.map(m => m.key)).toEqual(['openrouter:deepseek/deepseek-chat', 'openrouter:anthropic/claude-sonnet-4.5']);
        expect(merged[0].custom).toBeUndefined();
        expect(merged[1].custom).toBe(true);
    });
});
