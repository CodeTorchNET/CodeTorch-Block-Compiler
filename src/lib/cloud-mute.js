const cloudOf = runtime => (runtime && runtime.ioDevices && runtime.ioDevices.cloud) || null;

export const muteCloud = runtime => {
    const cloud = cloudOf(runtime);
    if (!cloud || !cloud.provider) return () => {};
    const provider = cloud.provider;
    cloud.provider = null;
    return () => {
        if (cloud.provider === null) cloud.provider = provider;
    };
};

export const withCloudMuted = (runtime, fn) => {
    const unmute = muteCloud(runtime);
    try {
        return fn();
    } finally {
        unmute();
    }
};

export const resyncCloud = runtime => {
    const cloud = cloudOf(runtime);
    const provider = cloud && cloud.provider;
    const conn = provider && provider.connection;
    if (!conn || typeof conn.close !== 'function') return false;
    try {
        conn.close();
        return true;
    } catch (e) {
        return false;
    }
};
