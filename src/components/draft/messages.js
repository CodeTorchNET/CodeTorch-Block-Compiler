import {defineMessages} from 'react-intl';

/* eslint-disable max-len */
const messages = defineMessages({
    startMenuItem: {id: 'gui.draft.startMenuItem', defaultMessage: 'Work on a draft', description: 'File menu item that starts a draft of the project: changes are saved to the draft and everyone else keeps seeing the shared version until it is published'},
    publishMenuItem: {id: 'gui.draft.publishMenuItem', defaultMessage: 'Publish draft', description: 'File menu item that replaces the shared version of the project with its draft'},
    discardMenuItem: {id: 'gui.draft.discardMenuItem', defaultMessage: 'Discard draft', description: 'File menu item that throws the project\'s draft away'},
    confirmPublish: {id: 'gui.draft.confirmPublish', defaultMessage: 'Publish your draft? Everyone will see this version of the project.', description: 'Confirmation asked before publishing the project\'s draft'},
    confirmDiscard: {id: 'gui.draft.confirmDiscard', defaultMessage: 'Discard your draft? Every change since you started it is lost, and the editor reloads the shared version.', description: 'Confirmation asked before discarding the project\'s draft'}
});
/* eslint-enable max-len */

export default messages;
