const express = require('express');
const cors = require('cors');
const categories = require('./src/config/categories');
const notificationConfig = require('./src/config/notification');
const { loadMetadata, getPaginatedItems, searchItems, searchItemsAllCategories } = require('./src/utils/fileHelper');
const { getSearchSuggestionsForApi } = require('./src/utils/searchSuggestionHelper');
const {
    getDeviceById,
    upsertDevice,
    updateDevicePreferences,
    removeDevice,
} = require('./src/utils/notificationStore');
const { getPublicSettings } = require('./src/services/notificationService');
const packageInfo = require('./package.json');

const app = express();
const port = process.env.PORT || 3005;
const HIDDEN_DISCOVER_CATEGORY_IDS = new Set(['featured', 'latest']);
const HOME_CATEGORY_IDS = new Set(['featured', 'latest', 'sports']);

app.use(cors());
app.use(express.json());

function getCategory(categoryId) {
    return categories.find(c => c.id === categoryId);
}

function validateLimit(requestedLimit) {
    if (requestedLimit > 100) {
        return 'Parameter "limit" không được lớn hơn 100 vì mỗi file chỉ chứa tối đa 100 bài viết.';
    }

    return null;
}

function parseDateFilter(value) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function getDiscoverCategory(category) {
    const metadata = loadMetadata(category.id);
    const latestResult = metadata && metadata.total_articles > 0
        ? searchItems(category.id, metadata, {
            link: null,
            published_at: null,
            day: null,
            month: null,
            year: null,
        }, 0, 10)
        : { data: [] };

    return {
        id: category.id,
        name: category.name,
        total_articles: metadata ? metadata.total_articles : 0,
        latest_articles: latestResult.data,
    };
}

function getMemoryUsage() {
    const memoryUsage = process.memoryUsage();

    return {
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external_mb: Math.round(memoryUsage.external / 1024 / 1024),
    };
}

function successResponse(body) {
    return {
        status: 1,
        body,
    };
}

function errorResponse(message) {
    return {
        status: 0,
        body: {
            message,
        },
    };
}

/**
 * GET /api/news
 * Query params:
 *   - category: ID danh mục (default first in config)
 *   - page:     page number (default 1)
 *   - limit:    items per page (default 20, max 100)
 *
 * Always HTTP 200. Returns { status: 1, body: { data, pagination } } on success,
 * or { status: 0, body: { message } } on error.
 */
app.get('/api/news', (req, res) => {
    const categoryId = req.query.category || categories[0].id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const requestedLimit = parseInt(req.query.limit) || 20;

    const limitError = validateLimit(requestedLimit);
    if (limitError) {
        return res.json(errorResponse(limitError));
    }
    const limit = requestedLimit;

    const category = getCategory(categoryId);
    if (!category) {
        return res.json(errorResponse(`Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${categories.map(c => c.id).join(', ')}`));
    }

    const metadata = loadMetadata(categoryId);
    if (!metadata || metadata.total_articles === 0) {
        return res.json(errorResponse('Chưa có dữ liệu. Crawler có thể chưa chạy lần nào.'));
    }

    const result = getPaginatedItems(categoryId, metadata, page, limit);
    return res.json(successResponse({
        data: result.data,
        pagination: result.pagination
    }));
});

/**
 * GET /api/news/search
 * Query params:
 *   - category:     optional, ID danh mục; bỏ trống để search tất cả danh mục
 *   - text:         optional, tìm trong title/description; hỗ trợ tiếng Việt không dấu và bỏ dấu phân cách
 *   - link:         optional, tìm bài viết có link chứa chuỗi này
 *   - published_at: optional, tìm bài viết có published_at chứa chuỗi này
 *   - day/month/year: optional, lọc theo ngày, tháng, năm phát hành
 *   - page:         zero-based page number (default 0)
 *   - size:         items per page (default 20, max 100)
 */
app.get('/api/news/search', (req, res) => {
    const categoryId = req.query.category;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const requestedSize = Math.max(1, parseInt(req.query.size || req.query.limit) || 20);

    const sizeError = validateLimit(requestedSize);
    if (sizeError) {
        return res.json(errorResponse(sizeError.replace('"limit"', '"size"')));
    }
    const size = requestedSize;

    const filters = {
        text: req.query.text,
        link: req.query.link,
        published_at: req.query.published_at,
        day: parseDateFilter(req.query.day),
        month: parseDateFilter(req.query.month),
        year: parseDateFilter(req.query.year),
    };

    if (categoryId) {
        const category = getCategory(categoryId);
        if (!category) {
            return res.json(errorResponse(`Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${categories.map(c => c.id).join(', ')}`));
        }

        const metadata = loadMetadata(categoryId);
        if (!metadata || metadata.total_articles === 0) {
            return res.json(errorResponse('Chưa có dữ liệu. Crawler có thể chưa chạy lần nào.'));
        }

        const result = searchItems(categoryId, metadata, filters, page, size);
        return res.json(successResponse({
            data: result.data,
            pagination: result.pagination,
        }));
    }

    const result = searchItemsAllCategories(categories, filters, page, size);
    return res.json(successResponse({
        data: result.data,
        pagination: result.pagination,
    }));
});

/**
 * GET /api/search/suggestions
 * Query params:
 *   - limit: số lượng gợi ý (default 10, max 50)
 *
 * Trả về từ khóa crawl từ VnExpress, bù bằng defaultSearchSuggestions nếu thiếu.
 */
app.get('/api/search/suggestions', (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const result = getSearchSuggestionsForApi(limit);
    return res.json(successResponse({
        data: result.data,
        meta: result.meta,
    }));
});

/**
 * GET /api/discover
 * Returns all categories with category info and 10 latest articles for each category.
 */
app.get('/api/discover', (req, res) => {
    const result = categories
        .filter(category => !HIDDEN_DISCOVER_CATEGORY_IDS.has(category.id))
        .map(getDiscoverCategory);
    return res.json(successResponse({ data: result }));
});

/**
 * GET /api/ping
 * Returns basic server health and runtime information.
 */
app.get('/api/ping', (req, res) => {
    return res.json(successResponse({
        message: 'pong',
        data: {
            service: packageInfo.name,
            version: packageInfo.version,
            environment: process.env.NODE_ENV || 'development',
            port: Number(port),
            uptime_seconds: Math.floor(process.uptime()),
            server_time: new Date().toISOString(),
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
            memory: getMemoryUsage(),
        },
    }));
});

/**
 * GET /api/categories
 * Query params:
 *   - type: optional, use "home" to return home categories only.
 *
 * Returns list of categories. Always status = 1.
 */
app.get('/api/categories', (req, res) => {
    const sourceCategories = req.query.type === 'home'
        ? categories.filter(c => HOME_CATEGORY_IDS.has(c.id))
        : categories;
    const result = sourceCategories.map(c => ({ id: c.id, name: c.name }));
    return res.json(successResponse({ data: result }));
});

/**
 * GET /api/notifications/settings
 * Trả về cấu hình mặc định: số lần/ngày, khung giờ sáng-trưa-tối, timezone.
 */
app.get('/api/notifications/settings', (req, res) => {
    return res.json(successResponse({ data: getPublicSettings() }));
});

/**
 * POST /api/devices/register
 * Body: { device_id, fcm_token, platform?, preferences? }
 */
app.post('/api/devices/register', (req, res) => {
    const { device_id: deviceId, fcm_token: fcmToken, platform, preferences } = req.body || {};

    if (!deviceId || !fcmToken) {
        return res.json(errorResponse('Thiếu device_id hoặc fcm_token.'));
    }

    const maxPerDay = parseInt(preferences?.max_per_day, 10);
    const normalizedMaxPerDay = !Number.isNaN(maxPerDay) && maxPerDay > 0
        ? Math.min(maxPerDay, notificationConfig.timeSlots.length)
        : notificationConfig.defaults.maxPerDay;

    const device = upsertDevice({
        device_id: deviceId,
        fcm_token: fcmToken,
        platform: platform || 'unknown',
        preferences: {
            enabled: preferences?.enabled !== false,
            max_per_day: normalizedMaxPerDay,
            categories: Array.isArray(preferences?.categories) && preferences.categories.length > 0
                ? preferences.categories
                : notificationConfig.defaults.categories,
        },
    });

    return res.json(successResponse({ data: device }));
});

/**
 * GET /api/devices/:deviceId/preferences
 */
app.get('/api/devices/:deviceId/preferences', (req, res) => {
    const device = getDeviceById(req.params.deviceId);
    if (!device) {
        return res.json(errorResponse('Không tìm thấy thiết bị.'));
    }

    return res.json(successResponse({
        data: {
            device_id: device.device_id,
            preferences: device.preferences,
            updated_at: device.updated_at,
        },
    }));
});

/**
 * PUT /api/devices/:deviceId/preferences
 * Body: { enabled?, max_per_day?, categories? }
 */
app.put('/api/devices/:deviceId/preferences', (req, res) => {
    const device = getDeviceById(req.params.deviceId);
    if (!device) {
        return res.json(errorResponse('Không tìm thấy thiết bị. Hãy gọi POST /api/devices/register trước.'));
    }

    const body = req.body || {};
    const nextPreferences = { ...device.preferences };

    if (typeof body.enabled === 'boolean') {
        nextPreferences.enabled = body.enabled;
    }

    if (body.max_per_day !== undefined) {
        const maxPerDay = parseInt(body.max_per_day, 10);
        if (Number.isNaN(maxPerDay) || maxPerDay < 1) {
            return res.json(errorResponse('max_per_day phải là số nguyên >= 1.'));
        }
        nextPreferences.max_per_day = Math.min(maxPerDay, notificationConfig.timeSlots.length);
    }

    if (Array.isArray(body.categories)) {
        nextPreferences.categories = body.categories;
    }

    const updated = updateDevicePreferences(req.params.deviceId, nextPreferences);
    return res.json(successResponse({
        data: {
            device_id: updated.device_id,
            preferences: updated.preferences,
            updated_at: updated.updated_at,
        },
    }));
});

/**
 * DELETE /api/devices/:deviceId
 */
app.delete('/api/devices/:deviceId', (req, res) => {
    const removed = removeDevice(req.params.deviceId);
    if (!removed) {
        return res.json(errorResponse('Không tìm thấy thiết bị.'));
    }

    return res.json(successResponse({ data: { device_id: req.params.deviceId, removed: true } }));
});

app.listen(port, () => {
    console.log(`\nAPI Server đang chạy tại http://localhost:${port}`);
});
