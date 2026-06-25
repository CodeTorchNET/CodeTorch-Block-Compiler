import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import overrideDefaultProject from '!arraybuffer-loader!./override-default-project.sb3';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg';
import costume1 from '!raw-loader!./frame1.svg';
import costume2 from '!raw-loader!./frame2.svg';
/* eslint-enable import/no-unresolved */
import {TextEncoder} from '../tw-text-encoder';

const defaultProject = translator => {
    if (overrideDefaultProject.byteLength > 0) {
        return [{
            id: 0,
            assetType: 'Project',
            dataFormat: 'JSON',
            data: overrideDefaultProject
        }];
    }

    let _TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('text-encoding').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();

    const projectJson = projectData(translator);
    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: 'cd21514d0531fdffb22204e0ec5ed84a',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        id: '3ffb86585ebbb654fbc092ea9b0a41b3',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume1)
    },
    {
        id: '2e11410044fca296f1623ae28a7abff4',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume2)
    }];
};

export default defaultProject;
