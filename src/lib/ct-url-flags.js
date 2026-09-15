/**
 * Boot-time feature flags that are read from the page URL.
 *
 * The URL is parsed exactly once, when this module is first imported, so that every part
 * of the editor keeps seeing the same values even after the query string is rewritten
 * while the editor is running.
 */

const readSearchParams = () => {
    try {
        return new URLSearchParams(location.search);
    } catch (e) {
        return new URLSearchParams('');
    }
};

/**
 * @param {URLSearchParams} params Parsed search parameters
 * @param {string} name Name of the parameter
 * @param {boolean} defaultValue Value to use when the parameter is missing or not understood
 * @returns {boolean} The parsed value
 */
const parseBooleanParam = (params, name, defaultValue) => {
    if (!params.has(name)) {
        return defaultValue;
    }
    const value = `${params.get(name)}`.trim().toLowerCase();
    if (value === 'false' || value === '0' || value === 'no') {
        return false;
    }
    // An empty value is treated as "present, so on" because the editor removes "=" from
    // empty parameters when it rewrites the URL.
    if (value === 'true' || value === '1' || value === 'yes' || value === '') {
        return true;
    }
    return defaultValue;
};

const MINIMAL_PARAM = 'minimal';

/**
 * @param {URLSearchParams} params Parsed search parameters
 * @returns {{useJIT: boolean, minimal: boolean, chat: boolean}} Parsed flags
 */
const parseFlags = params => ({
    // ?useJIT=false turns off the compiler. There is intentionally no ?useJIT=true behaviour.
    useJIT: parseBooleanParam(params, 'useJIT', true),
    // ?minimal=true enables the reduced editor.
    minimal: parseBooleanParam(params, MINIMAL_PARAM, false),
    // ?chat=false turns off the ephemeral cursor chat bubble in collaboration.
    chat: parseBooleanParam(params, 'chat', true)
});

const flags = parseFlags(readSearchParams());

/**
 * @returns {boolean} True if the URL explicitly asked for the compiler to be off.
 */
const isJITDisabledByURL = () => !flags.useJIT;

/**
 * @returns {boolean} True if the reduced editor was requested.
 */
const isMinimalMode = () => flags.minimal;

/**
 * @returns {boolean} True if the ephemeral cursor chat bubble is allowed.
 */
const isCursorChatEnabled = () => flags.chat;

/**
 * Re-apply the flags that have to survive any in-editor rewrite of the query string.
 * @param {URLSearchParams} searchParams Search parameters that are about to be written to the URL
 * @returns {URLSearchParams} The same object, for convenience
 */
const applyPersistentFlags = searchParams => {
    if (flags.minimal) {
        searchParams.set(MINIMAL_PARAM, 'true');
    }
    return searchParams;
};

export {
    parseBooleanParam,
    parseFlags,
    isJITDisabledByURL,
    isMinimalMode,
    isCursorChatEnabled,
    applyPersistentFlags,
    MINIMAL_PARAM
};
