import GetSVG from './helpers/parser.js';
import Attachment from './helpers/attachment.js';
import helpers from './helpers/helpers.js';
import {
    store,
    getActiveSession,
    createNewSession,
    loadSessionsForCurrentProject
} from './state/sessions.js';
import * as host from './ui/host.js';
import * as chatView from './ui/chatView.js';
import * as composer from './ui/composer.js';
import {submitFromComposer, stopActiveRequest} from './chat/stream.js';

function currentProjectId () {
    const hash = String(window.location.hash || '').substring(1);
    return hash || '0';
}

export default class main {
    static async init ({addon, apiUrl, authToken}) {
        store.addon = addon;
        store.apiUrl = apiUrl;
        store.authToken = authToken;
        store.canUse = !!(authToken.gemini || authToken.openrouter);

        host.setComposerHandlers({onSend: submitFromComposer, onStop: stopActiveRequest});
        await main.onProjectChanged();
        await host.initHost(addon);
    }

    /**
     * @param {number} fileAttachmentType 0 = none, 1 = code chunk, 2 = entire sprite, 3 = entire project
     * @param {string} inputValue prefilled prompt
     * @param {Element} attachmentDOM block XML captured from the context menu
     */
    static startNewSessionWithPrompt (fileAttachmentType = 0, inputValue = '', attachmentDOM = null) {
        let session = getActiveSession();
        if (!session || session.chatHistory.length > 0) {
            session = createNewSession();
        }
        store.activeSessionId = session.id;
        session.inputText = inputValue;

        if (attachmentDOM) {
            try {
                const attachment = new Attachment();
                attachment.attachment(attachmentDOM, helpers.currentSpriteName());
                session.attachment = attachment;
                session.attachmentType = String(fileAttachmentType);
            } catch (e) {
                console.error('[Torchy] could not attach the selected blocks', e);
            }
        }

        main.open();
    }

    /** Called once the model list has been fetched. */
    static setAIModels (models) {
        store.AIModels = Array.isArray(models) ? models : [];
        composer.rebuildModelOptions();
    }

    static open () {
        host.openHost();
    }

    static close () {
        host.closeHost();
    }

    static closeFloating () {
        host.closeFloatingHost();
    }

    static setDisplayMode (mode) {
        host.setDisplayMode(mode);
    }

    static onSettingsChanged ({gemini, openrouter}) {
        store.authToken.gemini = gemini || '';
        store.authToken.openrouter = openrouter || '';
        store.canUse = !!(store.authToken.gemini || store.authToken.openrouter);

        host.refreshHostView();
        composer.rebuildModelOptions();
    }

    static async onProjectChanged () {
        const projectId = currentProjectId();
        if (store.currentProjectId === projectId && store.sessions.length > 0) return;

        host.closeHost();
        chatView.clearAllPanes();
        try {
            await loadSessionsForCurrentProject(projectId);
        } catch (e) {
            console.error('[Torchy] could not load the sessions of this project', e);
        }
    }

    static destroy () {
        host.destroyHost();
        if (typeof GetSVG.dispose === 'function') {
            try {
                GetSVG.dispose();
            } catch (e) {
                console.error('[Torchy] could not dispose the preview workspace', e);
            }
        }
    }
}
