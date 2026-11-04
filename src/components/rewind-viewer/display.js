import VM from 'scratch-vm';
import Renderer from 'scratch-render';
import ScratchStorage from 'scratch-storage';
import {BitmapAdapter as V2BitmapAdapter} from '@turbowarp/scratch-svg-renderer';
import {loadStateIntoVm} from '../../lib/rewind/state';

const STAGE_W = 480;
const STAGE_H = 360;

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

export const makeProxyStorage = source => {
    const display = new ScratchStorage();
    const cache = new Map();
    display.addHelper({
        load (assetType, assetId, dataFormat) {
            const key = `${assetId}.${dataFormat}`;
            if (!cache.has(key)) {
                const p = Promise.resolve(source.load(assetType, assetId, dataFormat)).catch(() => null);
                cache.set(key, p);
                p.then(asset => {
                    if (!asset) cache.delete(key);
                });
            }
            return cache.get(key);
        }
    }, 100);
    return display;
};

export const visualSignature = state => {
    const parts = [];
    for (const t of state.targets) {
        parts.push(t.id, t.name, t.isStage ? 'S' : 's');
        for (const c of t.costumes || []) {
            parts.push(c.id, c.md5ext, c.rotationCenterX, c.rotationCenterY, c.bitmapResolution);
        }
        parts.push('|');
    }
    const layered = state.targets.filter(t => !t.isStage).slice()
        .sort((a, b) => (a.layerOrder || 0) - (b.layerOrder || 0))
        .map(t => t.id);
    parts.push(layered.join(','));
    parts.push((state.fonts || []).map(f => `${f.family}:${f.md5ext || ''}`).join(','));
    return parts.join('\u0001');
};

export const displayOnly = state => Object.assign({}, state, {
    targets: state.targets.map(t => Object.assign({}, t, {blocks: {}, comments: {}})),
    monitors: [],
    extensions: []
});

const PROP_SETTERS = [
    ['x', (t, s) => t.setXY(s.x, typeof s.y === 'number' ? s.y : t.y, true)],
    ['y', (t, s) => t.setXY(typeof s.x === 'number' ? s.x : t.x, s.y, true)],
    ['direction', (t, s) => t.setDirection(s.direction)],
    ['size', (t, s) => t.setSize(s.size)],
    ['visible', (t, s) => t.setVisible(!!s.visible)],
    ['currentCostume', (t, s) => t.setCostume(s.currentCostume)],
    ['rotationStyle', (t, s) => t.setRotationStyle(s.rotationStyle)]
];

export default class RewindDisplay {
    constructor ({storage, canvas}) {
        this.vm = new VM();
        this.vm.attachStorage(makeProxyStorage(storage));
        this.canvas = canvas;
        this.renderer = null;
        try {
            this.renderer = new Renderer(canvas, -STAGE_W / 2, STAGE_W / 2, -STAGE_H / 2, STAGE_H / 2);
            this.vm.attachRenderer(this.renderer);
            const skinWasAltered = this.renderer.skinWasAltered.bind(this.renderer);
            this.renderer.skinWasAltered = skin => {
                skinWasAltered(skin);
                this.scheduleDraw();
            };
        } catch (e) {
            this.renderer = null;
        }
        this.vm.attachV2BitmapAdapter(new V2BitmapAdapter());
        this.vm.securityManager.canLoadExtensionFromProject = () => Promise.resolve(false);
        this.vm.extensionManager.loadExtensionURL = () => Promise.resolve();

        this.drawFrame = null;
        this.loadedSignature = null;
        this.loading = null;
        this.stats = {fullLoads: 0, propUpdates: 0, lastFullMs: 0, lastPropMs: 0, maxFullMs: 0};
        this._thumbs = new Map();
        this.disposed = false;
    }

    async show (state) {
        if (this.disposed) return 'props';
        const sig = visualSignature(state);
        if (sig !== this.loadedSignature) {
            const t0 = now();
            await loadStateIntoVm(this.vm, displayOnly(state));
            if (this.disposed) return 'full';
            this.loadedSignature = sig;
            this._syncProps(state);
            this.draw();
            const ms = now() - t0;
            this.stats.fullLoads++;
            this.stats.lastFullMs = ms;
            this.stats.maxFullMs = Math.max(this.stats.maxFullMs, ms);
            return 'full';
        }
        const t0 = now();
        this._syncProps(state);
        this.draw();
        this.stats.propUpdates++;
        this.stats.lastPropMs = now() - t0;
        return 'props';
    }

    _syncProps (state) {
        const runtime = this.vm.runtime;
        for (const st of state.targets) {
            const t = runtime.getTargetById(st.id);
            if (!t) continue;
            for (const [key, set] of PROP_SETTERS) {
                if (typeof st[key] === 'undefined' || st[key] === null || t[key] === st[key]) continue;
                if (st.isStage && key !== 'currentCostume') continue;
                try {
                    set(t, st);
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    draw () {
        if (this.renderer) this.renderer.draw();
    }

    /**
     * One draw on the next frame, however many skins finish before it.
     */
    scheduleDraw () {
        if (this.drawFrame !== null || this.disposed) return;
        const run = () => {
            this.drawFrame = null;
            if (!this.disposed) this.draw();
        };
        this.drawFrame = typeof requestAnimationFrame === 'function' ?
            requestAnimationFrame(run) : setTimeout(run, 0);
    }

    resize (width, height) {
        if (this.renderer) {
            this.renderer.resize(width, height);
            this.draw();
        }
    }

    costumeUri (targetId, costumeId) {
        const target = this.vm.runtime.getTargetById(targetId);
        if (!target) return null;
        const costume = target.getCostumes().find(c => c.id === costumeId);
        if (!costume || !costume.asset) return null;
        const key = `${costume.assetId}.${costume.dataFormat}`;
        if (!this._thumbs.has(key)) {
            try {
                this._thumbs.set(key, costume.asset.encodeDataURI());
            } catch (e) {
                return null;
            }
        }
        return this._thumbs.get(key);
    }

    dispose () {
        this.disposed = true;
        if (this.drawFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.drawFrame);
        try {
            this.vm.stopAll();
            this.vm.clear();
        } catch (e) {
            // ignore
        }
        if (this.renderer) {
            try {
                const gl = this.renderer._gl;
                const lose = gl && gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            } catch (e) {
                // ignore
            }
        }
        this._thumbs.clear();
    }
}
