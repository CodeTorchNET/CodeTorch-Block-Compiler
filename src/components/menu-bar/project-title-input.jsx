import classNames from 'classnames';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, intlShape, injectIntl} from 'react-intl';
import {setProjectTitle} from '../../reducers/project-title';

import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import Input from '../forms/input.jsx';
const BufferedInput = BufferedInputHOC(Input);

import styles from './project-title-input.css';
import storage from '../../lib/storage';
// eslint-disable-next-line import/no-commonjs
const {API_HOST} = require('../../lib/brand');
import {showAlertWithTimeout} from '../../reducers/alerts';

const messages = defineMessages({
    projectTitlePlaceholder: {
        id: 'gui.gui.projectTitlePlaceholder',
        description: 'Placeholder for project title when blank',
        defaultMessage: 'Your Torch title here'
    }
});

const ProjectTitleInput = ({
    className,
    intl,
    onSubmit,
    projectTitle
}) => (
    <BufferedInput
        className={classNames(styles.titleField, className)}
        maxLength="100"
        placeholder={intl.formatMessage(messages.projectTitlePlaceholder)}
        tabIndex="0"
        type="text"
        value={projectTitle}
        onSubmit={onSubmit}
    />
);

ProjectTitleInput.propTypes = {
    className: PropTypes.string,
    intl: intlShape.isRequired,
    onSubmit: PropTypes.func,
    projectTitle: PropTypes.string
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    projectId: state.scratchGui.projectState.projectId
});

const mapDispatchToProps = dispatch => ({
    onSubmitDispatch: title => dispatch(setProjectTitle(title)),
    titleChangedSuccess: () => dispatch(showAlertWithTimeout(dispatch, 'TitleChanged'))
});

const mergeProps = (stateProps, dispatchProps, ownProps) => ({
    ...ownProps,
    ...stateProps,
    onSubmit: async title => {
        dispatchProps.onSubmitDispatch(title);
        try {
            const projectId = stateProps.projectId;
            if (!projectId || projectId === '0') return;
            const token = await storage.getProjectToken();
            await fetch(`${API_HOST}/v1/projects/${projectId}/title`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? {Authorization: `Bearer ${token}`} : {})
                },
                body: JSON.stringify({title})
            }).then(response => {
                if (response.ok) {
                    dispatchProps.titleChangedSuccess();
                }
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to notify backend of title change', e);
        }
    }
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps
)(ProjectTitleInput));
