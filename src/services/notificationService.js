const notificationConfig = require('../config/notification');
const {
    loadSentNotifications,
    getEnabledDevices,
    filterUnsentArticles,
    addPendingFeaturedArticles,
    clearPendingFeaturedArticles,
    recordSentNotification,
    loadSendLog,
} = require('../utils/notificationStore');

let firebaseAdmin = null;

const TEST_ARTICLES = [
    {
        id: 'test://sportnews/single-article',
        title: '[TEST] Đội tuyển Việt Nam thắng 2-0 trong trận giao hữu',
        thumbnail_url: 'https://picsum.photos/seed/sportnews-test-1/400/225',
    },
    {
        id: 'test://sportnews/digest-article-1',
        title: '[TEST] Real Madrid vô địch Champions League',
        thumbnail_url: 'https://picsum.photos/seed/sportnews-test-2/400/225',
    },
    {
        id: 'test://sportnews/digest-article-2',
        title: '[TEST] Djokovic vào chung kết Australian Open',
        thumbnail_url: 'https://picsum.photos/seed/sportnews-test-3/400/225',
    },
];

function getIctParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: notificationConfig.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: parseInt(values.hour, 10),
        dateKey: `${values.year}-${values.month}-${values.day}`,
    };
}

function getCurrentSlot(now = new Date()) {
    const { hour } = getIctParts(now);

    return notificationConfig.timeSlots.find(slot => hour >= slot.startHour && hour < slot.endHour) || null;
}

function getEntriesForDate(entries, dateKey, deviceId = null) {
    return entries.filter(entry => {
        const entryDateKey = getIctParts(new Date(entry.sent_at)).dateKey;
        if (entryDateKey !== dateKey) {
            return false;
        }

        if (deviceId) {
            return entry.device_id === deviceId;
        }

        return !entry.device_id;
    });
}

function canSendNow({
    now = new Date(),
    maxPerDay,
    deviceId = null,
    sendLog = loadSendLog(),
}) {
    const { dateKey } = getIctParts(now);
    const currentSlot = getCurrentSlot(now);

    if (!currentSlot) {
        return {
            allowed: false,
            reason: 'outside_time_slots',
            currentSlot: null,
            dateKey,
        };
    }

    const allowedSlotIds = notificationConfig.getAllowedSlotIds(maxPerDay);
    if (!allowedSlotIds.includes(currentSlot.id)) {
        return {
            allowed: false,
            reason: 'slot_not_allowed_for_daily_limit',
            currentSlot,
            dateKey,
        };
    }

    const todayEntries = getEntriesForDate(sendLog.entries, dateKey, deviceId);
    if (todayEntries.length >= maxPerDay) {
        return {
            allowed: false,
            reason: 'daily_limit_reached',
            currentSlot,
            dateKey,
        };
    }

    const sentInCurrentSlot = todayEntries.some(entry => entry.slot === currentSlot.id);
    if (sentInCurrentSlot) {
        return {
            allowed: false,
            reason: 'slot_already_sent',
            currentSlot,
            dateKey,
        };
    }

    return {
        allowed: true,
        reason: null,
        currentSlot,
        dateKey,
    };
}

function getDeviceMaxPerDay(device) {
    const value = parseInt(device?.preferences?.max_per_day, 10);
    if (!Number.isNaN(value) && value > 0) {
        return Math.min(value, notificationConfig.timeSlots.length);
    }

    return notificationConfig.limits.maxPerDay;
}

function buildDigestPayload(articles, categoryId = 'featured') {
    const limitedArticles = articles.slice(-notificationConfig.limits.maxArticlesPerNotification);
    const highlight = limitedArticles[limitedArticles.length - 1];
    const count = limitedArticles.length;

    const title = count === 1 ? 'Tin nổi bật mới' : `${count} tin nổi bật mới`;
    const body = count === 1
        ? highlight.title
        : `${highlight.title} và ${count - 1} tin khác`;

    return {
        notification: {
            title,
            body,
            image: highlight.thumbnail_url || undefined,
        },
        data: {
            type: 'featured_digest',
            highlight_id: highlight.id,
            article_count: String(count),
            category_id: categoryId,
            click_action: 'OPEN_ARTICLE',
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'featured_news',
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                },
            },
        },
    };
}

function initFirebase({ skipEnabledCheck = false } = {}) {
    if (firebaseAdmin) {
        return firebaseAdmin;
    }

    if (!skipEnabledCheck && !notificationConfig.enabled) {
        return null;
    }

    const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
        console.warn('[FCM] Bỏ qua gửi thông báo: thiếu FCM_SERVICE_ACCOUNT_JSON');
        return null;
    }

    try {
        const admin = require('firebase-admin');
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
            });
        }
        firebaseAdmin = admin;
        return firebaseAdmin;
    } catch (error) {
        console.error('[FCM] Không khởi tạo được Firebase Admin SDK:', error.message);
        return null;
    }
}

async function sendToToken(token, payload, { skipEnabledCheck = false } = {}) {
    const admin = initFirebase({ skipEnabledCheck });
    if (!admin) {
        return { success: false, skipped: true, reason: 'firebase_not_ready' };
    }

    const response = await admin.messaging().send({
        token,
        notification: payload.notification,
        data: payload.data,
        android: payload.android,
        apns: payload.apns,
    });

    return { success: true, response };
}

async function sendToTopic(topic, payload, { skipEnabledCheck = false } = {}) {
    const admin = initFirebase({ skipEnabledCheck });
    if (!admin) {
        return { success: false, skipped: true, reason: 'firebase_not_ready' };
    }

    const response = await admin.messaging().send({
        topic,
        notification: payload.notification,
        data: payload.data,
        android: payload.android,
        apns: payload.apns,
    });

    return { success: true, response };
}

async function deliverDigest({
    articles,
    topic = null,
    deviceId = null,
    token = null,
    slotId = null,
}) {
    const payload = buildDigestPayload(articles);
    const articleIds = articles.map(article => article.id);
    const highlightId = payload.data.highlight_id;

    let result;
    if (token) {
        result = await sendToToken(token, payload);
    } else if (topic) {
        result = await sendToTopic(topic, payload);
    } else {
        return { success: false, skipped: true, reason: 'missing_target' };
    }

    if (result.success) {
        recordSentNotification({
            articleIds,
            topic,
            deviceId,
            slotId,
            highlightId,
        });
        clearPendingFeaturedArticles(articleIds);
    }

    return result;
}

async function notifyFeaturedNews(newArticles) {
    if (!notificationConfig.enabled) {
        console.log('[FCM] Đã tắt (FCM_ENABLED=false). Bỏ qua gửi thông báo.');
        return { sent: 0, skipped: true, reason: 'disabled' };
    }

    const sentMap = loadSentNotifications();
    const unsentNewArticles = filterUnsentArticles(newArticles, sentMap);
    const pendingArticles = addPendingFeaturedArticles(unsentNewArticles);
    const articlesToSend = filterUnsentArticles(pendingArticles, sentMap);

    if (articlesToSend.length === 0) {
        console.log('[FCM] Không có bài mới để gửi sau khi dedup.');
        return { sent: 0, skipped: true, reason: 'no_new_articles' };
    }

    const now = new Date();
    const sendLog = loadSendLog();
    const enabledDevices = getEnabledDevices();
    let sentCount = 0;
    const skipReasons = [];

    if (enabledDevices.length > 0) {
        for (const device of enabledDevices) {
            const gate = canSendNow({
                now,
                maxPerDay: getDeviceMaxPerDay(device),
                deviceId: device.device_id,
                sendLog,
            });

            if (!gate.allowed) {
                skipReasons.push(`${device.device_id}:${gate.reason}`);
                continue;
            }

            try {
                const result = await deliverDigest({
                    articles: articlesToSend,
                    deviceId: device.device_id,
                    token: device.fcm_token,
                    slotId: gate.currentSlot.id,
                });

                if (result.success) {
                    sentCount += 1;
                    console.log(`[FCM] Đã gửi tới thiết bị ${device.device_id} (slot ${gate.currentSlot.id}).`);
                }
            } catch (error) {
                console.error(`[FCM] Lỗi gửi tới thiết bị ${device.device_id}:`, error.message);
            }
        }
    } else {
        const gate = canSendNow({
            now,
            maxPerDay: notificationConfig.limits.maxPerDay,
            deviceId: null,
            sendLog,
        });

        if (!gate.allowed) {
            console.log(`[FCM] Giữ pending ${articlesToSend.length} bài — ${gate.reason}.`);
            return { sent: 0, skipped: true, reason: gate.reason, pending: articlesToSend.length };
        }

        try {
            const result = await deliverDigest({
                articles: articlesToSend,
                topic: notificationConfig.topics.featured,
                slotId: gate.currentSlot.id,
            });

            if (result.success) {
                sentCount = 1;
                console.log(`[FCM] Đã gửi topic ${notificationConfig.topics.featured} (slot ${gate.currentSlot.id}).`);
            } else if (result.skipped) {
                skipReasons.push(result.reason);
            }
        } catch (error) {
            console.error('[FCM] Lỗi gửi topic:', error.message);
        }
    }

    if (sentCount === 0 && skipReasons.length > 0) {
        console.log(`[FCM] Không gửi trong lần crawl này. Lý do: ${skipReasons.join(', ')}`);
    }

    return {
        sent: sentCount,
        skipped: sentCount === 0,
        pending: articlesToSend.length,
        reasons: skipReasons,
    };
}

function getTestArticles(variant = 'single') {
    if (variant === 'digest') {
        return TEST_ARTICLES;
    }

    return [TEST_ARTICLES[0]];
}

function buildTestPayload({ variant = 'single', content = {} } = {}) {
    const articles = getTestArticles(variant);
    const payload = buildDigestPayload(articles);

    if (content.title) {
        payload.notification.title = content.title;
    }

    if (content.body) {
        payload.notification.body = content.body;
    }

    if (content.image !== undefined) {
        payload.notification.image = content.image || undefined;
    }

    if (content.highlight_id) {
        payload.data.highlight_id = content.highlight_id;
    }

    if (content.click_action) {
        payload.data.click_action = content.click_action;
    }

    if (content.article_count !== undefined) {
        payload.data.article_count = String(content.article_count);
    }

    payload.data.is_test = 'true';
    return payload;
}

async function sendTestNotification({
    target,
    fcmToken = null,
    topic = null,
    variant = 'single',
    content = {},
}) {
    const payload = buildTestPayload({ variant, content });

    let result;
    let sentTo;

    if (target === 'token') {
        if (!fcmToken) {
            return { success: false, error: 'missing_fcm_token' };
        }

        result = await sendToToken(fcmToken, payload, { skipEnabledCheck: true });
        sentTo = { type: 'token' };
    } else if (target === 'topic') {
        const resolvedTopic = topic || notificationConfig.topics.featured;
        result = await sendToTopic(resolvedTopic, payload, { skipEnabledCheck: true });
        sentTo = { type: 'topic', topic: resolvedTopic };
    } else {
        return { success: false, error: 'invalid_target' };
    }

    if (!result.success) {
        const reasonMessages = {
            firebase_not_ready: 'Chưa cấu hình FCM_SERVICE_ACCOUNT_JSON hoặc Firebase Admin SDK lỗi.',
        };

        return {
            success: false,
            error: result.reason || 'send_failed',
            message: reasonMessages[result.reason] || 'Không gửi được thông báo test.',
            sent_to: sentTo,
            payload,
        };
    }

    return {
        success: true,
        message_id: result.response,
        sent_to: sentTo,
        payload,
    };
}

function getPublicSettings() {
    return {
        enabled: notificationConfig.enabled,
        defaults: notificationConfig.defaults,
        limits: {
            max_per_day: notificationConfig.limits.maxPerDay,
            max_articles_per_notification: notificationConfig.limits.maxArticlesPerNotification,
        },
        time_slots: notificationConfig.timeSlots.map(slot => ({
            id: slot.id,
            label: slot.label,
            start_hour: slot.startHour,
            end_hour: slot.endHour,
        })),
        timezone: notificationConfig.timezone,
        topic: notificationConfig.topics.featured,
    };
}

module.exports = {
    getIctParts,
    getCurrentSlot,
    canSendNow,
    getDeviceMaxPerDay,
    buildDigestPayload,
    sendTestNotification,
    notifyFeaturedNews,
    getPublicSettings,
};
