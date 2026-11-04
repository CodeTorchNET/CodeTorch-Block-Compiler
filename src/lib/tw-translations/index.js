import twTranslations from './generated-translations.json';
import ctTranslations from './ct-translations.json';

const CT_ALIASES = {
    'pt-br': 'pt',
    'es-419': 'es'
};

const addAdditionalTranslations = editorMessages => {
    for (const locale of Object.keys(editorMessages)) {
        const toMixIn = twTranslations[locale.toLowerCase()];
        if (toMixIn) {
            Object.assign(editorMessages[locale], toMixIn);
        }
    }

    // We reuse our `es` translations for `es-419` instead of maintaining separate translations.
    Object.assign(editorMessages['es-419'], twTranslations.es);

    for (const locale of Object.keys(editorMessages)) {
        const lower = locale.toLowerCase();
        const ct = ctTranslations[lower] || ctTranslations[CT_ALIASES[lower]];
        if (ct) {
            Object.assign(editorMessages[locale], ct);
        }
    }
};

export default addAdditionalTranslations;
