import GetSVG from './helpers/parser.js';
import Attachment from './helpers/attachment.js';
import main from './main.js';
const {API_HOST} = require('../../../lib/brand.js');

export default async function ({addon, console}) {
    const Blockly = await addon.tab.traps.getBlockly();

    GetSVG.init(Blockly);
    Attachment._blockly = Blockly;

    const readSettings = () => ({
        gemini: addon.settings.get('GeminiAPIKey') || '',
        openrouter: addon.settings.get('OpenRouterAPIKey') || ''
    });

    await main.init({
        addon,
        apiUrl: `${API_HOST}/v1/torchy`,
        authToken: readSettings()
    });

    fetch(`${API_HOST}/v1/torchy/ai_models`, {
        method: 'GET',
        headers: {'Content-Type': 'application/json'}
    })
        .then(response => {
            if (!response.ok) throw new Error(response.statusText);
            return response.json();
        })
        .then(models => main.setAIModels(models))
        .catch(error => console.error('[Torchy] could not load the AI model list', error));

    addon.settings.addEventListener('change', () => main.onSettingsChanged(readSettings()));

    addon.self.addEventListener('disabled', () => main.destroy());
    addon.self.addEventListener('reenabled', () => {
        main.init({addon, apiUrl: `${API_HOST}/v1/torchy`, authToken: readSettings()});
    });

    window.addEventListener('hashchange', () => main.onProjectChanged());

    addon.tab.createBlockContextMenu(
        items => {
            items.push({
                enabled: true,
                text: 'Explain this Sprite',
                callback: () => main.startNewSessionWithPrompt(2, 'Explain this Sprite:'),
                separator: true
            });
            return items;
        },
        {workspace: true}
    );
    addon.tab.createBlockContextMenu(
        (items, block) => {
            items.push({
                text: 'Explain this Code',
                enabled: true,
                callback: () => main.startNewSessionWithPrompt(1, 'Explain this:', Blockly.Xml.blockToDom(block)),
                separator: true
            });
            return items;
        },
        {blocks: true}
    );
    addon.tab.createBlockContextMenu(
        (items, block) => {
            items.push({
                text: 'Debug this Code',
                enabled: true,
                callback: () =>
                    main.startNewSessionWithPrompt(
                        1,
                        'I have the following issue with my code {REPLACE THIS WITH ISSUE}, please help me debug it:',
                        Blockly.Xml.blockToDom(block)
                    )
            });
            return items;
        },
        {blocks: true}
    );
    addon.tab.createBlockContextMenu(
        (items, block) => {
            items.push({
                text: 'New Chat',
                enabled: true,
                callback: () => main.startNewSessionWithPrompt(1, '', Blockly.Xml.blockToDom(block))
            });
            return items;
        },
        {blocks: true}
    );

    addon.tab.redux.addEventListener('statechanged', ({detail}) => {
        const type = detail.action.type;
        if (type === 'scratch-gui/project-state/START_LOADING_VM_FILE_UPLOAD') {
            main.close();
        }
        if (type === 'scratch-gui/navigation/ACTIVATE_TAB' && detail.action.activeTabIndex !== 0) {
            main.closeFloating();
        }
    });

    window.addEventListener('ai-button-clicked', () => main.startNewSessionWithPrompt(2, ''));
}
