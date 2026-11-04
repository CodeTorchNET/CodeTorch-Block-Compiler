import storage from '../storage';

// eslint-disable-next-line import/no-commonjs
const {API_HOST} = require('../brand');

export const KEEPALIVE_LIMIT = 60 * 1024;

export class RewindHttpError extends Error {
    constructor (status, message) {
        super(message || `rewind request failed with ${status}`);
        this.name = 'RewindHttpError';
        this.status = status;
    }
}

const gzip = async text => {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null;
    try {
        // eslint-disable-next-line no-undef
        const stream = new Blob([text]).stream()
            .pipeThrough(new CompressionStream('gzip'));
        return await new Response(stream).arrayBuffer();
    } catch (e) {
        return null;
    }
};

export const createRewindApi = (deps = {}) => {
    const host = deps.host || API_HOST;
    const getToken = deps.getToken || (() => storage.getProjectToken());
    const getTokenSync = deps.getTokenSync || (() => storage.projectToken);
    const getAccessKey = deps.getAccessKey || (() => storage.accessKey);
    const doFetch = deps.fetch || ((...args) => fetch(...args));

    const url = (projectId, path) => {
        let u = `${host}/v1/projects/blocks/${encodeURIComponent(projectId)}${path}`;
        const key = getAccessKey();
        if (key) u += `${u.includes('?') ? '&' : '?'}access_key=${encodeURIComponent(key)}`;
        return u;
    };

    const request = async (method, projectId, path, opts = {}) => {
        const token = opts.token || await getToken();
        const headers = Object.assign({}, opts.headers || {});
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await doFetch(url(projectId, path), {
            method,
            headers,
            body: opts.body,
            keepalive: !!opts.keepalive,
            credentials: 'include'
        });
        if (!res.ok) {
            let message = '';
            try {
                message = (await res.json()).message || '';
            } catch (e) {
                // ignore
            }
            throw new RewindHttpError(res.status, message || undefined);
        }
        return res;
    };

    return {
        async postOps (projectId, body, opts = {}) {
            const text = JSON.stringify(body);
            if (opts.keepalive) {
                if (text.length > KEEPALIVE_LIMIT) throw new RewindHttpError(413, 'too large for keepalive');
                const token = getTokenSync();
                const res = await request('POST', projectId, '/rewind/ops', {
                    body: text,
                    keepalive: true,
                    token,
                    headers: {'Content-Type': 'application/json'}
                });
                return res.json();
            }
            const zipped = opts.gzip === false ? null : await gzip(text);
            const res = await request('POST', projectId, '/rewind/ops', zipped ? {
                body: zipped,
                headers: {'Content-Type': 'application/json', 'Content-Encoding': 'gzip'}
            } : {
                body: text,
                headers: {'Content-Type': 'application/json'}
            });
            return res.json();
        },
        async getIndex (projectId) {
            return (await request('GET', projectId, '/rewind')).json();
        },
        async getChunk (projectId, n) {
            return (await request('GET', projectId, `/rewind/chunks/${n}`)).json();
        },
        async getSegment (projectId, n) {
            const text = await (await request('GET', projectId, `/rewind/segments/${n}`)).text();
            return text.split('\n').filter(line => line.trim())
                .map(line => JSON.parse(line));
        },
        async verify (projectId, n, result) {
            return (await request('POST', projectId, `/rewind/segments/${n}/verify`, {
                body: JSON.stringify({result}),
                headers: {'Content-Type': 'application/json'}
            })).json();
        },
        saveHeaders ({session, baseRevision, room}) {
            if (room) return {'X-Rewind-Room': `${room.id}:${room.generation}`};
            const h = {};
            if (session) h['X-Rewind-Session'] = session;
            if (typeof baseRevision === 'number' && baseRevision >= 0) h['X-Rewind-Base-Revision'] = String(baseRevision);
            return h;
        }
    };
};

export const rewindApi = createRewindApi();
