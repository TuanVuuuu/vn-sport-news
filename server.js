const express = require('express');
const cors = require('cors');
const categories = require('./src/config/categories');
const notificationConfig = require('./src/config/notification');
const {
    loadMetadata,
    getPaginatedItems,
    getArticlesByIds,
    searchItems,
    searchItemsAllCategories,
} = require('./src/utils/apiDataHelper');
const { getSearchSuggestionsForApi } = require('./src/utils/searchSuggestionHelper');
const dataRepo = require('./src/config/dataRepo');
const {
    getDeviceById,
    upsertDevice,
    updateDevicePreferences,
    removeDevice,
} = require('./src/utils/devicesStore');
const {
    getPublicSettings,
    sendTestNotification,
} = require('./src/services/notificationService');
const { getFixturesForApi } = require('./src/services/footballFixtureService');
const { submitFeedback } = require('./src/services/feedbackService');
const {
    isReviewing,
    filterCategoriesForReview,
    isCategoryHiddenDuringReview,
} = require('./src/utils/remoteConfigStore');
const {
    fetchImageBufferLocal,
    isHttpUrl,
    isLikelyImageBuffer,
} = require('./src/services/thumbnailBlurhashService');
const packageInfo = require('./package.json');

const app = express();
const port = process.env.PORT || 3005;
const PROXY_FETCH_TIMEOUT_MS = parseInt(process.env.BLURHASH_PROXY_TIMEOUT_MS, 10) || 45000;
const HIDDEN_DISCOVER_CATEGORY_IDS = new Set(['featured', 'latest']);
const HOME_CATEGORY_IDS = new Set(['featured', 'latest', 'sports']);
const MAX_ARTICLES_BY_IDS = 50;

app.use(cors());
app.use(express.json());

function getCategory(categoryId) {
    return categories.find(c => c.id === categoryId);
}

async function getVisibleCategories(options = {}) {
    const reviewing = await isReviewing();
    let visibleCategories = filterCategoriesForReview(categories, reviewing);

    if (options.homeOnly) {
        visibleCategories = visibleCategories.filter(category => HOME_CATEGORY_IDS.has(category.id));
    }

    return { reviewing, visibleCategories };
}

async function resolveCategory(categoryId) {
    const reviewing = await isReviewing();

    if (isCategoryHiddenDuringReview(categoryId, reviewing)) {
        return { reviewing, category: null };
    }

    return { reviewing, category: getCategory(categoryId) };
}

function formatCategoryIds(categoryList) {
    return categoryList.map(category => category.id).join(', ');
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

async function getDiscoverCategory(category) {
    const metadata = await loadMetadata(category.id);
    const latestResult = metadata && metadata.total_articles > 0
        ? await getPaginatedItems(category.id, metadata, 1, 10)
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

function getDefaultDevicePreferences() {
    return {
        enabled: notificationConfig.defaults.enabled,
        max_per_day: notificationConfig.defaults.maxPerDay,
        categories: [...notificationConfig.defaults.categories],
    };
}

function normalizeMaxPerDay(value) {
    const maxPerDay = parseInt(value, 10);
    if (Number.isNaN(maxPerDay) || maxPerDay < 1) {
        return null;
    }
    return Math.min(maxPerDay, notificationConfig.timeSlots.length);
}

function resolveRegisterPreferences(existingPreferences, incomingPreferences) {
    const base = existingPreferences
        ? { ...existingPreferences }
        : getDefaultDevicePreferences();

    if (!incomingPreferences) {
        return base;
    }

    if (typeof incomingPreferences.enabled === 'boolean') {
        base.enabled = incomingPreferences.enabled;
    }

    if (incomingPreferences.max_per_day !== undefined) {
        const normalized = normalizeMaxPerDay(incomingPreferences.max_per_day);
        if (normalized !== null) {
            base.max_per_day = normalized;
        }
    }

    if (Array.isArray(incomingPreferences.categories) && incomingPreferences.categories.length > 0) {
        base.categories = incomingPreferences.categories;
    }

    return base;
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
app.get('/api/news', async (req, res) => {
    try {
        const categoryId = req.query.category || categories[0].id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const requestedLimit = parseInt(req.query.limit) || 20;

        const limitError = validateLimit(requestedLimit);
        if (limitError) {
            return res.json(errorResponse(limitError));
        }
        const limit = requestedLimit;

        const { category } = await resolveCategory(categoryId);
        if (!category) {
            const { visibleCategories } = await getVisibleCategories();
            return res.json(errorResponse(`Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${formatCategoryIds(visibleCategories)}`));
        }

        const metadata = await loadMetadata(categoryId);
        if (!metadata || metadata.total_articles === 0) {
            return res.json(errorResponse('Chưa có dữ liệu. Crawler có thể chưa chạy lần nào.'));
        }

        const result = await getPaginatedItems(categoryId, metadata, page, limit);
        return res.json(successResponse({
            data: result.data,
            pagination: result.pagination,
        }));
    } catch (error) {
        console.error('[API] /api/news:', error.message);
        return res.json(errorResponse('Không thể tải dữ liệu từ data repo.'));
    }
});

/**
 * POST /api/news/by-ids
 * Body: { ids: string[], category?: string }
 */
app.post('/api/news/by-ids', async (req, res) => {
    try {
        const { ids, category: categoryId } = req.body || {};
        const normalizedIds = Array.isArray(ids)
            ? ids.map(id => String(id).trim()).filter(Boolean)
            : [];

        if (normalizedIds.length === 0) {
            return res.json(errorResponse('Field "ids" bắt buộc và phải là mảng không rỗng.'));
        }
        if (normalizedIds.length > MAX_ARTICLES_BY_IDS) {
            return res.json(errorResponse(`Tối đa ${MAX_ARTICLES_BY_IDS} id mỗi request.`));
        }

        let categoryList = (await getVisibleCategories()).visibleCategories;
        if (categoryId) {
            const { category } = await resolveCategory(categoryId);
            if (!category) {
                const { visibleCategories } = await getVisibleCategories();
                return res.json(errorResponse(`Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${formatCategoryIds(visibleCategories)}`));
            }
            categoryList = [category];
        }

        const result = await getArticlesByIds(normalizedIds, categoryList);
        return res.json(successResponse(result));
    } catch (error) {
        console.error('[API] /api/news/by-ids:', error.message);
        return res.json(errorResponse('Không thể tải dữ liệu từ data repo.'));
    }
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
app.get('/api/news/search', async (req, res) => {
    try {
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
            const { category } = await resolveCategory(categoryId);
            if (!category) {
                const { visibleCategories } = await getVisibleCategories();
                return res.json(errorResponse(`Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${formatCategoryIds(visibleCategories)}`));
            }

            const metadata = await loadMetadata(categoryId);
            if (!metadata || metadata.total_articles === 0) {
                return res.json(errorResponse('Chưa có dữ liệu. Crawler có thể chưa chạy lần nào.'));
            }

            const result = await searchItems(categoryId, metadata, filters, page, size);
            return res.json(successResponse({
                data: result.data,
                pagination: result.pagination,
            }));
        }

        const { visibleCategories } = await getVisibleCategories();
        const result = await searchItemsAllCategories(visibleCategories, filters, page, size);
        return res.json(successResponse({
            data: result.data,
            pagination: result.pagination,
        }));
    } catch (error) {
        console.error('[API] /api/news/search:', error.message);
        return res.json(errorResponse('Không thể tải dữ liệu từ data repo.'));
    }
});

/**
 * GET /api/search/suggestions
 * Query params:
 *   - limit: số lượng gợi ý (default 10, max 50)
 *
 * Trả về từ khóa crawl từ VnExpress, bù bằng defaultSearchSuggestions nếu thiếu.
 */
app.get('/api/search/suggestions', async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const result = await getSearchSuggestionsForApi(limit);
        return res.json(successResponse({
            data: result.data,
            meta: result.meta,
        }));
    } catch (error) {
        console.error('[API] /api/search/suggestions:', error.message);
        return res.json(errorResponse('Không thể tải gợi ý search từ data repo.'));
    }
});

/**
 * GET /api/discover
 * Returns all categories with category info and 10 latest articles for each category.
 */
app.get('/api/discover', async (req, res) => {
    try {
        const { visibleCategories } = await getVisibleCategories();
        const discoverCategories = visibleCategories
            .filter(category => !HIDDEN_DISCOVER_CATEGORY_IDS.has(category.id));
        const result = await Promise.all(discoverCategories.map(getDiscoverCategory));
        return res.json(successResponse({ data: result }));
    } catch (error) {
        console.error('[API] /api/discover:', error.message);
        return res.json(errorResponse('Không thể tải dữ liệu từ data repo.'));
    }
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
            data_source: dataRepo.rawBaseUrl,
        },
    }));
});

/**
 * GET /api/football/fixtures
 * Query params:
 *   - league_id: ID giải đấu (default 1 - World Cup)
 *   - date:      optional, lọc theo ngày YYYY-MM-DD
 *   - team_id:   optional, lọc theo đội bóng
 *
 * Trả về lịch thi đấu nhóm theo ngày, kèm danh sách ngày và đội để filter trên mobile.
 */
app.get('/api/football/fixtures', async (req, res) => {
    try {
        if (await isReviewing()) {
            return res.json(successResponse({ data: null }));
        }

        const leagueId = parseInt(req.query.league_id, 10) || 1;
        const teamId = req.query.team_id ? parseInt(req.query.team_id, 10) : null;

        if (req.query.team_id && Number.isNaN(teamId)) {
            return res.json(errorResponse('team_id phải là số nguyên hợp lệ.'));
        }

        const data = await getFixturesForApi({
            leagueId,
            date: req.query.date || null,
            teamId,
        });

        return res.json(successResponse({ data }));
    } catch (error) {
        console.error('[API] /api/football/fixtures:', error.message);
        return res.json(errorResponse('Không thể tải lịch thi đấu từ VnExpress.'));
    }
});

/**
 * GET /api/categories
 * Query params:
 *   - type: optional, use "home" to return home categories only.
 *
 * Returns list of categories. Always status = 1.
 */
app.get('/api/categories', async (req, res) => {
    try {
        const { visibleCategories } = await getVisibleCategories({
            homeOnly: req.query.type === 'home',
        });
        const result = visibleCategories.map(category => ({ id: category.id, name: category.name }));
        return res.json(successResponse({ data: result }));
    } catch (error) {
        console.error('[API] /api/categories:', error.message);
        return res.json(errorResponse('Không thể tải cấu hình remote.'));
    }
});

/**
 * GET /api/notifications/settings
 * Trả về cấu hình mặc định: số lần/ngày, khung giờ sáng-trưa-tối, timezone.
 */
app.get('/api/notifications/settings', (req, res) => {
    return res.json(successResponse({ data: getPublicSettings() }));
});

function isTestNotificationAuthorized(req) {
    const testSecret = process.env.FCM_TEST_SECRET;
    if (!testSecret) {
        return true;
    }

    const provided = req.get('X-FCM-Test-Secret') || req.body?.secret;
    return provided === testSecret;
}

/**
 * POST /api/notifications/test
 * Gửi push notification test tới token hoặc topic FCM.
 * Body: { target: 'token'|'topic', fcm_token?, topic?, variant?: 'single'|'digest', content?: { title?, body?, image?, highlight_id?, click_action?, article_count? }, secret? }
 * Header (tuỳ chọn): X-FCM-Test-Secret — bắt buộc nếu server có FCM_TEST_SECRET.
 */
app.post('/api/notifications/test', async (req, res) => {
    if (!isTestNotificationAuthorized(req)) {
        return res.json(errorResponse('Không có quyền gửi thông báo test. Cần header X-FCM-Test-Secret hợp lệ.'));
    }

    const body = req.body || {};
    const variant = body.variant === 'digest' ? 'digest' : 'single';
    let target = body.target;
    let fcmToken = body.fcm_token || null;
    const topic = body.topic || null;

    if (!target) {
        if (fcmToken) {
            target = 'token';
        } else if (body.device_id) {
            target = 'token';
        } else {
            target = 'topic';
        }
    }

    if (body.device_id) {
        try {
            const device = await getDeviceById(body.device_id);
            if (!device) {
                return res.json(errorResponse('Không tìm thấy thiết bị. Hãy gọi POST /api/devices/register trước.'));
            }

            if (!device.fcm_token) {
                return res.json(errorResponse('Thiết bị chưa có fcm_token.'));
            }

            fcmToken = device.fcm_token;
            target = 'token';
        } catch (error) {
            console.error('[notifications/test] Lỗi đọc thiết bị:', error.message);
            return res.json(errorResponse('Không đọc được dữ liệu thiết bị từ repo data.'));
        }
    }

    if (target === 'token' && !fcmToken) {
        return res.json(errorResponse('Thiếu fcm_token hoặc device_id hợp lệ.'));
    }

    try {
        const content = body.content && typeof body.content === 'object' ? body.content : {};

        const result = await sendTestNotification({
            target,
            fcmToken,
            topic,
            variant,
            content,
        });

        if (!result.success) {
            return res.json(errorResponse(result.message || 'Không gửi được thông báo test.'));
        }

        return res.json(successResponse({
            data: {
                message: 'Đã gửi thông báo test.',
                message_id: result.message_id,
                sent_to: result.sent_to,
                variant,
                payload: result.payload,
            },
        }));
    } catch (error) {
        console.error('[notifications/test] Lỗi gửi FCM:', error.message);
        return res.json(errorResponse(`Lỗi gửi FCM: ${error.message}`));
    }
});

/**
 * POST /api/devices/register
 * Body: { device_id, fcm_token, platform?, preferences? }
 */
app.post('/api/devices/register', async (req, res) => {
    const { device_id: deviceId, fcm_token: fcmToken, platform, preferences } = req.body || {};

    if (!deviceId || !fcmToken) {
        return res.json(errorResponse('Thiếu device_id hoặc fcm_token.'));
    }

    try {
        const existing = await getDeviceById(deviceId);

        const device = await upsertDevice({
            device_id: deviceId,
            fcm_token: fcmToken,
            platform: platform || existing?.platform || 'unknown',
            preferences: resolveRegisterPreferences(existing?.preferences, preferences),
        });

        return res.json(successResponse({ data: device }));
    } catch (error) {
        console.error('[devices] Lỗi register:', error.message);
        return res.json(errorResponse('Không lưu được thiết bị lên repo data.'));
    }
});

/**
 * GET /api/devices/:deviceId/preferences
 */
app.get('/api/devices/:deviceId/preferences', async (req, res) => {
    try {
        const device = await getDeviceById(req.params.deviceId);
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
    } catch (error) {
        console.error('[devices] Lỗi get preferences:', error.message);
        return res.json(errorResponse('Không đọc được dữ liệu thiết bị từ repo data.'));
    }
});

/**
 * PUT /api/devices/:deviceId/preferences
 * Body: { enabled?, max_per_day?, categories? }
 */
app.put('/api/devices/:deviceId/preferences', async (req, res) => {
    try {
        const device = await getDeviceById(req.params.deviceId);
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

        const updated = await updateDevicePreferences(req.params.deviceId, nextPreferences);
        return res.json(successResponse({
            data: {
                device_id: updated.device_id,
                preferences: updated.preferences,
                updated_at: updated.updated_at,
            },
        }));
    } catch (error) {
        console.error('[devices] Lỗi update preferences:', error.message);
        return res.json(errorResponse('Không cập nhật được thiết bị trên repo data.'));
    }
});

/**
 * POST /api/feedback
 * Body: { type, message, device_id?, platform?, app_version?, os_version?, screen?, context?, contact? }
 */
app.post('/api/feedback', async (req, res) => {
    try {
        const result = await submitFeedback(req.body || {}, req);

        if (!result.success) {
            return res.json(errorResponse(result.message));
        }

        return res.json(successResponse({ data: result.data }));
    } catch (error) {
        console.error('[feedback] Lỗi lưu phản hồi:', error.message);
        return res.json(errorResponse('Không lưu được phản hồi lên repo data.'));
    }
});

/**
 * DELETE /api/devices/:deviceId
 */
app.delete('/api/devices/:deviceId', async (req, res) => {
    try {
        const removed = await removeDevice(req.params.deviceId);
        if (!removed) {
            return res.json(errorResponse('Không tìm thấy thiết bị.'));
        }

        return res.json(successResponse({ data: { device_id: req.params.deviceId, removed: true } }));
    } catch (error) {
        console.error('[devices] Lỗi remove device:', error.message);
        return res.json(errorResponse('Không xóa được thiết bị trên repo data.'));
    }
});

/**
 * GET /api/internal/fetch-image
 * Proxy tải ảnh cho crawler/backfill trên GitHub Actions (CDN có thể chặn IP datacenter).
 * Query: url, referer (optional)
 * Header: X-Internal-Fetch-Secret
 */
app.get('/api/internal/fetch-image', async (req, res) => {
    const secret = process.env.INTERNAL_FETCH_SECRET;
    if (!secret) {
        return res.status(503).json(errorResponse('INTERNAL_FETCH_SECRET chưa được cấu hình.'));
    }

    const provided = req.get('X-Internal-Fetch-Secret');
    if (provided !== secret) {
        return res.status(403).json(errorResponse('Không có quyền truy cập.'));
    }

    const imageUrl = req.query.url;
    if (!isHttpUrl(imageUrl)) {
        return res.status(400).json(errorResponse('Thiếu hoặc sai tham số url.'));
    }

    try {
        const buffer = await fetchImageBufferLocal(imageUrl, {
            pageReferer: req.query.referer || null,
            timeoutMs: PROXY_FETCH_TIMEOUT_MS,
        });

        if (!isLikelyImageBuffer(buffer)) {
            return res.status(502).json(errorResponse('Phản hồi không phải ảnh hợp lệ.'));
        }

        return res
            .status(200)
            .set('Content-Type', 'application/octet-stream')
            .set('Cache-Control', 'no-store')
            .send(buffer);
    } catch (error) {
        const upstreamStatus = error.response?.status;
        const detail = upstreamStatus || error.message;
        console.error('[internal/fetch-image]', imageUrl, detail);
        return res.status(502).json(errorResponse(`Không tải được ảnh từ nguồn (${detail}).`));
    }
});

app.listen(port, () => {
    console.log(`\nAPI Server đang chạy tại http://localhost:${port}`);
});
