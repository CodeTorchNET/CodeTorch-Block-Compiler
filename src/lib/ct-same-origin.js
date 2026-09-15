/**
 * Compare two URLs by origin. Prefix comparisons are not good enough for security decisions
 * because, for example, https://example.com.attacker.example/ starts with https://example.com
 * @param {string} url URL as a string
 * @param {string} other Another URL as a string
 * @returns {boolean} True if both are valid URLs with the same, non-opaque origin
 */
const isSameOrigin = (url, other) => {
    if (!url || !other) {
        return false;
    }
    let parsedURL;
    let parsedOther;
    try {
        parsedURL = new URL(url);
        parsedOther = new URL(other);
    } catch (e) {
        return false;
    }
    if (parsedURL.origin === 'null' || parsedOther.origin === 'null') {
        return false;
    }
    return parsedURL.origin === parsedOther.origin;
};

export {
    isSameOrigin as default,
    isSameOrigin
};
