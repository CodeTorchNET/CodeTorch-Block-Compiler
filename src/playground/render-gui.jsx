import React from 'react';
import GUI from '../containers/gui.jsx';

const searchParams = new URLSearchParams(location.search);
const cloudHost = searchParams.get('cloud_host') || 'wss://clouddata.turbowarp.org';

const creatingNewProject = new URLSearchParams(location.search).get('new_project') === '1';

const restrictedMode = new URLSearchParams(location.search).get('onlyEditor') === '1';

const RenderGUI = props => (
    <GUI
        cloudHost={cloudHost}
        canUseCloud
        hasCloudPermission
        canSave={true}
        canCreateNew={creatingNewProject}
        //isShared,canRemix,canEditTitle
        isShared={!restrictedMode}
        canShare={false} //just do it from project page
        basePath={process.env.ROOT}
        canEditTitle={false} //just do it from project page
        enableCommunity={!restrictedMode}
        {...props}
    />
);

export default RenderGUI;
