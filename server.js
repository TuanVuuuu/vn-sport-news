const express = require('express');
const cors = require('cors');
const categories = require('./src/config/categories');
const { loadMetadata, getPaginatedItems, searchItems } = require('./src/utils/fileHelper');
const packageInfo = require('./package.json');

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());

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

function getMemoryUsage() {
    const memoryUsage = process.memoryUsage();

    return {
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external_mb: Math.round(memoryUsage.external / 1024 / 1024),
    };
}

/**
 * GET /api/news
 * Query params:
 *   - category: ID danh mục (default first in config)
 *   - page:     page number (default 1)
 *   - limit:    items per page (default 20, max 100)
 *
 * Always HTTP 200. Returns { status: 1, data, pagination } on success,
 * or { status: 0, message } on error.
 */
app.get('/api/news', (req, res) => {
    const categoryId = req.query.category || categories[0].id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const requestedLimit = parseInt(req.query.limit) || 20;

    const limitError = validateLimit(requestedLimit);
    if (limitError) {
        return res.json({
            status: 0,
            message: limitError
        });
    }
    const limit = requestedLimit;

    const category = getCategory(categoryId);
    if (!category) {
        return res.json({
            status: 0,
            message: `Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${categories.map(c => c.id).join(', ')}`
        });
    }

    const metadata = loadMetadata(categoryId);
    if (!metadata || metadata.total_articles === 0) {
        return res.json({
            status: 0,
            message: 'Chưa có dữ liệu. Crawler có thể chưa chạy lần nào.'
        });
    }

    const result = getPaginatedItems(categoryId, metadata, page, limit);
    return res.json({
        status: 1,
        data: result.data,
        pagination: result.pagination
    });
});

/**
 * GET /api/news/search
 * Query params:
 *   - category:     ID danh mục (default first in config)
 *   - link:         tìm bài viết có link chứa chuỗi này
 *   - published_at: tìm bài viết có published_at chứa chuỗi này
 *   - day/month/year: lọc theo ngày, tháng, năm phát hành
 *   - page:         page number (default 1)
 *   - limit:        items per page (default 20, max 100)
 */
app.get('/api/news/search', (req, res) => {
    const categoryId = req.query.category || categories[0].id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const requestedLimit = parseInt(req.query.limit) || 20;

    const limitError = validateLimit(requestedLimit);
    if (limitError) {
        return res.json({
            status: 0,
            message: limitError
        });
    }
    const limit = requestedLimit;

    const category = getCategory(categoryId);
    if (!category) {
        return res.json({
            status: 0,
            message: `Danh mục "${categoryId}" không tồn tại. Các danh mục hiện có: ${categories.map(c => c.id).join(', ')}`
        });
    }

    const filters = {
        link: req.query.link,
        published_at: req.query.published_at,
        day: parseDateFilter(req.query.day),
        month: parseDateFilter(req.query.month),
        year: parseDateFilter(req.query.year),
    };

    const hasFilter = filters.link || filters.published_at || filters.day || filters.month || filters.year;
    if (!hasFilter) {
        return res.json({
            status: 0,
            message: 'Vui lòng truyền ít nhất một điều kiện search: link, published_at, day, month hoặc year.'
        });
    }

    const metadata = loadMetadata(categoryId);
    if (!metadata || metadata.total_articles === 0) {
        return res.json({
            status: 0,
            message: 'Chưa có dữ liệu. Crawler có thể chưa chạy lần nào.'
        });
    }

    const result = searchItems(categoryId, metadata, filters, page, limit);
    return res.json({
        status: 1,
        data: result.data,
        pagination: result.pagination
    });
});

/**
 * GET /api/ping
 * Returns basic server health and runtime information.
 */
app.get('/api/ping', (req, res) => {
    return res.json({
        status: 1,
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
    });
});

/**
 * GET /api/categories
 * Returns list of categories. Always status = 1.
 */
app.get('/api/categories', (req, res) => {
    const result = categories.map(c => ({ id: c.id, name: c.name }));
    return res.json({ status: 1, data: result });
});

app.listen(port, () => {
    console.log(`\nAPI Server đang chạy tại http://localhost:${port}`);
});
