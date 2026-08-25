import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import VM from 'scratch-vm';

class TargetHighlight extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'getPageCoords'
        ]);
    }

    getPageCoords (x, y) {
        const {stageWidth, stageHeight, vm} = this.props;
        const nativeSize = vm.renderer.getNativeSize();
        return [
            ((stageWidth / nativeSize[0]) * x) + (stageWidth / 2),
            -((stageHeight / nativeSize[1]) * y) + (stageHeight / 2)
        ];
    }

    render () {
        const {
            className,
            highlightedTargetId,
            highlightedTargetTime,
            vm
        } = this.props;

        if (!(highlightedTargetId && vm && vm.renderer &&
            vm.runtime.getTargetById(highlightedTargetId))) return null;

        const target = vm.runtime.getTargetById(highlightedTargetId);

        const costume = target.getCostumes()[target.currentCostume];
        if (!costume || typeof costume.skinId !== 'number') return null;

        const bounds = vm.renderer.getBounds(target.drawableID);
        const [left, top] = this.getPageCoords(bounds.left, bounds.top);
        const [right, bottom] = this.getPageCoords(bounds.right, bounds.bottom);

        const pad = 2;

        return (
            <div
                className={className}
                key={highlightedTargetTime}
                style={{
                    position: 'absolute',
                    top: `${top - pad}px`,
                    left: `${left - pad}px`,
                    width: `${(right - left) + (2 * pad)}px`,
                    height: `${(bottom - top) + (2 * pad)}px`
                }}
            />
        );
    }
}

TargetHighlight.propTypes = {
    className: PropTypes.string,
    highlightedTargetId: PropTypes.string,
    highlightedTargetTime: PropTypes.number,
    stageHeight: PropTypes.number,
    stageWidth: PropTypes.number,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    highlightedTargetTime: state.scratchGui.targets.highlightedTargetTime,
    highlightedTargetId: state.scratchGui.targets.highlightedTargetId,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TargetHighlight);
