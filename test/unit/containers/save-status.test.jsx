import React from 'react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';
import {mountWithIntl} from '../../helpers/intl-helpers.jsx';
import SaveStatus from '../../../src/components/menu-bar/save-status.jsx';
import InlineMessages from '../../../src/containers/inline-messages.jsx';
import {AlertTypes} from '../../../src/lib/alerts/index.jsx';

jest.mock('../../../src/reducers/project-state', () => ({
    manualUpdateProject: jest.fn(() => ({type: 'stubbed'}))
}));

describe('SaveStatus container', () => {
    const mockStore = configureStore();

    test('if there are inline messages, they are shown instead of save now', () => {
        const store = mockStore({
            scratchGui: {
                collaboration: {isCollabActive: false},
                projectChanged: true,
                alerts: {
                    alertsList: [
                        {alertId: 'saveSuccess', alertType: AlertTypes.INLINE}
                    ]
                }
            }
        });
        const wrapper = mountWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );
        expect(wrapper.find(InlineMessages).exists()).toBe(true);
        expect(wrapper.contains('Save Now')).not.toBe(true);
    });

    test('save now is shown if there are project changes and no inline messages', () => {
        const store = mockStore({
            scratchGui: {
                collaboration: {isCollabActive: false},
                projectChanged: true,
                alerts: {
                    alertsList: []
                }
            }
        });
        const wrapper = mountWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );
        expect(wrapper.find(InlineMessages).exists()).not.toBe(true);
        expect(wrapper.contains('Save Now')).toBe(true);

        wrapper.find('[children="Save Now"]').simulate('click');
        expect(store.getActions()[0].type).toEqual('stubbed');
    });

    test('neither is shown if there are no project changes or inline messages', () => {
        const store = mockStore({
            scratchGui: {
                collaboration: {isCollabActive: false},
                projectChanged: false,
                alerts: {
                    alertsList: []
                }
            }
        });
        const wrapper = mountWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );
        expect(wrapper.find(InlineMessages).exists()).not.toBe(true);
        expect(wrapper.contains('Save Now')).not.toBe(true);
    });

    test('save now is not shown while a collaboration room is active', () => {
        const store = mockStore({
            scratchGui: {
                collaboration: {isCollabActive: true},
                projectChanged: true,
                alerts: {
                    alertsList: []
                }
            }
        });
        const wrapper = mountWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );
        expect(wrapper.contains('Save Now')).not.toBe(true);
    });

    test('inline messages are still shown while a collaboration room is active', () => {
        const store = mockStore({
            scratchGui: {
                collaboration: {isCollabActive: true},
                projectChanged: true,
                alerts: {
                    alertsList: [
                        {alertId: 'saveSuccess', alertType: AlertTypes.INLINE}
                    ]
                }
            }
        });
        const wrapper = mountWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );
        expect(wrapper.find(InlineMessages).exists()).toBe(true);
    });
});
