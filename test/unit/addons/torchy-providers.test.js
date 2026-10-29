import {buildProviders, requestHeaders} from '../../../src/addons/addons/ai-integration/chat/providers.js';

describe('Torchy providers', () => {
    test('no settings means no providers', () => {
        expect(buildProviders({})).toEqual([]);
        expect(buildProviders({GeminiAPIKey: '  ', OpenRouterAPIKey: ''})).toEqual([]);
    });

    test('keys activate Gemini and OpenRouter in display order', () => {
        const providers = buildProviders({OpenRouterAPIKey: 'or-key', GeminiAPIKey: 'g-key'});
        expect(providers.map(p => p.id)).toEqual(['gemini', 'openrouter']);
        expect(providers[0].apiKey).toBe('g-key');
        expect(providers[1].modelQueries.map(q => q.group)).toEqual(['Popular for coding', 'Free']);
        expect(providers[1].modelQueries[0].path).toContain('sort=top-weekly');
    });

    test('custom provider requires the toggle and a URL', () => {
        expect(buildProviders({CustomEnabled: true, CustomBaseURL: ''})).toEqual([]);
        expect(buildProviders({CustomEnabled: false, CustomBaseURL: 'https://x/v1'})).toEqual([]);
        const [custom] = buildProviders({CustomEnabled: true, CustomBaseURL: 'https://api.groq.com/openai/v1/', CustomAPIKey: 'k'});
        expect(custom.baseUrl).toBe('https://api.groq.com/openai/v1');
        expect(custom.apiKey).toBe('k');
        const [local] = buildProviders({CustomEnabled: true, CustomBaseURL: 'http://localhost:11434/v1/// '});
        expect(local.baseUrl).toBe('http://localhost:11434/v1');
        expect(local.apiKey).toBe('');
    });

    test('Authorization is only sent when there is a key', () => {
        const [gemini] = buildProviders({GeminiAPIKey: 'g'});
        expect(requestHeaders(gemini, true)).toEqual({'Content-Type': 'application/json', Authorization: 'Bearer g'});
        const [local] = buildProviders({CustomEnabled: true, CustomBaseURL: 'http://localhost:11434/v1'});
        expect(requestHeaders(local)).toEqual({});
        const [openrouter] = buildProviders({OpenRouterAPIKey: 'o'});
        expect(requestHeaders(openrouter)['HTTP-Referer']).toBe('https://codetorch.net');
    });
});
