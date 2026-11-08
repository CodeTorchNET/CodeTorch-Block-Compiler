import React from 'react';
import {FormattedMessage} from 'react-intl';
import keyMirror from 'keymirror';

import successImage from '../assets/icon--success.svg';
import {TRUSTED_IFRAME_HOST} from '../brand';

const AlertTypes = keyMirror({
    STANDARD: null,
    EXTENSION: null,
    INLINE: null
});

const AlertLevels = {
    SUCCESS: 'success',
    INFO: 'info',
    WARN: 'warn'
};

const alerts = [
    {
        alertId: 'createSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="New project created."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createsuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'createCopySuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved as a copy."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createcopysuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'createRemixSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved as a remix."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createremixsuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'creating',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Creating new…"
                description="Message indicating that project is in process of creating"
                id="gui.alerts.creating"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingCopy',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Copying project…"
                description="Message indicating that project is in process of copying"
                id="gui.alerts.creatingCopy"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingRemix',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Remixing project…"
                description="Message indicating that project is in process of remixing"
                id="gui.alerts.creatingRemix"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingError',
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="Could not create the project. Please try again!"
                description="Message indicating that project could not be created"
                id="gui.alerts.creatingError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'savingError',
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        showDownload: true,
        showSaveNow: true,
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="Project could not save."
                description="Message indicating that project could not be saved"
                id="gui.alerts.savingError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'saveSuccess',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError', 'twSaveToDiskSuccess',
            'twCreatingRestorePoint', 'twRestorePointSuccess', 'twRestorePointError'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved."
                description="Message indicating that project was successfully saved"
                id="gui.alerts.savesuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 3
    },
    {
        alertId: 'twSaveToDiskSuccess',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError', 'twCreatingRestorePoint',
            'twRestorePointSuccess', 'twRestorePointError'],
        content: (
            <FormattedMessage
                defaultMessage="Saved to your computer."
                description="Message indicating that project was successfully saved to the user's disk"
                id="tw.alerts.savedToDisk"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 3
    },
    {
        alertId: 'saving',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError', 'twSaveToDiskSuccess',
            'twCreatingRestorePoint', 'twRestorePointSuccess', 'twRestorePointError'],
        content: (
            <FormattedMessage
                defaultMessage="Saving project…"
                description="Message indicating that project is in process of saving"
                id="gui.alerts.saving"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.INFO
    },
    {
        alertId: 'twCreatingRestorePoint',
        alertType: AlertTypes.INLINE,
        clearList: ['twRestorePointSuccess', 'twRestorePointError'],
        content: (
            <FormattedMessage
                defaultMessage="Creating restore point…"
                description="Menu bar message indicating that a restore point is being automatically created"
                id="tw.alerts.creatingRestorePoint"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.INFO
    },
    {
        alertId: 'twRestorePointSuccess',
        alertType: AlertTypes.INLINE,
        clearList: ['twCreatingRestorePoint', 'twRestorePointError'],
        content: (
            <FormattedMessage
                defaultMessage="Access restore points in &quot;File&quot;"
                // eslint-disable-next-line max-len
                description="Menu bar message indicating that a restore point was successfully created. File refers to the file dropdown menu."
                id="tw.alerts.restorePointSuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 3
    },
    {
        alertId: 'twRestorePointError',
        alertType: AlertTypes.INLINE,
        clearList: ['twCreatingRestorePoint', 'twRestorePointSuccess'],
        content: (
            <FormattedMessage
                defaultMessage="Could not create restore point"
                // eslint-disable-next-line max-len
                description="Menu bar message indicating that a restore point could not be created."
                id="tw.alerts.restorePointError"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.WARN,
        maxDisplaySecs: 5
    },
    {
        alertId: 'cloudInfo',
        alertType: AlertTypes.STANDARD,
        clearList: ['cloudInfo'],
        content: (
            <FormattedMessage
                defaultMessage="Please note, cloud variables only support numbers, not letters or symbols. {learnMoreLink}" // eslint-disable-line max-len
                description="Info about cloud variable limitations"
                id="gui.alerts.cloudInfo"
                values={{
                    learnMoreLink: (
                        <a
                            href="https://blog.codetorch.net/cloud-variables/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <FormattedMessage
                                defaultMessage="Learn more."
                                description="Link text to cloud var faq"
                                id="gui.alerts.cloudInfoLearnMore"
                            />
                        </a>
                    )
                }}
            />
        ),
        closeButton: true,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 15
    },
    {
        alertId: 'importingAsset',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                defaultMessage="Importing…"
                description="Message indicating that project is in process of importing"
                id="gui.alerts.importing"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'TorchyWaitForAIToFinishWarning',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                defaultMessage="Please wait for Torchy to complete its message before sending another one."
                description="Warning message indicating that Torchy is still processing a message"
                id="gui.alerts.TorchyWaitForAIToFinishWarning"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 15
    }, {
        alertId: 'LiveReloadDisabledNotice',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Live code editing is disabled (changes take effect only after rerunning the project). To enable it, go to Edit → Advanced Settings → Use Scratch Interpreter."
                description="Message indicating that Live Reload is disabled in this project."
                id="gui.alerts.LiveReloadDisabledNotice"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN
    }, {
        alertId: 'CollaborationLockedNotice',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Importing projects from your computer is not currently supported for collaboratory projects."
                description="Message indicating that the project is locked for collaboration."
                id="gui.alerts.CollaborationLockedNotice"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN
    }, {
        alertId: 'CollaborationLockedNoticeWipeProject',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="You cannot clear a project while collaborating. To wipe a project, you must be the only user currently collaborating on this project."
                description="Message indicating that the project is locked for collaboration."
                id="gui.alerts.CollaborationLockedNoticeWipeProject"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN
    },
    {
        alertId: 'TitleChanged',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError', 'twSaveToDiskSuccess',
            'twCreatingRestorePoint', 'twRestorePointSuccess', 'twRestorePointError'],
        content: (
            <FormattedMessage
                defaultMessage="Project title changed."
                description="Message indicating that project title was successfully changed"
                id="gui.alerts.titleChanged"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 3
    },
    {
        alertId: 'rewindEnabled',
        alertType: AlertTypes.STANDARD,
        clearList: ['rewindEnabled', 'rewindNeedsPro', 'rewindEnableError'],
        content: (
            <FormattedMessage
                defaultMessage="Rewind is on for this project. Your edits are being recorded."
                description="Shown after a free Rewind was turned on for the project"
                id="gui.alerts.rewindEnabled"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'rewindNeedsPro',
        alertType: AlertTypes.STANDARD,
        clearList: ['rewindEnabled', 'rewindNeedsPro', 'rewindEnableError'],
        content: (
            <FormattedMessage
                defaultMessage="You've used all of your free Rewinds. Rewind on more projects needs Pro. {proLink}"
                description="Shown when turning Rewind on for a project but no free Rewinds are left"
                id="gui.alerts.rewindNeedsPro"
                values={{
                    proLink: TRUSTED_IFRAME_HOST ? (
                        <a
                            href={`${TRUSTED_IFRAME_HOST}/premium`}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <FormattedMessage
                                defaultMessage="Get Pro"
                                description="Link to the Pro plan from the no free Rewinds left alert"
                                id="gui.alerts.rewindNeedsProLink"
                            />
                        </a>
                    ) : null
                }}
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 15
    },
    {
        alertId: 'rewindEnableError',
        alertType: AlertTypes.STANDARD,
        clearList: ['rewindEnabled', 'rewindNeedsPro', 'rewindEnableError'],
        content: (
            <FormattedMessage
                defaultMessage="Rewind couldn't be turned on. Please try again."
                description="Shown when turning Rewind on for the project failed"
                id="gui.alerts.rewindEnableError"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'draftActive',
        alertType: AlertTypes.STANDARD,
        clearList: ['draftActive', 'draftStarted', 'draftPublished', 'draftLimit', 'draftError', 'draftCopyChanged'],
        content: (
            <FormattedMessage
                defaultMessage="You're working on a draft. Everyone else still sees the shared version until you publish it (File menu)."
                description="Shown in the editor while the project's draft is being edited"
                id="gui.alerts.draftActive"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN
    },
    {
        alertId: 'draftStarted',
        alertType: AlertTypes.STANDARD,
        clearList: ['draftActive', 'draftStarted', 'draftPublished', 'draftLimit', 'draftError', 'draftCopyChanged'],
        content: (
            <FormattedMessage
                defaultMessage="Draft started. Your changes are saved to the draft; everyone else keeps seeing the shared version until you publish."
                description="Shown after starting a draft of the project from the File menu"
                id="gui.alerts.draftStarted"
            />
        ),
        iconURL: successImage,
        closeButton: true,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 10
    },
    {
        alertId: 'draftPublished',
        alertType: AlertTypes.STANDARD,
        clearList: ['draftActive', 'draftStarted', 'draftPublished', 'draftLimit', 'draftError', 'draftCopyChanged'],
        content: (
            <FormattedMessage
                defaultMessage="Draft published. Everyone now sees this version, and your next changes go live again."
                description="Shown after publishing the project's draft from the File menu"
                id="gui.alerts.draftPublished"
            />
        ),
        iconURL: successImage,
        closeButton: true,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 10
    },
    {
        alertId: 'draftLimit',
        alertType: AlertTypes.STANDARD,
        clearList: ['draftActive', 'draftStarted', 'draftPublished', 'draftLimit', 'draftError', 'draftCopyChanged'],
        content: (
            <FormattedMessage
                defaultMessage="You can have up to 5 drafts at a time. Publish or discard one of them first, or get unlimited drafts with Pro. {proLink}"
                description="Shown when starting a draft but the account already has the most drafts it may have"
                id="gui.alerts.draftLimit"
                values={{
                    proLink: TRUSTED_IFRAME_HOST ? (
                        <a
                            href={`${TRUSTED_IFRAME_HOST}/premium`}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <FormattedMessage
                                defaultMessage="Get Pro"
                                description="Link to the Pro plan from the draft limit alert"
                                id="gui.alerts.draftLimitLink"
                            />
                        </a>
                    ) : null
                }}
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 15
    },
    {
        alertId: 'draftError',
        alertType: AlertTypes.STANDARD,
        clearList: ['draftActive', 'draftStarted', 'draftPublished', 'draftLimit', 'draftError', 'draftCopyChanged'],
        content: (
            <FormattedMessage
                defaultMessage="That didn't work. Please try again."
                description="Shown when starting, publishing or discarding the project's draft failed"
                id="gui.alerts.draftError"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'draftCopyChanged',
        alertType: AlertTypes.STANDARD,
        clearList: ['draftActive', 'draftStarted', 'draftPublished', 'draftLimit', 'draftError', 'draftCopyChanged',
            'createSuccess', 'creating', 'createCopySuccess', 'creatingCopy', 'createRemixSuccess', 'creatingRemix',
            'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="This project's draft was started, published or discarded since you opened it, so your latest changes weren't saved. {reload}"
                description="Shown when a save is refused because the project switched between its draft and its shared version"
                id="gui.alerts.draftCopyChanged"
                values={{
                    reload: (
                        <a
                            href="#"
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={e => {
                                e.preventDefault();
                                location.reload();
                            }}
                        >
                            <FormattedMessage
                                defaultMessage="Reload"
                                description="Link that reloads the editor after its draft changed"
                                id="gui.alerts.draftCopyChangedReload"
                            />
                        </a>
                    )
                }}
            />
        ),
        showDownload: true,
        closeButton: true,
        level: AlertLevels.WARN
    }
];

export {
    alerts as default,
    AlertLevels,
    AlertTypes
};
