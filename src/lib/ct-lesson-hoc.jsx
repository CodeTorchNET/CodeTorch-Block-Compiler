import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import AddonHooks from '../addons/hooks.js';
import log from './log';
import storage from './storage';
import {postMessageToParent} from './ct-parent-message';
import {
    categoryForOpcode,
    createLessonState,
    describeError,
    installLessonBridge,
    makeLessonEvent,
    markLessonStep,
    onLessonSaveResult
} from './ct-lesson-messages';
import {
    LoadingState,
    createProject,
    getIsShowingProject,
    getIsShowingWithId,
    getIsShowingWithoutId,
    getIsUpdating,
    manualUpdateProject,
    onLoadedProject,
    requestProjectUpload
} from '../reducers/project-state';
import {setProjectTitle} from '../reducers/project-title';
import {openLoadingProject, closeLoadingProject} from '../reducers/modals';
import {activateTab, BLOCKS_TAB_INDEX} from '../reducers/editor-tab';
import {setStageSize} from '../reducers/stage-size';
import {STAGE_SIZE_MODES} from './layout-constants';

const LARGE_STAGE_MIN_WIDTH = 1024;
const LARGE_STAGE_RESTORE_WIDTH = 1100;

const TOKEN_TIMEOUT_MS = 30 * 1000;
const SAVE_TIMEOUT_MS = 60 * 1000;
const TAB_SWITCH_DELAY_MS = 100;
const HIGHLIGHT_MS = 2000;

/**
 * @param {Promise} promise Any promise
 * @param {number} ms Time limit
 * @param {string} reason Rejection reason when the time runs out
 * @returns {Promise} A promise that settles like `promise`, or rejects after `ms`
 */
const withTimeout = (promise, ms, reason) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(value => {
        clearTimeout(timer);
        resolve(value);
    }, error => {
        clearTimeout(timer);
        reject(error);
    });
});

/**
 * Runs the editor inside a Learning Path lesson
 * @param {React.Component} WrappedComponent The component to wrap
 * @returns {React.Component} The wrapped component
 */
const CTLessonHOC = function (WrappedComponent) {
    class LessonComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleCreate',
                'handleFocus',
                'handleHighlight',
                'handleLoad',
                'handleSave',
                'handleSaveResult',
                'handleSetTitle',
                'handleStoreChange',
                'handleWindowResize'
            ]);
            this.autoSmallStage = false;
            this.lessonState = createLessonState();
            this.uninstallBridge = null;
            this.unsubscribeStore = null;
            this.unsubscribeSaveResults = null;
            this.sentReady = false;
            this.isLoadingLesson = false;
            this.pendingCreate = null;
            this.lateCreate = null;
            this.pendingSaves = [];
            this.timers = [];
        }
        componentDidMount () {
            if (!this.props.lessonMode) {
                return;
            }
            const store = this.getStore();
            if (!store) {
                log.error('Lesson mode needs the redux store');
                return;
            }
            this.uninstallBridge = installLessonBridge({
                vm: this.getVm(),
                window: window,
                postMessageToParent: this.post,
                lessonState: this.lessonState,
                commands: {
                    load: this.handleLoad,
                    create: this.handleCreate,
                    save: this.handleSave,
                    focus: this.handleFocus,
                    highlight: this.handleHighlight,
                    setTitle: this.handleSetTitle
                }
            });
            this.unsubscribeSaveResults = onLessonSaveResult(this.handleSaveResult);
            this.unsubscribeStore = store.subscribe(this.handleStoreChange);
            if (typeof window !== 'undefined') {
                window.addEventListener('resize', this.handleWindowResize);
                this.handleWindowResize();
            }
            this.handleStoreChange();
        }
        componentWillUnmount () {
            if (typeof window !== 'undefined') {
                window.removeEventListener('resize', this.handleWindowResize);
            }
            if (this.uninstallBridge) {
                this.uninstallBridge();
                this.uninstallBridge = null;
            }
            if (this.unsubscribeSaveResults) {
                this.unsubscribeSaveResults();
                this.unsubscribeSaveResults = null;
            }
            if (this.unsubscribeStore) {
                this.unsubscribeStore();
                this.unsubscribeStore = null;
            }
            this.timers.forEach(timer => clearTimeout(timer));
            this.timers = [];
        }
        getStore () {
            return this.context && this.context.store;
        }
        getVm () {
            return this.getStore().getState().scratchGui.vm;
        }
        getProjectState () {
            return this.getStore().getState().scratchGui.projectState;
        }
        dispatch (action) {
            return this.getStore().dispatch(action);
        }
        post (message) {
            postMessageToParent(message);
        }
        later (fn, ms) {
            const timer = setTimeout(() => {
                this.timers = this.timers.filter(t => t !== timer);
                fn();
            }, ms);
            this.timers.push(timer);
        }
        /**
         * Keep the editor usable when the lesson player gives it less than the GUI's
         * large-stage minimum width
         */
        handleWindowResize () {
            const store = this.getStore();
            if (!store || typeof window === 'undefined') return;
            const width = window.innerWidth;
            if (width < LARGE_STAGE_MIN_WIDTH && !this.autoSmallStage) {
                if (store.getState().scratchGui.stageSize.stageSize === STAGE_SIZE_MODES.large) {
                    store.dispatch(setStageSize(STAGE_SIZE_MODES.small));
                    this.autoSmallStage = true;
                }
            } else if (width >= LARGE_STAGE_RESTORE_WIDTH && this.autoSmallStage) {
                store.dispatch(setStageSize(STAGE_SIZE_MODES.large));
                this.autoSmallStage = false;
            }
        }

        handleStoreChange () {
            if (!this.sentReady && getIsShowingProject(this.getProjectState().loadingState)) {
                this.sentReady = true;
                this.post(makeLessonEvent('ready'));
            }
            if (this.sentReady && this.unsubscribeStore) {
                this.unsubscribeStore();
                this.unsubscribeStore = null;
            }
        }

        handleLoad (command) {
            const reply = (ok, error) => {
                const message = {type: 'ct-lesson-loaded', requestId: command.requestId, ok: ok};
                if (error) {
                    message.error = error;
                }
                this.post(message);
            };
            if (!command.sb3) {
                reply(false, 'invalid-sb3');
                return;
            }
            const uploadAction = this.isLoadingLesson || this.pendingCreate ? null :
                requestProjectUpload(this.getProjectState().loadingState);
            if (!uploadAction) {
                reply(false, 'busy');
                return;
            }
            this.isLoadingLesson = true;
            this.dispatch(uploadAction);
            this.dispatch(openLoadingProject());
            const vm = this.getVm();
            let error = null;
            vm.quit();
            vm.loadProject(command.sb3)
                .then(() => {
                    if (command.title) {
                        this.dispatch(setProjectTitle(command.title));
                    }
                    if (vm.renderer) {
                        vm.renderer.draw();
                    }
                })
                .catch(err => {
                    log.error(err);
                    error = describeError(err);
                })
                .then(() => {
                    // canSave is false so the new project is never written over the one that was open.
                    this.dispatch(onLoadedProject(LoadingState.LOADING_VM_FILE_UPLOAD, false, error === null));
                    this.dispatch(closeLoadingProject());
                    if (error === null) {
                        markLessonStep(this.lessonState);
                        this.lessonState.lastRunEndedAt = null;
                    }
                    this.isLoadingLesson = false;
                    reply(error === null, error);
                });
        }

        handleCreate (command) {
            const reply = (ok, details) => {
                this.post(Object.assign({type: 'ct-lesson-created', requestId: command.requestId, ok: ok}, details));
            };
            if (this.pendingCreate) {
                reply(false, {error: 'busy'});
                return;
            }
            const loadingState = this.getProjectState().loadingState;
            if (getIsShowingWithId(loadingState)) {
                reply(false, {error: 'already-saved', projectId: this.getProjectState().projectId});
                return;
            }
            if (!getIsShowingWithoutId(loadingState)) {
                reply(false, {error: 'busy'});
                return;
            }
            const titleBefore = this.getStore().getState().scratchGui.projectTitle;
            const pending = {resolve: null, requested: false};
            this.pendingCreate = pending;
            this.lateCreate = null;
            storage.getProjectToken({acceptSignedOut: true, timeoutMs: TOKEN_TIMEOUT_MS})
                .then(token => {
                    if (!token || token === 'anonymous') {
                        throw new Error('not-signed-in');
                    }
                    if (!getIsShowingWithoutId(this.getProjectState().loadingState)) {
                        throw new Error('busy');
                    }
                    const result = new Promise(resolve => {
                        pending.resolve = resolve;
                    });
                    this.dispatch(createProject());
                    if (this.getProjectState().loadingState !== LoadingState.CREATING_NEW) {
                        throw new Error('busy');
                    }
                    pending.requested = true;
                    return withTimeout(result, SAVE_TIMEOUT_MS, 'timeout');
                })
                .then(result => {
                    if (!result.ok) {
                        throw result.error;
                    }
                    reply(true, {projectId: result.projectId});
                })
                .catch(err => {
                    const error = describeError(err);
                    if (error === 'timeout' && pending.requested) {
                        this.lateCreate = {requestId: command.requestId, titleBefore: titleBefore};
                    } else {
                        this.restoreTitle(titleBefore);
                    }
                    reply(false, {error: error});
                })
                .then(() => {
                    if (this.pendingCreate === pending) {
                        this.pendingCreate = null;
                    }
                });
        }

        restoreTitle (titleBefore) {
            if (titleBefore && this.getStore().getState().scratchGui.projectTitle !== titleBefore) {
                this.dispatch(setProjectTitle(titleBefore));
            }
        }

        handleSave (command) {
            const reply = (ok, error) => {
                const message = {type: 'ct-lesson-saved', requestId: command.requestId, ok: ok};
                if (error) {
                    message.error = error;
                }
                this.post(message);
            };
            const loadingState = this.getProjectState().loadingState;
            let pending = null;
            const settle = (ok, error) => {
                if (!pending) {
                    return;
                }
                this.pendingSaves = this.pendingSaves.filter(p => p !== pending);
                pending = null;
                reply(ok, error);
            };
            if (getIsShowingWithId(loadingState) || getIsUpdating(loadingState)) {
                pending = {settle};
                this.pendingSaves.push(pending);
                if (getIsShowingWithId(loadingState)) {
                    this.dispatch(manualUpdateProject());
                    if (!getIsUpdating(this.getProjectState().loadingState)) {
                        settle(false, 'busy');
                        return;
                    }
                }
                this.later(() => settle(false, 'timeout'), SAVE_TIMEOUT_MS);
                return;
            }
            reply(false, getIsShowingWithoutId(loadingState) ? 'not-created' : 'busy');
        }

        handleSaveResult (result) {
            if (result.ok) {
                this.post(makeLessonEvent('saved', {projectId: result.projectId}));
            }
            if (result.kind === 'update') {
                const error = result.ok ? null : describeError(result.error);
                this.pendingSaves.slice().forEach(pending => pending.settle(result.ok, error));
            } else if (result.kind === 'create') {
                if (this.pendingCreate && this.pendingCreate.resolve) {
                    this.pendingCreate.resolve(result);
                } else if (this.lateCreate) {
                    const late = this.lateCreate;
                    this.lateCreate = null;
                    if (result.ok) {
                        this.post({
                            type: 'ct-lesson-created',
                            requestId: late.requestId,
                            ok: true,
                            projectId: result.projectId,
                            late: true
                        });
                    } else {
                        this.restoreTitle(late.titleBefore);
                    }
                }
            }
        }

        withBlocksWorkspace (fn) {
            const run = () => {
                const workspace = AddonHooks.blocklyWorkspace;
                if (!workspace) {
                    return;
                }
                try {
                    fn(workspace);
                } catch (e) {
                    log.warn('Lesson could not reach the toolbox', e);
                }
            };
            const editorTab = this.getStore().getState().scratchGui.editorTab;
            if (editorTab && editorTab.activeTabIndex !== BLOCKS_TAB_INDEX) {
                this.dispatch(activateTab(BLOCKS_TAB_INDEX));
                this.later(run, TAB_SWITCH_DELAY_MS);
            } else {
                run();
            }
        }

        handleFocus (command) {
            this.withBlocksWorkspace(workspace => {
                if (workspace.toolbox_) {
                    workspace.toolbox_.setSelectedCategoryById(command.category);
                }
            });
        }

        handleHighlight (command) {
            const category = categoryForOpcode(command.opcode);
            this.withBlocksWorkspace(workspace => {
                if (category && workspace.toolbox_) {
                    workspace.toolbox_.setSelectedCategoryById(category);
                }
                const glowing = [];
                const flyout = workspace.getFlyout && workspace.getFlyout();
                const flyoutWorkspace = flyout && flyout.getWorkspace();
                const flyoutBlock = flyoutWorkspace && flyoutWorkspace.getTopBlocks(false)
                    .find(block => block.type === command.opcode);
                if (flyoutBlock) {
                    glowing.push(flyoutBlock);
                    if (typeof flyout.scrollTo === 'function') {
                        flyout.scrollTo(Math.max(flyoutBlock.getRelativeToSurfaceXY().y - 16, 0));
                    }
                }
                const workspaceBlock = workspace.getAllBlocks()
                    .find(block => block.type === command.opcode && !block.isShadow());
                if (workspaceBlock) {
                    glowing.push(workspaceBlock);
                }
                glowing.forEach(block => block.setGlowBlock(true));
                this.later(() => {
                    glowing.forEach(block => {
                        try {
                            block.setGlowBlock(false);
                        } catch (e) {
                        }
                    });
                }, HIGHLIGHT_MS);
            });
        }

        handleSetTitle (command) {
            this.dispatch(setProjectTitle(command.title));
        }

        render () {
            return (
                <WrappedComponent {...this.props} />
            );
        }
    }
    LessonComponent.propTypes = {
        lessonMode: PropTypes.bool
    };
    LessonComponent.defaultProps = {
        lessonMode: false
    };
    LessonComponent.contextTypes = {
        store: PropTypes.object
    };
    return LessonComponent;
};

export {
    CTLessonHOC as default
};
