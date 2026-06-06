const fs = require('fs');
const path = require('path');

const NOTIFICATIONS_DIR = path.join(__dirname, '../../data/notifications');
const SENT_FILE = path.join(NOTIFICATIONS_DIR, 'sent_notifications.json');
const SEND_LOG_FILE = path.join(NOTIFICATIONS_DIR, 'send_log.json');
const PENDING_FILE = path.join(NOTIFICATIONS_DIR, 'pending_digest.json');
const DEVICES_FILE = path.join(NOTIFICATIONS_DIR, 'devices.json');

function ensureNotificationsDir() {
    if (!fs.existsSync(NOTIFICATIONS_DIR)) {
        fs.mkdirSync(NOTIFICATIONS_DIR, { recursive: true });
    }
}

function readJsonFile(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

function writeJsonFile(filePath, data) {
    ensureNotificationsDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadSentNotifications() {
    return readJsonFile(SENT_FILE, {});
}

function saveSentNotifications(data) {
    writeJsonFile(SENT_FILE, data);
}

function loadSendLog() {
    return readJsonFile(SEND_LOG_FILE, { entries: [] });
}

function saveSendLog(data) {
    writeJsonFile(SEND_LOG_FILE, data);
}

function loadPendingDigest() {
    return readJsonFile(PENDING_FILE, { featured: [] });
}

function savePendingDigest(data) {
    writeJsonFile(PENDING_FILE, data);
}

function loadDevices() {
    return readJsonFile(DEVICES_FILE, { devices: [] });
}

function saveDevices(data) {
    writeJsonFile(DEVICES_FILE, data);
}

function getDeviceById(deviceId) {
    const store = loadDevices();
    return store.devices.find(device => device.device_id === deviceId) || null;
}

function upsertDevice(device) {
    const store = loadDevices();
    const index = store.devices.findIndex(item => item.device_id === device.device_id);

    if (index >= 0) {
        store.devices[index] = {
            ...store.devices[index],
            ...device,
            updated_at: new Date().toISOString(),
        };
    } else {
        store.devices.push({
            ...device,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    }

    saveDevices(store);
    return getDeviceById(device.device_id);
}

function updateDevicePreferences(deviceId, preferences) {
    const device = getDeviceById(deviceId);
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

function removeDevice(deviceId) {
    const store = loadDevices();
    const nextDevices = store.devices.filter(device => device.device_id !== deviceId);

    if (nextDevices.length === store.devices.length) {
        return false;
    }

    saveDevices({ devices: nextDevices });
    return true;
}

function getEnabledDevices() {
    return loadDevices().devices.filter(device => device.preferences?.enabled !== false && device.fcm_token);
}

function filterUnsentArticles(articles, sentMap) {
    return articles.filter(article => !sentMap[article.id]);
}

function addPendingFeaturedArticles(articles) {
    const pending = loadPendingDigest();
    const seen = new Set(pending.featured.map(item => item.id));
    const merged = [...pending.featured];

    for (const article of articles) {
        if (!seen.has(article.id)) {
            seen.add(article.id);
            merged.push(article);
        }
    }

    merged.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
    savePendingDigest({ featured: merged });
    return merged;
}

function clearPendingFeaturedArticles(articleIds) {
    const pending = loadPendingDigest();
    const idSet = new Set(articleIds);
    pending.featured = pending.featured.filter(article => !idSet.has(article.id));
    savePendingDigest(pending);
}

function recordSentNotification({
    articleIds,
    topic = null,
    deviceId = null,
    slotId = null,
    type = 'featured_digest',
    highlightId = null,
}) {
    const sentMap = loadSentNotifications();
    const now = new Date().toISOString();

    for (const articleId of articleIds) {
        sentMap[articleId] = now;
    }
    saveSentNotifications(sentMap);

    const sendLog = loadSendLog();
    sendLog.entries.push({
        sent_at: now,
        topic,
        device_id: deviceId,
        slot: slotId,
        type,
        article_ids: articleIds,
        highlight_id: highlightId,
    });

    if (sendLog.entries.length > 500) {
        sendLog.entries = sendLog.entries.slice(-500);
    }

    saveSendLog(sendLog);
}

module.exports = {
    NOTIFICATIONS_DIR,
    loadSentNotifications,
    saveSentNotifications,
    loadSendLog,
    saveSendLog,
    loadPendingDigest,
    savePendingDigest,
    loadDevices,
    saveDevices,
    getDeviceById,
    upsertDevice,
    updateDevicePreferences,
    removeDevice,
    getEnabledDevices,
    filterUnsentArticles,
    addPendingFeaturedArticles,
    clearPendingFeaturedArticles,
    recordSentNotification,
};
