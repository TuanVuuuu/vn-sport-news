const axios = require('axios');
const sharp = require('sharp');
const { encode } = require('blurhash');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.BLURHASH_IMAGE_TIMEOUT_MS, 10) || 8000;
const DEFAULT_CONCURRENCY = Math.max(1, parseInt(process.env.BLURHASH_CONCURRENCY, 10) || 6);

const DEFAULT_TARGET_WIDTH = Math.max(1, parseInt(process.env.BLURHASH_TARGET_WIDTH, 10) || 32);
const DEFAULT_TARGET_HEIGHT = Math.max(1, parseInt(process.env.BLURHASH_TARGET_HEIGHT, 10) || 18);

const DEFAULT_COMPONENT_X = Math.min(9, Math.max(1, parseInt(process.env.BLURHASH_COMPONENT_X, 10) || 4));
const DEFAULT_COMPONENT_Y = Math.min(9, Math.max(1, parseInt(process.env.BLURHASH_COMPONENT_Y, 10) || 3));

function isHttpUrl(value) {
    if (!value) return false;
    return /^https?:\/\//i.test(String(value).trim());
}

async function fetchImageBuffer(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const normalizedUrl = String(url || '').trim();
    const host = (() => {
        try {
            return new URL(normalizedUrl).host;
        } catch {
            return '';
        }
    })();

    const baseHeaders = {
        // Một số CDN chặn UA kiểu "crawler/bot". Dùng UA trình duyệt phổ biến để tải thumbnail ổn định.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.6',
    };

    const attempts = [
        { headers: baseHeaders },
        ...(host.includes('vnecdn.net')
            ? [{
                headers: {
                    ...baseHeaders,
                    Referer: 'https://vnexpress.net/',
                    Origin: 'https://vnexpress.net',
                },
            }]
            : []),
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            const response = await axios.get(normalizedUrl, {
                responseType: 'arraybuffer',
                timeout: timeoutMs,
                headers: attempt.headers,
                validateStatus: status => status >= 200 && status < 300,
            });
            return Buffer.from(response.data);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('fetch_image_failed');
}

async function computeBlurhashFromImageBuffer(buffer, {
    targetWidth = DEFAULT_TARGET_WIDTH,
    targetHeight = DEFAULT_TARGET_HEIGHT,
    componentX = DEFAULT_COMPONENT_X,
    componentY = DEFAULT_COMPONENT_Y,
} = {}) {
    const { data, info } = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize(targetWidth, targetHeight, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    if (!info?.width || !info?.height || !data?.length) {
        return null;
    }

    return encode(new Uint8ClampedArray(data), info.width, info.height, componentX, componentY);
}

async function computeBlurhashFromUrl(url, options = {}) {
    if (!isHttpUrl(url)) return null;

    try {
        const buffer = await fetchImageBuffer(url, options);
        return await computeBlurhashFromImageBuffer(buffer, options);
    } catch (error) {
        return null;
    }
}

function createLimiter(concurrency) {
    let active = 0;
    const queue = [];

    const next = () => {
        if (active >= concurrency) return;
        const item = queue.shift();
        if (!item) return;
        active += 1;
        item()
            .catch(() => {})
            .finally(() => {
                active -= 1;
                next();
            });
    };

    return function limit(fn) {
        return new Promise((resolve, reject) => {
            queue.push(async () => {
                try {
                    resolve(await fn());
                } catch (err) {
                    reject(err);
                }
            });
            next();
        });
    };
}

/**
 * Gắn `thumbnail_blurhash` vào danh sách bài viết.
 * - Chỉ xử lý item thiếu field hoặc field rỗng.
 * - Mọi lỗi khi tải/parse ảnh sẽ trả null và không throw.
 *
 * @param {Array<object>} items
 * @param {{ concurrency?: number }} options
 * @returns {Promise<Array<object>>}
 */
async function attachThumbnailBlurhash(items, {
    concurrency = DEFAULT_CONCURRENCY,
} = {}) {
    if (!Array.isArray(items) || items.length === 0) return Array.isArray(items) ? items : [];

    const limit = createLimiter(Math.max(1, concurrency));
    const urlCache = new Map();

    const tasks = items.map((item, idx) => limit(async () => {
        if (!item || typeof item !== 'object') return;
        if (item.thumbnail_blurhash) return;

        const url = item.thumbnail_url;
        if (!isHttpUrl(url)) {
            items[idx] = { ...item, thumbnail_blurhash: null };
            return;
        }

        if (urlCache.has(url)) {
            items[idx] = { ...item, thumbnail_blurhash: urlCache.get(url) };
            return;
        }

        const hash = await computeBlurhashFromUrl(url);
        urlCache.set(url, hash);
        items[idx] = { ...item, thumbnail_blurhash: hash };
    }));

    await Promise.allSettled(tasks);
    return items;
}

module.exports = {
    isHttpUrl,
    computeBlurhashFromUrl,
    attachThumbnailBlurhash,
};

