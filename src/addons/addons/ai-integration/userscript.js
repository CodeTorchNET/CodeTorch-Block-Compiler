import GetSVG from './helpers/parser.js';
import Attachment from './helpers/attachment.js';
import main from './main.js';

const SETTING_IDS = [
    'GeminiAPIKey',
    'OpenRouterAPIKey',
    'CustomEnabled',
    'CustomBaseURL',
    'CustomAPIKey'
];

export default async function ({addon, console}) {
    const Blockly = await addon.tab.traps.getBlockly();

    GetSVG.init(Blockly);
    Attachment._blockly = Blockly;

    const readSettings = () => {
        const settings = {};
        for (const id of SETTING_IDS) settings[id] = addon.settings.get(id);
        return settings;
    };

    await main.init({addon, settings: readSettings()});

    addon.settings.addEventListener('change', () => main.onSettingsChanged(readSettings()));

    addon.self.addEventListener('disabled', () => main.destroy());
    addon.self.addEventListener('reenabled', () => {
        main.init({addon, settings: readSettings()});
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
