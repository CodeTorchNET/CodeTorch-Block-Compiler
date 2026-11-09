import xhr from 'xhr';
import saveProjectToServer from '../../../src/lib/save-project-to-server';
import {requestCaptchaToken} from '../../../src/lib/ct-captcha-bridge';
import {COPY_CHANGED} from '../../../src/lib/draft';

jest.mock('xhr', () => jest.fn());
jest.mock('../../../src/lib/storage', () => ({
    __esModule: true,
    default: {
        CTprojectHost: 'https://api.example/v1/projects/blocks',
        getProjectToken: () => Promise.resolve('token')
    }
}));
jest.mock('../../../src/lib/ct-captcha-bridge', () => ({requestCaptchaToken: jest.fn()}));

const captchaRefusal = {
    statusCode: 400,
    body: JSON.stringify({error_code: 'bad_request', message: 'Captcha Required', details: {action: 'captcha_required'}})
};
const saved = {statusCode: 200, body: JSON.stringify({'content-name': 7})};

describe('a save that needs a captcha', () => {
    beforeEach(() => {
        xhr.mockReset();
        requestCaptchaToken.mockReset();
    });

    test('is sent again with the token once the captcha is solved', async () => {
        const tokens = [];
        xhr.mockImplementationOnce((opts, cb) => {
            tokens.push(opts.headers['X-Hcaptcha-Token']);
            cb(null, captchaRefusal);
        }).mockImplementationOnce((opts, cb) => {
            tokens.push(opts.headers['X-Hcaptcha-Token']);
            cb(null, saved);
        });
        requestCaptchaToken.mockResolvedValue('solved-token');

        const result = await saveProjectToServer(7, '{}', {});
        expect(result.id).toBe(7);
        expect(tokens).toEqual([undefined, 'solved-token']);
        expect(xhr.mock.calls[1][0].method).toBe('put');
    });

    test('fails like any other save when the captcha is closed', async () => {
        xhr.mockImplementationOnce((opts, cb) => cb(null, captchaRefusal));
        requestCaptchaToken.mockRejectedValue(new Error('captcha closed'));
        await expect(saveProjectToServer(7, '{}', {})).rejects.toBe(400);
        expect(xhr).toHaveBeenCalledTimes(1);
    });

    test('an ordinary 400 does not ask for a captcha', async () => {
        xhr.mockImplementationOnce((opts, cb) => cb(null, {statusCode: 400, body: '{"message":"bad"}'}));
        await expect(saveProjectToServer(7, '{}', {})).rejects.toBe(400);
        expect(requestCaptchaToken).not.toHaveBeenCalled();
    });

    test('a draft that changed under the editor still fails as COPY_CHANGED', async () => {
        xhr.mockImplementationOnce((opts, cb) => cb(null, {statusCode: 409, body: JSON.stringify({error_code: COPY_CHANGED})}));
        await expect(saveProjectToServer(7, '{}', {})).rejects.toBe(COPY_CHANGED);
    });

    test('the request has a timeout, so a stalled connection cannot hang the save', async () => {
        xhr.mockImplementationOnce((opts, cb) => cb(null, saved));
        await saveProjectToServer(7, '{}', {});
        expect(xhr.mock.calls[0][0].timeout).toBeGreaterThan(0);
    });
});

describe('asking the page for a captcha', () => {
    const {requestCaptchaToken: realRequest} = jest.requireActual('../../../src/lib/ct-captcha-bridge');
    let parent;
    let sent;

    beforeEach(() => {
        jest.useFakeTimers();
        sent = [];
        parent = {postMessage: message => sent.push(message)};
        const frame = new EventTarget();
        frame.parent = parent;
        global.window = frame;
    });
    afterEach(() => {
        jest.useRealTimers();
        delete global.window;
    });

    const message = (data, source) => {
        const event = new Event('message');
        Object.assign(event, {data, source, origin: ''});
        window.dispatchEvent(event);
    };
    const answer = data => message(data, parent);

    test('resolves with the token the page sends back', async () => {
        const token = realRequest();
        const {requestId} = sent[0];
        expect(sent[0].action).toBe('CAPTCHA_REQUEST');
        answer({type: 'block-compiler-action', action: 'CAPTCHA_ACK', requestId});
        jest.advanceTimersByTime(60000);
        answer({type: 'block-compiler-action', action: 'CAPTCHA_RESPONSE', requestId, token: 'abc'});
        await expect(token).resolves.toBe('abc');
    });

    test('rejects when the captcha is closed', async () => {
        const token = realRequest();
        const {requestId} = sent[0];
        answer({type: 'block-compiler-action', action: 'CAPTCHA_ACK', requestId});
        answer({type: 'block-compiler-action', action: 'CAPTCHA_RESPONSE', requestId, token: null});
        await expect(token).rejects.toThrow('captcha closed');
    });

    test('rejects quickly when the page never acknowledges', async () => {
        const token = realRequest();
        jest.advanceTimersByTime(5000);
        await expect(token).rejects.toThrow('did not answer');
    });

    test('ignores answers from anywhere but the parent', async () => {
        const token = realRequest();
        const {requestId} = sent[0];
        message({type: 'block-compiler-action', action: 'CAPTCHA_RESPONSE', requestId, token: 'forged'}, window);
        answer({type: 'block-compiler-action', action: 'CAPTCHA_ACK', requestId});
        answer({type: 'block-compiler-action', action: 'CAPTCHA_RESPONSE', requestId, token: 'real'});
        await expect(token).resolves.toBe('real');
    });
});
