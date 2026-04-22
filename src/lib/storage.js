import ScratchStorage from 'scratch-storage';

import defaultProject from './default-project';

// eslint-disable-next-line import/no-commonjs
const {TRUSTED_IFRAME_HOST} = require('./brand.js');

/**
 * Wrapper for ScratchStorage which adds default web sources.
 * @todo make this more configurable
 */
class Storage extends ScratchStorage {
    constructor () {
        super();
        this.cacheDefaultProject();
        this.accessKey = null;
    }
    addOfficialScratchWebStores () {
        this.addWebStore(
            [this.AssetType.Project],
            this.getProjectGetConfig.bind(this),
            this.getProjectCreateConfig.bind(this),
            this.getProjectUpdateConfig.bind(this)
        );
        this.addWebStore(
            [this.AssetType.ImageVector, this.AssetType.ImageBitmap, this.AssetType.Sound, this.AssetType.Font],
            this.getAssetGetConfig.bind(this),
            // We set both the create and update configs to the same method because
            // storage assumes it should update if there is an assetId, but the
            // asset store uses the assetId as part of the create URI.
            this.getAssetCreateConfig.bind(this),
            this.getAssetCreateConfig.bind(this)
        );
    }
    setCloudOTT (cloudOTT) {
        this.cloudOTT = cloudOTT;
    }
    getCloudOTT () {
        return this.cloudOTT;
    }
    setProjectHost (projectHost) {
        this.projectHost = projectHost;
    }
    setCTProjectHost (projectHost) { // this is the same regardless of wether scratch project or not
        this.CTprojectHost = projectHost;
    }
    setProjectToken (projectToken) {
        this.projectToken = projectToken;
    }
    setScratchProjectToken (projectToken) {
        this.scratchProjectToken = projectToken;
    }
    getTrustedHost (inputUrl){
        const url = new URL(inputUrl);
        const parts = url.hostname.split('.');

        // Keep only the last two parts (e.g., "b" and "com")
        const baseDomain = parts.slice(-2).join('.');

        // Build the new clean URL
        return `${url.protocol}//${baseDomain}`;
    }
    setCustomAchievements (customAchievements) {
        this.customAchievements = customAchievements;
    }
    async loadCustomAchievementData () {
        const accessToken = (await this.loadAccessToken()).token;
        const customAchievements = this.customAchievements ? this.customAchievements : {};
        return {accessToken, customAchievements};
    }
    async loadAccessToken () {
        const trustedOrigin = TRUSTED_IFRAME_HOST;

        window.parent.postMessage({type: 'block-compiler-action', action: 'JWT_AUTH_REQUEST'}, trustedOrigin);

        const creds = await new Promise(resolve => {
            // eslint-disable-next-line require-jsdoc, func-style
            function handleMessage (event) {
                if (event.origin !== trustedOrigin) {
                    console.warn('Ignored message from untrusted origin:', event.origin);
                    return;
                }

                if (event.data?.type === 'JWT_AUTH CREDS' && event.data?.token) {
                    window.removeEventListener('message', handleMessage);
                    resolve({
                        token: event.data.token,
                        username: event.data.username || '',
                        accessKey: event.data.accessKey || null
                    });
                }
            }

            window.addEventListener('message', handleMessage);
        });

        this.projectToken = creds.token;
        this.username = creds.username;
        this.accessKey = creds.accessKey;
        // eslint-disable-next-line require-atomic-updates
        window.CollaborationUsername = creds?.username;
        return creds;
    }
    async getProjectToken () {
        if (!this.projectToken) {
            await this.loadAccessToken();
        }
        return this.projectToken;
    }
    getProjectGetConfig (projectAsset) {
        let path = `${this.projectHost}/${projectAsset.assetId}`;
        const params = [];

        // Scratch tokens
        if (this.scratchProjectToken) {
            params.push(`token=${this.scratchProjectToken}`);
        }

        // CodeTorch Access Keys (Unlisted projects)
        if (this.accessKey) {
            params.push(`access_key=${this.accessKey}`);
        }

        if (params.length > 0) {
            path += `?${params.join('&')}`;
        }
        return path;
    }
    getProjectCreateConfig () {
        return {
            url: `${this.projectHost}/`,
            withCredentials: true
        };
    }
    getProjectUpdateConfig (projectAsset) {
        return {
            url: `${this.projectHost}/${projectAsset.assetId}`,
            withCredentials: true
        };
    }
    setAssetHost (assetHost) {
        this.assetHost = assetHost;
    }
    setAssetLoadHost (assetLoadHost) {
        this.assetLoadHost = assetLoadHost;
    }
    getAssetGetConfig (asset) {
        return `${this.assetLoadHost}/${asset.assetId}.${asset.dataFormat}`;
    }
    getAssetCreateConfig (asset) {
        return {
            // There is no such thing as updating assets, but storage assumes it
            // should update if there is an assetId, and the asset store uses the
            // assetId as part of the create URI. So, force the method to POST.
            // Then when storage finds this config to use for the "update", still POSTs
            method: 'post',
            headers: {
                Authorization: `Bearer ${this.projectToken}`
            },
            url: `${this.assetHost}/${asset.assetId}.${asset.dataFormat}`,
            withCredentials: true
        };
    }
    setTranslatorFunction (translator) {
        this.translator = translator;
        this.cacheDefaultProject();
    }
    cacheDefaultProject () {
        const defaultProjectAssets = defaultProject(this.translator);
        defaultProjectAssets.forEach(asset => this.builtinHelper._store(
            this.AssetType[asset.assetType],
            this.DataFormat[asset.dataFormat],
            asset.data,
            asset.id
        ));
    }
}

const storage = new Storage();

export default storage;
