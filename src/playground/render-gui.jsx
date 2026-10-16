import React from 'react';
import PropTypes from 'prop-types';
import GUI from '../containers/gui.jsx';
import CTLessonHOC from '../lib/ct-lesson-hoc.jsx';
import {DEFAULT_CLOUD_HOST} from '../lib/brand.js';

const searchParams = new URLSearchParams(location.search);
const cloudHost = DEFAULT_CLOUD_HOST;

const creatingNewProject = searchParams.get('new_project') === '1';

const restrictedMode = searchParams.get('onlyEditor') === '1';

const LessonGUI = CTLessonHOC(GUI);

const RenderGUI = ({lessonMode, ...props}) => {
    const restricted = restrictedMode || lessonMode;
    const GUIComponent = lessonMode ? LessonGUI : GUI;
    const lessonProps = lessonMode ? {lessonMode: true} : {};
    return (
        <GUIComponent
            cloudHost={cloudHost}
            hasCloudPermission
            canCreateNew={creatingNewProject}
            isShared={!restricted}
            canShare={false} // just do it from project page
            basePath={process.env.ROOT}
            canEditTitle={false} // just do it from project page
            enableCommunity={!restricted}
            {...lessonProps}
            {...props}
        />
    );
};

RenderGUI.propTypes = {
    lessonMode: PropTypes.bool
};

RenderGUI.defaultProps = {
    lessonMode: false
};

export default RenderGUI;
