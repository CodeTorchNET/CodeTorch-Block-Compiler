import bufferedInputHOC from '../../../src/components/forms/buffered-input-hoc.jsx';

const BufferedInput = bufferedInputHOC(() => null);

const makeInput = props => {
    const input = new BufferedInput(Object.assign({onSubmit: jest.fn()}, props));
    input.setState = update => {
        input.state = Object.assign({}, input.state, update);
    };
    return input;
};

const shown = input => input.render().props.value;

describe('a buffered input that changes under the person', () => {
    test('a change arriving after focus does not rewrite the box', () => {
        const input = makeInput({value: 'Sprite1'});
        input.handleFocus({});
        input.props = Object.assign({}, input.props, {value: 'Kitty'});
        expect(shown(input)).toBe('Sprite1');
        input.handleChange({target: {value: 'Doggo'}});
        input.handleFlush();
        expect(input.props.onSubmit).toHaveBeenCalledWith('Doggo');
    });

    test('focusing and leaving without typing submits nothing', () => {
        const input = makeInput({value: 'Sprite1'});
        input.handleFocus({});
        input.props = Object.assign({}, input.props, {value: 'Kitty'});
        input.handleFlush();
        expect(input.props.onSubmit).not.toHaveBeenCalled();
        expect(shown(input)).toBe('Kitty');
    });

    test('a number box submits a number, and only when edited', () => {
        const input = makeInput({value: 10});
        input.handleFocus({});
        input.handleFlush();
        expect(input.props.onSubmit).not.toHaveBeenCalled();
        input.handleFocus({});
        input.handleChange({target: {value: '25'}});
        input.handleFlush();
        expect(input.props.onSubmit).toHaveBeenCalledWith(25);
    });

    test('the parent\'s own focus handler still runs', () => {
        const onFocus = jest.fn();
        const input = makeInput({value: 90, onFocus});
        input.handleFocus({type: 'focus'});
        expect(onFocus).toHaveBeenCalledWith({type: 'focus'});
    });

    test('a flush in the middle of a focus goes back to the live value', () => {
        const input = makeInput({value: 10});
        input.handleFocus({});
        input.handleChange({target: {value: '11'}});
        input.handleFlush();
        input.props = Object.assign({}, input.props, {value: 11});
        expect(shown(input)).toBe(11);
    });
});
