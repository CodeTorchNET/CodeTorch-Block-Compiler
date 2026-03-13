// Legacy export format because this is used by some build-time scripts stuck in the past.
// eslint-disable-next-line import/no-commonjs
module.exports = {
    APP_NAME: process.env.APP_NAME,
    APP_DOMAIN: process.env.APP_DOMAIN,
    API_HOST: process.env.API_HOST,
    ASSET_HOST: process.env.ASSET_HOST,
    EXTENSION_HOST: process.env.EXTENSION_HOST,
    DEFAULT_CLOUD_HOST: process.env.DEFAULT_CLOUD_HOST,
    TRUSTED_IFRAME_HOST: process.env.TRUSTED_IFRAME_HOST,
    enableGenerate: false
};
