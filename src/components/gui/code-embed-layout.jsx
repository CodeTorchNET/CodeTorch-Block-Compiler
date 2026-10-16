import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import VM from 'scratch-vm';

import Blocks from '../../containers/blocks.jsx';
import CodeEmbedSprites from '../code-embed-sprites/code-embed-sprites.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants';
import {isRendererSupported} from '../../lib/tw-environment-support-prober';
import {Theme} from '../../lib/themes';

import styles from './gui.css';

/**
 * The layout an embed uses to show a project's blocks, next to the running project or on
 * their own.
 * @param {object} props Props
 * @returns {React.Element} The layout
 */
const CodeEmbedLayout = props => {
    const {
        alertsVisible,
        basePath,
        blocksId,
        canSave,
        canUseCloud,
        connectionModalVisible,
        isFullScreen,
        isRtl,
        loading,
        modals,
        onOpenCustomExtensionModal,
        showStage,
        stageSize,
        theme,
        vm
    } = props;

    return (
        <Box
            className={styles.codeEmbedWrapper}
            dir={isRtl ? 'rtl' : 'ltr'}
        >
            {modals}
            {loading ? (
                <Loader isFullScreen />
            ) : null}
            {alertsVisible ? (
                <Alerts className={styles.alertsContainer} />
            ) : null}
            {connectionModalVisible ? (
                <ConnectionModal
                    vm={vm}
                />
            ) : null}
            <Box className={styles.codeEmbedEditor}>
                <CodeEmbedSprites vm={vm} />
                <Box className={styles.blocksWrapper}>
                    <Blocks
                        key={`${blocksId}/${theme.id}`}
                        canUseCloud={canUseCloud}
                        grow={1}
                        isVisible
                        options={{
                            media: `${basePath}static/${theme.getBlocksMediaFolder()}/`,
                            readOnly: true,
                            scrollbars: true
                        }}
                        stageSize={stageSize}
                        onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                        theme={theme}
                        vm={vm}
                        canSave={canSave}
                    />
                </Box>
            </Box>
            <Box
                className={classNames(styles.stageAndTargetWrapper, styles.codeEmbedStage, styles[stageSize], {
                    [styles.codeEmbedStageHidden]: !showStage
                })}
            >
                <StageWrapper
                    isFullScreen={isFullScreen}
                    isRendererSupported={isRendererSupported()}
                    isRtl={isRtl}
                    stageSize={stageSize}
                    vm={vm}
                />
            </Box>
            <DragLayer />
        </Box>
    );
};

CodeEmbedLayout.propTypes = {
    alertsVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksId: PropTypes.string,
    canSave: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    connectionModalVisible: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isRtl: PropTypes.bool,
    loading: PropTypes.bool,
    modals: PropTypes.node,
    onOpenCustomExtensionModal: PropTypes.func,
    showStage: PropTypes.bool,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    theme: PropTypes.instanceOf(Theme),
    vm: PropTypes.instanceOf(VM).isRequired
};

export default CodeEmbedLayout;
