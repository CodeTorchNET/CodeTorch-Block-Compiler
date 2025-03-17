import React from 'react';
import GUI from '../containers/gui.jsx';
import {DEFAULT_CLOUD_HOST} from '../lib/brand.js';

const searchParams = new URLSearchParams(location.search);
const cloudHost = DEFAULT_CLOUD_HOST;

const creatingNewProject = searchParams.get('new_project') === '1';

const restrictedMode = searchParams.get('onlyEditor') === '1';

const RenderGUI = props => (
    <GUI
        cloudHost={cloudHost}
        canUseCloud
        hasCloudPermission
        canCreateNew={creatingNewProject}
        isShared={!restrictedMode}
        canShare={false} //just do it from project page
        basePath={process.env.ROOT} 
        canEditTitle={false} //just do it from project page
        enableCommunity={!restrictedMode}
        {...props}
    />
);

export default RenderGUI;
