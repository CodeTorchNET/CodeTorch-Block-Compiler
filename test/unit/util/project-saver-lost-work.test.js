import VM from 'scratch-vm';
import {LoadingState} from '../../../src/reducers/project-state';
import projectSaverHOC from '../../../src/lib/project-saver-hoc.jsx';

jest.mock('../../../src/lib/storage', () => ({__esModule: true, default: {store: jest.fn()}}));
jest.mock('../../../src/lib/rewind/controller', () => ({__esModule: true, default: {projectCreated: jest.fn()}}));

const Saver = projectSaverHOC(() => null).WrappedComponent;

const makeSaver = (props = {}) => {
    const vm = new VM();
    const saver = new Saver(Object.assign({
        vm,
        autoSaveIntervalSecs: 120,
        autoSaveTimeoutId: null,
        setAutoSaveTimeoutId: jest.fn(),
        onSetProjectUnchanged: jest.fn(),
        onAutoUpdateProject: jest.fn(),
        onUpdateProjectData: jest.fn(() => Promise.resolve({id: 100})),
        onSetProjectThumbnailer: jest.fn(),
        onSetProjectSaver: jest.fn()
    }, props));
    saver.componentDidMount();
    return {saver, vm};
};

describe('the saver does not lose work', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('edits made while a save is in flight keep the project changed', async () => {
        let finish;
        const {saver, vm} = makeSaver({
            onUpdateProjectData: jest.fn(() => new Promise(resolve => {
                finish = () => resolve({id: 100});
            }))
        });
        let saving = saver.storeProject(100);
        await Promise.resolve();
        await Promise.resolve();
        vm.emit('PROJECT_CHANGED');
        finish();
        await saving;
        expect(saver.props.onSetProjectUnchanged).not.toHaveBeenCalled();

        saving = saver.storeProject(100);
        await Promise.resolve();
        await Promise.resolve();
        finish();
        await saving;
        expect(saver.props.onSetProjectUnchanged).toHaveBeenCalledTimes(1);
    });

    test('a save that ends with the project still changed re-arms autosave', () => {
        const {saver} = makeSaver();
        const prev = Object.assign({}, saver.props, {isUpdating: true, loadingState: LoadingState.MANUAL_UPDATING});
        saver.props = Object.assign({}, saver.props, {
            isUpdating: false, isShowingSaveable: true, projectChanged: true, loadingState: LoadingState.SHOWING_WITH_ID
        });
        saver.componentDidUpdate(prev);
        expect(saver.props.setAutoSaveTimeoutId).toHaveBeenCalled();
        jest.runAllTimers();
        expect(saver.props.onAutoUpdateProject).toHaveBeenCalled();
    });

    test('a project that cannot be serialized fails the save instead of throwing', async () => {
        const {saver, vm} = makeSaver();
        vm.toJSON = () => {
            throw new Error('cannot serialize');
        };
        await expect(saver.storeProject(100)).rejects.toThrow('cannot serialize');
    });
});

describe('"See project page" waits for a save that succeeded', () => {
    // eslint-disable-next-line global-require
    const Watcher = require('../../../src/containers/project-watcher.jsx').default.WrappedComponent;
    const watching = projectChanged => {
        const onDoneUpdating = jest.fn();
        const watcher = new Watcher({onDoneUpdating, isShowingWithId: true, projectChanged, children: () => null});
        watcher.state = {waiting: true};
        watcher.setState = update => Object.assign(watcher.state, update);
        watcher.componentDidUpdate({isShowingWithId: false});
        return {onDoneUpdating, watcher};
    };

    test('a failed save keeps the editor open', () => {
        const {onDoneUpdating, watcher} = watching(true);
        expect(onDoneUpdating).not.toHaveBeenCalled();
        expect(watcher.state.waiting).toBe(false);
    });

    test('a saved project goes to its page', () => {
        expect(watching(false).onDoneUpdating).toHaveBeenCalled();
    });
});
