const {
    appendFeedback,
    generateFeedbackId,
} = require('../utils/feedbackStore');

const FEEDBACK_TYPES = new Set(['bug', 'feedback', 'other']);
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 2000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const rateLimitBuckets = new Map();

function trimString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeContext(value) {
    if (value === undefined || value === null) {
        return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value;
}

function getRateLimitKey(body, req) {
    const deviceId = trimString(body.device_id);
    if (deviceId) {
        return `device:${deviceId}`;
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.ip || req.socket?.remoteAddress || 'unknown';

    return `ip:${ip}`;
}

function isRateLimited(key) {
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key) || [];
    const recent = bucket.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
        rateLimitBuckets.set(key, recent);
        return true;
    }

    recent.push(now);
    rateLimitBuckets.set(key, recent);
    return false;
}

function validateFeedbackPayload(body) {
    const type = trimString(body?.type).toLowerCase();
    const message = trimString(body?.message);
    const context = normalizeContext(body?.context);

    if (!FEEDBACK_TYPES.has(type)) {
        return { error: 'type phải là bug, feedback hoặc other.' };
    }

    if (message.length < MESSAGE_MIN_LENGTH) {
        return { error: `message phải có ít nhất ${MESSAGE_MIN_LENGTH} ký tự.` };
    }

    if (message.length > MESSAGE_MAX_LENGTH) {
        return { error: `message không được vượt quá ${MESSAGE_MAX_LENGTH} ký tự.` };
    }

    if (context === null) {
        return { error: 'context phải là object.' };
    }

    const contact = trimString(body?.contact);
    if (contact.length > 320) {
        return { error: 'contact không được vượt quá 320 ký tự.' };
    }

    const deviceId = trimString(body?.device_id);
    if (deviceId.length > 128) {
        return { error: 'device_id không được vượt quá 128 ký tự.' };
    }

    const platform = trimString(body?.platform);
    if (platform.length > 32) {
        return { error: 'platform không được vượt quá 32 ký tự.' };
    }

    const appVersion = trimString(body?.app_version);
    if (appVersion.length > 32) {
        return { error: 'app_version không được vượt quá 32 ký tự.' };
    }

    const osVersion = trimString(body?.os_version);
    if (osVersion.length > 64) {
        return { error: 'os_version không được vượt quá 64 ký tự.' };
    }

    const screen = trimString(body?.screen);
    if (screen.length > 128) {
        return { error: 'screen không được vượt quá 128 ký tự.' };
    }

    return {
        item: {
            id: generateFeedbackId(),
            type,
            message,
            device_id: deviceId || null,
            platform: platform || null,
            app_version: appVersion || null,
            os_version: osVersion || null,
            screen: screen || null,
            context,
            contact: contact || null,
            status: 'new',
            created_at: new Date().toISOString(),
        },
    };
}

async function submitFeedback(body, req) {
    const validation = validateFeedbackPayload(body);
    if (validation.error) {
        return { success: false, message: validation.error };
    }

    const rateLimitKey = getRateLimitKey(body, req);
    if (isRateLimited(rateLimitKey)) {
        return {
            success: false,
            message: 'Bạn đã gửi quá nhiều phản hồi. Vui lòng thử lại sau.',
        };
    }

    const saved = await appendFeedback(validation.item);

    return {
        success: true,
        data: {
            id: saved.id,
            message: 'Cảm ơn bạn đã gửi phản hồi. Chúng tôi sẽ xem xét sớm.',
        },
    };
}

module.exports = {
    submitFeedback,
    validateFeedbackPayload,
};
