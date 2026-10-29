import {createSSEParser, readPayload, readCompletionObject} from '../../../src/addons/addons/ai-integration/chat/sse.js';

const chunk = content => `data: ${JSON.stringify({choices: [{delta: {content}}]})}\n\n`;

describe('Torchy SSE reader', () => {
    test('splits data lines across network chunks and ignores comments', () => {
        const sse = createSSEParser();
        const first = sse.push(': OPENROUTER PROCESSING\n\n' + chunk('Hel').slice(0, 20));
        expect(first).toEqual([]);
        const second = sse.push(chunk('Hel').slice(20) + chunk('lo') + 'data: [DONE]');
        expect(second.map(readPayload)).toEqual([{content: 'Hel'}, {content: 'lo'}]);
        expect(sse.end().map(readPayload)).toEqual([{done: true}]);
    });

    test('handles CRLF line endings', () => {
        const sse = createSSEParser();
        const payloads = sse.push(chunk('a').replace(/\n/g, '\r\n'));
        expect(payloads.map(readPayload)).toEqual([{content: 'a'}]);
    });

    test('surfaces mid-stream errors and tolerates junk', () => {
        expect(readPayload('{"error":{"message":"Rate limit exceeded","code":429}}')).toEqual({error: 'Rate limit exceeded'});
        expect(readPayload('{"error":"nope"}')).toEqual({error: 'nope'});
        expect(readPayload('not json')).toEqual({});
        expect(readPayload('{"choices":[{"delta":{"role":"assistant"}}]}')).toEqual({});
    });

    test('reads non-streamed completions and content parts', () => {
        expect(readCompletionObject({choices: [{message: {content: 'full'}}]})).toEqual({content: 'full'});
        expect(readCompletionObject({choices: [{delta: {content: [{type: 'text', text: 'a'}, 'b']}}]})).toEqual({content: 'ab'});
        expect(readCompletionObject(null)).toEqual({});
    });
});
