import {BLOCKS_CUSTOM, Theme} from '.';

const STORAGE_KEY = 'ct:theme';

const matchMedia = query => (window.matchMedia ? window.matchMedia(query) : null);
const PREFERS_HIGH_CONTRAST_QUERY = matchMedia('(prefers-contrast: more)');
const PREFERS_DARK_QUERY = matchMedia('(prefers-color-scheme: dark)');

/**
 * @returns {Theme} detected theme
 */
const systemPreferencesTheme = () => {
    // Check for URL search parameters first (highest priority)
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');

    // Check for mode parameter on any page
    if (modeParam === 'dark') {
        return Theme.dark;
    } else if (modeParam === 'light') {
        return Theme.light;
    }

    // If on home page, default to light theme
    // eslint-disable-next-line max-len
    if (window.location.pathname === '/' || window.location.pathname.includes('/index.html') || window.location.pathname === '/build/') {
        return Theme.light;
    }

    if (PREFERS_HIGH_CONTRAST_QUERY && PREFERS_HIGH_CONTRAST_QUERY.matches) {
        return Theme.highContrast;
    }
    if (PREFERS_DARK_QUERY && PREFERS_DARK_QUERY.matches) {
        return Theme.dark;
    }
    return Theme.light;
};

/**
 * @param {function} onChange callback; no guarantees about arguments
 * @returns {function} call to remove event listeners to prevent memory leak
 */
const onSystemPreferenceChange = onChange => {
    if (
        !PREFERS_HIGH_CONTRAST_QUERY ||
        !PREFERS_DARK_QUERY ||
        // Some old browsers don't support addEventListener on media queries
        !PREFERS_HIGH_CONTRAST_QUERY.addEventListener ||
        !PREFERS_DARK_QUERY.addEventListener
    ) {
        return () => {};
    }

    PREFERS_HIGH_CONTRAST_QUERY.addEventListener('change', onChange);
    PREFERS_DARK_QUERY.addEventListener('change', onChange);

    return () => {
        PREFERS_HIGH_CONTRAST_QUERY.removeEventListener('change', onChange);
        PREFERS_DARK_QUERY.removeEventListener('change', onChange);
    };
};

/**
 * @returns {Theme} the theme
 */
const detectTheme = () => {
    const systemPreferences = systemPreferencesTheme();
    let theme = systemPreferences;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed) {
                if (parsed.accent) {
                    theme = theme.set('accent', parsed.accent);
                }
                if (parsed.gui) {
                    theme = theme.set('gui', parsed.gui);
                }
                if (parsed.blocks && parsed.blocks !== BLOCKS_CUSTOM) {
                    theme = theme.set('blocks', parsed.blocks);
                }
            }
        }
    } catch (e) {
        // ignore
    }

    return theme;
};

/**
 * @param {Theme} theme the theme
 */
const persistTheme = theme => {
    const systemPreferences = systemPreferencesTheme();
    const nonDefaultSettings = {};

    if (theme.accent !== systemPreferences.accent) {
        nonDefaultSettings.accent = theme.accent;
    }
    if (theme.gui !== systemPreferences.gui) {
        nonDefaultSettings.gui = theme.gui;
    }
    // custom blocks are managed by addon at runtime, don't save here
    if (theme.blocks !== systemPreferences.blocks && theme.blocks !== BLOCKS_CUSTOM) {
        nonDefaultSettings.blocks = theme.blocks;
    }

    if (Object.keys(nonDefaultSettings).length === 0) {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            // ignore
        }
    } else {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nonDefaultSettings));
        } catch (e) {
            // ignore
        }
    }
};

export {
    onSystemPreferenceChange,
    detectTheme,
    persistTheme
};
