export function createSSEParser () {
    let buffer = '';

    /**
     * Feed decoded text; returns the complete data payloads found so far.
     * @param {string} text
     * @returns {string[]}
     */
    const push = text => {
        buffer += text;
        const payloads = [];
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            const payload = dataOfLine(line);
            if (payload !== null) payloads.push(payload);
            newline = buffer.indexOf('\n');
        }
        return payloads;
    };

    /** Flush whatever is left when the stream closes without a final newline. */
    const end = () => {
        const line = buffer.replace(/\r$/, '');
        buffer = '';
        const payload = dataOfLine(line);
        return payload === null ? [] : [payload];
    };

    return {push, end};
}

function dataOfLine (line) {
    if (!line || line[0] === ':') return null;
    if (!line.startsWith('data:')) return null;
    return line.slice(5).replace(/^ /, '');
}

/**
 * Interpret one payload of an OpenAI-style stream.
 * @param {string} payload
 * @returns {{done?: true, content?: string, error?: string}}
 */
export function readPayload (payload) {
    if (payload === '[DONE]') return {done: true};
    let data;
    try {
        data = JSON.parse(payload);
    } catch (e) {
        // Not JSON: ignore (some servers send empty keep-alive data lines).
        return {};
    }
    return readCompletionObject(data);
}

/**
 * Pull the text (or error) out of a chat completion object, streamed chunk or full response.
 * @param {object} data
 * @returns {{content?: string, error?: string}}
 */
export function readCompletionObject (data) {
    if (!data || typeof data !== 'object') return {};
    if (data.error) {
        const err = data.error;
        const message = typeof err === 'string' ? err : err.message || JSON.stringify(err);
        return {error: message};
    }
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    if (!choice) return {};
    const delta = choice.delta || choice.message;
    if (!delta) return {};
    if (typeof delta.content === 'string') return {content: delta.content};
    // Some servers send content parts instead of a plain string.
    if (Array.isArray(delta.content)) {
        return {
            content: delta.content
                .map(part => (typeof part === 'string' ? part : part && typeof part.text === 'string' ? part.text : ''))
                .join('')
        };
    }
    return {};
}
