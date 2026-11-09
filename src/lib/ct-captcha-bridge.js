import {getParentTargetOrigin, postMessageToParent} from './ct-parent-message';

const ACK_TIMEOUT_MS = 4000;

let pending = null;
let counter = 0;

const fromParent = event => {
    if (event.source !== window.parent) return false;
    const target = getParentTargetOrigin();
    return target === '*' || event.origin === target;
};

/**
 * @returns {Promise<string>} the token, or a rejection if the captcha was closed or nobody answered.
 */
const requestCaptchaToken = () => {
    if (pending) return pending;
    if (window.parent === window) return Promise.reject(new Error('no page to show a captcha'));

    const requestId = `captcha-${Date.now()}-${++counter}`;
    pending = new Promise((resolve, reject) => {
        let ackTimer = null;
        let finish = null;
        const onMessage = event => {
            if (!fromParent(event)) return;
            const data = event.data;
            if (!data || data.type !== 'block-compiler-action' || data.requestId !== requestId) return;
            if (data.action === 'CAPTCHA_ACK') {
                clearTimeout(ackTimer);
                return;
            }
            if (data.action !== 'CAPTCHA_RESPONSE') return;
            finish();
            if (typeof data.token === 'string' && data.token) resolve(data.token);
            else reject(new Error('captcha closed'));
        };
        finish = () => {
            clearTimeout(ackTimer);
            window.removeEventListener('message', onMessage);
        };
        ackTimer = setTimeout(() => {
            finish();
            reject(new Error('the page did not answer the captcha request'));
        }, ACK_TIMEOUT_MS);
        window.addEventListener('message', onMessage);
        postMessageToParent({type: 'block-compiler-action', action: 'CAPTCHA_REQUEST', requestId});
    });
    pending.then(() => {
        pending = null;
    }, () => {
        pending = null;
    });
    return pending;
};

export {requestCaptchaToken};
