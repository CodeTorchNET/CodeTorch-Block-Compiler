import DOMPurify from 'dompurify';

/**
 * Sanitises HTML produced from model output.
 */
export function sanitize (html) {
    return DOMPurify.sanitize(String(html), {
        USE_PROFILES: {html: true},
        ADD_ATTR: ['target']
    });
}

/** Escapes text for insertion into an HTML string (used for raw code blocks). */
export function escapeHTML (text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export default {sanitize, escapeHTML};
