const fs = require('fs');
const path = require('path');
const dataRepoGitHub = require('./dataRepoGitHub');

const DEVICES_PATH = 'notifications/devices.json';
const LOCAL_DEVICES_FILE = path.join(__dirname, '../../data/notifications/devices.json');
const EMPTY_STORE = { devices: [] };

function ensureLocalDir() {
    const dir = path.dirname(LOCAL_DEVICES_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readLocalDevices() {
    if (!fs.existsSync(LOCAL_DEVICES_FILE)) {
        return { ...EMPTY_STORE };
    }

    try {
        return JSON.parse(fs.readFileSync(LOCAL_DEVICES_FILE, 'utf8'));
    } catch (error) {
        return { ...EMPTY_STORE };
    }
}

function writeLocalDevices(data) {
    ensureLocalDir();
    fs.writeFileSync(LOCAL_DEVICES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function useRemoteStore() {
    return dataRepoGitHub.isConfigured();
}

async function loadDevices() {
    if (useRemoteStore()) {
        const result = await dataRepoGitHub.readJsonFile(DEVICES_PATH, { ...EMPTY_STORE });
        return result.data;
    }

    return readLocalDevices();
}

function isConflictError(error) {
    return error.status === 409;
}

async function saveDevices(data, commitMessage = 'Update devices.json') {
    if (useRemoteStore()) {
        const current = await dataRepoGitHub.readJsonFile(DEVICES_PATH, { ...EMPTY_STORE });
        await dataRepoGitHub.writeJsonFile(DEVICES_PATH, data, commitMessage, current.sha);
        return;
    }

    writeLocalDevices(data);
}

async function getDeviceById(deviceId) {
    const store = await loadDevices();
    return store.devices.find(device => device.device_id === deviceId) || null;
}

async function upsertDevice(device, maxAttempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const store = await loadDevices();
            const index = store.devices.findIndex(item => item.device_id === device.device_id);
            const now = new Date().toISOString();

            if (index >= 0) {
                store.devices[index] = {
                    ...store.devices[index],
                    ...device,
                    updated_at: now,
                };
            } else {
                store.devices.push({
                    ...device,
                    created_at: now,
                    updated_at: now,
                });
            }

            const action = index >= 0 ? 'Update' : 'Register';
            await saveDevices(store, `${action} device ${device.device_id}`);
            return store.devices.find(item => item.device_id === device.device_id) || null;
        } catch (error) {
            lastError = error;
            if (!isConflictError(error) || attempt === maxAttempts) {
                throw error;
            }
        }
    }

    throw lastError;
}

async function updateDevicePreferences(deviceId, preferences) {
    const device = await getDeviceById(deviceId);
    if (!device) {
        return null;
    }

    return upsertDevice({
        ...device,
        preferences: {
            ...device.preferences,
            ...preferences,
        },
    });
}

async function removeDevice(deviceId, maxAttempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const store = await loadDevices();
            const nextDevices = store.devices.filter(device => device.device_id !== deviceId);

            if (nextDevices.length === store.devices.length) {
                return false;
            }

            await saveDevices({ devices: nextDevices }, `Remove device ${deviceId}`);
            return true;
        } catch (error) {
            lastError = error;
            if (!isConflictError(error) || attempt === maxAttempts) {
                throw error;
            }
        }
    }

    throw lastError;
}

module.exports = {
    DEVICES_PATH,
    useRemoteStore,
    loadDevices,
    saveDevices,
    getDeviceById,
    upsertDevice,
    updateDevicePreferences,
    removeDevice,
};
