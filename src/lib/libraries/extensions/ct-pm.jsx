import React from 'react';
import {defineMessages, FormattedMessage} from 'react-intl';

import iconURL from './ct-pm/extra.svg';
import insetIconURL from './ct-pm/extra-small.svg';

/* eslint-disable max-len */
const messages = defineMessages({
    jgTweenName: {id: 'ct.pm.ext.jgTween.name', defaultMessage: 'Tweening', description: 'Name of the tweening extension'},
    jgTweenDescription: {id: 'ct.pm.ext.jgTween.description', defaultMessage: 'Animate numbers, positions and more smoothly, with easing.', description: 'Description of the tweening extension'},
    pmCameraName: {id: 'ct.pm.ext.pmCamera.name', defaultMessage: 'Camera', description: 'Name of the camera extension'},
    pmCameraDescription: {id: 'ct.pm.ext.pmCamera.description', defaultMessage: 'Move, zoom and rotate the view of the stage.', description: 'Description of the camera extension'},
    jgRuntimeName: {id: 'ct.pm.ext.jgRuntime.name', defaultMessage: 'Runtime', description: 'Name of the runtime extension'},
    jgRuntimeDescription: {id: 'ct.pm.ext.jgRuntime.description', defaultMessage: 'Change sprites, costumes, sounds and project settings while the project runs.', description: 'Description of the runtime extension'},
    pmControlsExpansionName: {id: 'ct.pm.ext.pmControlsExpansion.name', defaultMessage: 'More Control', description: 'Name of the control expansion extension'},
    pmControlsExpansionDescription: {id: 'ct.pm.ext.pmControlsExpansion.description', defaultMessage: 'Extra control blocks.', description: 'Description of the control expansion extension'},
    pmOperatorsExpansionName: {id: 'ct.pm.ext.pmOperatorsExpansion.name', defaultMessage: 'More Operators', description: 'Name of the operators expansion extension'},
    pmOperatorsExpansionDescription: {id: 'ct.pm.ext.pmOperatorsExpansion.description', defaultMessage: 'Extra math and text blocks.', description: 'Description of the operators expansion extension'},
    pmEventsExpansionName: {id: 'ct.pm.ext.pmEventsExpansion.name', defaultMessage: 'More Events', description: 'Name of the events expansion extension'},
    pmEventsExpansionDescription: {id: 'ct.pm.ext.pmEventsExpansion.description', defaultMessage: 'Extra event blocks.', description: 'Description of the events expansion extension'},
    pmSensingExpansionName: {id: 'ct.pm.ext.pmSensingExpansion.name', defaultMessage: 'More Sensing', description: 'Name of the sensing expansion extension'},
    pmSensingExpansionDescription: {id: 'ct.pm.ext.pmSensingExpansion.description', defaultMessage: 'Extra sensing blocks.', description: 'Description of the sensing expansion extension'},
    pmMotionExpansionName: {id: 'ct.pm.ext.pmMotionExpansion.name', defaultMessage: 'More Motion', description: 'Name of the motion expansion extension'},
    pmMotionExpansionDescription: {id: 'ct.pm.ext.pmMotionExpansion.description', defaultMessage: 'Extra motion blocks.', description: 'Description of the motion expansion extension'},
    tempVarsName: {id: 'ct.pm.ext.tempVars.name', defaultMessage: 'Temporary Variables', description: 'Name of the temporary variables extension'},
    tempVarsDescription: {id: 'ct.pm.ext.tempVars.description', defaultMessage: 'Variables that only exist while a script runs.', description: 'Description of the temporary variables extension'},
    jgTimersName: {id: 'ct.pm.ext.jgTimers.name', defaultMessage: 'Timers', description: 'Name of the timers extension'},
    jgTimersDescription: {id: 'ct.pm.ext.jgTimers.description', defaultMessage: 'As many timers as you need.', description: 'Description of the timers extension'},
    jgScriptsName: {id: 'ct.pm.ext.jgScripts.name', defaultMessage: 'Scripts', description: 'Name of the scripts extension'},
    jgScriptsDescription: {id: 'ct.pm.ext.jgScripts.description', defaultMessage: 'Store stacks of blocks and run them later.', description: 'Description of the scripts extension'},
    jgStorageName: {id: 'ct.pm.ext.jgStorage.name', defaultMessage: 'Local Storage', description: 'Name of the storage extension'},
    jgStorageDescription: {id: 'ct.pm.ext.jgStorage.description', defaultMessage: 'Save data in this browser, for this project only.', description: 'Description of the storage extension'},
    jgJSONName: {id: 'ct.pm.ext.jgJSON.name', defaultMessage: 'JSON', description: 'Name of the JSON extension'},
    jgJSONDescription: {id: 'ct.pm.ext.jgJSON.description', defaultMessage: 'Work with JSON text: objects and arrays.', description: 'Description of the JSON extension'},
    twFilesName: {id: 'ct.pm.ext.twFiles.name', defaultMessage: 'Files', description: 'Name of the files extension'},
    twFilesDescription: {id: 'ct.pm.ext.twFiles.description', defaultMessage: 'Open files from the computer and save files to it.', description: 'Description of the files extension'},
    jgExtendedAudioName: {id: 'ct.pm.ext.jgExtendedAudio.name', defaultMessage: 'Sound Plus', description: 'Name of the extended audio extension'},
    jgExtendedAudioDescription: {id: 'ct.pm.ext.jgExtendedAudio.description', defaultMessage: 'Play many sounds at once, with speed, pan and more.', description: 'Description of the extended audio extension'},
    jgIframeName: {id: 'ct.pm.ext.jgIframe.name', defaultMessage: 'Web Pages', description: 'Name of the iframe extension'},
    jgIframeDescription: {id: 'ct.pm.ext.jgIframe.description', defaultMessage: 'Show a web page over the stage (asks first).', description: 'Description of the iframe extension'},
    jgPrismName: {id: 'ct.pm.ext.jgPrism.name', defaultMessage: 'Utilities', description: 'Name of the Prism utilities extension'},
    jwProtoName: {id: 'ct.pm.ext.jwProto.name', defaultMessage: 'Labels', description: 'Name of the Labels extension'},
    jwProtoDescription: {id: 'ct.pm.ext.jwProto.description', defaultMessage: 'Name and group your scripts with labelled blocks.', description: 'Description of the Labels extension'},
    jwArrayName: {id: 'ct.pm.ext.jwArray.name', defaultMessage: 'Arrays', description: 'Name of the Arrays extension'},
    jwArrayDescription: {id: 'ct.pm.ext.jwArray.description', defaultMessage: 'Lists you can keep in a variable, nest, and pass around.', description: 'Description of the Arrays extension'},
    jwNumName: {id: 'ct.pm.ext.jwNum.name', defaultMessage: 'Huge Numbers', description: 'Name of the Huge Numbers extension'},
    jwNumDescription: {id: 'ct.pm.ext.jwNum.description', defaultMessage: 'Numbers far bigger than normal numbers can hold.', description: 'Description of the Huge Numbers extension'},
    jwColorName: {id: 'ct.pm.ext.jwColor.name', defaultMessage: 'Colors', description: 'Name of the Colors extension'},
    jwColorDescription: {id: 'ct.pm.ext.jwColor.description', defaultMessage: 'Make, mix and convert colors.', description: 'Description of the Colors extension'},
    jwTargetsName: {id: 'ct.pm.ext.jwTargets.name', defaultMessage: 'Sprite References', description: 'Name of the Sprite References extension'},
    jwTargetsDescription: {id: 'ct.pm.ext.jwTargets.description', defaultMessage: 'Keep a sprite or clone in a variable and work with it.', description: 'Description of the Sprite References extension'},
    jwVectorName: {id: 'ct.pm.ext.jwVector.name', defaultMessage: 'Vectors', description: 'Name of the Vectors extension'},
    jwVectorDescription: {id: 'ct.pm.ext.jwVector.description', defaultMessage: 'Positions and directions as x/y pairs.', description: 'Description of the Vectors extension'},
    jgPrismDescription: {id: 'ct.pm.ext.jgPrism.description', defaultMessage: 'Assorted useful blocks.', description: 'Description of the Prism utilities extension'},
    ctFunctionsName: {id: 'ct.snap.ext.ctFunctions.name', defaultMessage: 'Functions', description: 'Name of the Snap!-style functions extension'},
    snapJwArrayName: {id: 'ct.snap.ext.jwArray.name', defaultMessage: 'List values', description: 'Name of the Arrays extension when offered by the Snap related behavior setting'},
    snapJwArrayDescription: {id: 'ct.snap.ext.jwArray.description', defaultMessage: 'Lists you can keep in a variable, nest and pass to functions. The orange lists are named and flat; these are values.', description: 'Description of the Arrays extension under Snap related behavior'},
    ctFunctionsDescription: {id: 'ct.snap.ext.ctFunctions.description', defaultMessage: 'Blocks as values: call and run them, map, keep and combine lists, and do math on whole lists.', description: 'Description of the Snap!-style functions extension'}
});
/* eslint-enable max-len */

const IDS = [
    'jgTween', 'pmCamera', 'jgRuntime', 'pmControlsExpansion', 'pmOperatorsExpansion', 'pmEventsExpansion',
    'pmSensingExpansion', 'tempVars', 'jwProto', 'jwArray', 'jgTimers', 'jgExtendedAudio', 'jgStorage',
    'pmMotionExpansion', 'jgScripts', 'jwNum', 'jwColor', 'jgJSON', 'twFiles', 'jgIframe', 'jgPrism', 'jwTargets',
    'jwVector'
];

const SNAP_IDS = ['ctFunctions', 'jwArray'];

const toItem = extensionId => ({
    key: extensionId,
    name: <FormattedMessage {...messages[`${extensionId}Name`]} />,
    extensionId,
    iconURL,
    insetIconURL,
    description: <FormattedMessage {...messages[`${extensionId}Description`]} />,
    tags: ['ct-pm'],
    featured: true,
    incompatibleWithScratch: true
});

const asListValues = item => Object.assign({}, item, {
    name: <FormattedMessage {...messages.snapJwArrayName} />,
    description: <FormattedMessage {...messages.snapJwArrayDescription} />
});
export const snapLibraryContent = SNAP_IDS.map(toItem)
    .map(item => (item.extensionId === 'jwArray' ? asListValues(item) : item));

export default IDS.map(toItem);
