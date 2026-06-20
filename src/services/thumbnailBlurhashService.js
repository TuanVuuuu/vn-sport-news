const https = require('https');
const axios = require('axios');
const sharp = require('sharp');
const { encode } = require('blurhash');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.BLURHASH_IMAGE_TIMEOUT_MS, 10) || 8000;
const DEFAULT_CONCURRENCY = Math.max(1, parseInt(process.env.BLURHASH_CONCURRENCY, 10) || 6);
const BLURHASH_DEBUG = process.env.BLURHASH_DEBUG === 'true';

const DEFAULT_TARGET_WIDTH = Math.max(1, parseInt(process.env.BLURHASH_TARGET_WIDTH, 10) || 32);
const DEFAULT_TARGET_HEIGHT = Math.max(1, parseInt(process.env.BLURHASH_TARGET_HEIGHT, 10) || 18);

const DEFAULT_COMPONENT_X = Math.min(9, Math.max(1, parseInt(process.env.BLURHASH_COMPONENT_X, 10) || 4));
const DEFAULT_COMPONENT_Y = Math.min(9, Math.max(1, parseInt(process.env.BLURHASH_COMPONENT_Y, 10) || 3));

const IPV4_HTTPS_AGENT = new https.Agent({ family: 4, keepAlive: true });

const CDN_FETCH_RULES = [
    {
        match: /vnecdn\.net/i,
        referer: 'https://vnexpress.net/',
        origin: 'https://vnexpress.net',
    },
    {
        match: /thethao247\.vn/i,
        referer: 'https://thethao247.vn/',
        origin: 'https://thethao247.vn',
    },
];

function isHttpUrl(value) {
    if (!value) return false;
    return /^https?:\/\//i.test(String(value).trim());
}

function debugLog(...args) {
    if (BLURHASH_DEBUG) {
        console.log('[blurhash]', ...args);
    }
}

function getBrowserHeaders(extra = {}) {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.6',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        ...extra,
    };
}

function buildFetchAttempts(host, pageReferer = null) {
    const attempts = [{ headers: getBrowserHeaders() }];

    for (const rule of CDN_FETCH_RULES) {
        if (!rule.match.test(host)) continue;
        attempts.push({
            headers: getBrowserHeaders({
                Referer: rule.referer,
                Origin: rule.origin,
                'Sec-Fetch-Site': 'same-site',
            }),
        });
    }

    if (pageReferer && isHttpUrl(pageReferer)) {
        let pageOrigin = '';
        try {
            pageOrigin = new URL(pageReferer).origin;
        } catch {
            pageOrigin = '';
        }

        attempts.push({
            headers: getBrowserHeaders({
                Referer: pageReferer,
                ...(pageOrigin ? { Origin: pageOrigin, 'Sec-Fetch-Site': 'same-origin' } : {}),
            }),
        });
    }

    return attempts;
}

function buildThumbnailUrlCandidates(url) {
    const normalizedUrl = String(url || '').trim();
    const candidates = [normalizedUrl];
    const seen = new Set(candidates);

    function add(candidate) {
        if (!candidate || seen.has(candidate)) return;
        seen.add(candidate);
        candidates.push(candidate);
    }

    if (/cdn-img\.thethao247\.vn/i.test(normalizedUrl)) {
        add(normalizedUrl.replace(/resize_\d+x\d+/i, 'resize_180x115'));
        add(normalizedUrl.replace(/resize_\d+x\d+\//i, ''));
    }

    return candidates;
}

function isLikelyImageBuffer(buffer) {
    if (!buffer?.length) return false;
    if (buffer[0] === 0x3c) return false; // HTML
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return true; // JPEG
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return true; // PNG
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return true; // WEBP
    if (buffer.slice(0, 3).toString('ascii') === 'GIF') return true; // GIF
    return buffer.length > 256;
}

async function requestImageBuffer(url, headers, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers,
        httpsAgent: IPV4_HTTPS_AGENT,
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 300,
    });

    return Buffer.from(response.data);
}

async function fetchImageBufferDirect(url, { timeoutMs = DEFAULT_TIMEOUT_MS, pageReferer = null } = {}) {
    const normalizedUrl = String(url || '').trim();
    const host = (() => {
        try {
            return new URL(normalizedUrl).host;
        } catch {
            return '';
        }
    })();

    const attempts = buildFetchAttempts(host, pageReferer);
    let lastError = null;

    for (const attempt of attempts) {
        try {
            const buffer = await requestImageBuffer(normalizedUrl, attempt.headers, { timeoutMs });
            if (isLikelyImageBuffer(buffer)) {
                return buffer;
            }
            lastError = new Error('response_not_image');
        } catch (error) {
            lastError = error;
            debugLog('direct fetch failed', normalizedUrl, error.response?.status || error.message);
        }
    }

    throw lastError || new Error('fetch_image_failed');
}

async function fetchImageBufferViaProxy(url, { timeoutMs = DEFAULT_TIMEOUT_MS, pageReferer = null } = {}) {
    const proxyUrl = process.env.BLURHASH_FETCH_PROXY_URL;
    const secret = process.env.INTERNAL_FETCH_SECRET;
    if (!proxyUrl || !secret) {
        throw new Error('proxy_not_configured');
    }

    const response = await axios.get(proxyUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs + 5000,
        params: {
            url,
            ...(pageReferer ? { referer: pageReferer } : {}),
        },
        headers: {
            'X-Internal-Fetch-Secret': secret,
        },
        validateStatus: status => status >= 200 && status < 300,
    });

    const buffer = Buffer.from(response.data);
    if (!isLikelyImageBuffer(buffer)) {
        throw new Error('proxy_response_not_image');
    }

    return buffer;
}

async function fetchImageBuffer(url, options = {}) {
    const urlCandidates = buildThumbnailUrlCandidates(url);
    let lastError = null;

    for (const candidateUrl of urlCandidates) {
        try {
            return await fetchImageBufferDirect(candidateUrl, options);
        } catch (error) {
            lastError = error;
        }
    }

    if (process.env.BLURHASH_FETCH_PROXY_URL) {
        for (const candidateUrl of urlCandidates) {
            try {
                debugLog('try proxy', candidateUrl);
                return await fetchImageBufferViaProxy(candidateUrl, options);
            } catch (error) {
                lastError = error;
                debugLog('proxy fetch failed', candidateUrl, error.response?.status || error.message);
            }
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
        debugLog('compute failed', url, error.message);
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

        const cacheKey = `${url}|${item.link || ''}`;
        if (urlCache.has(cacheKey)) {
            items[idx] = { ...item, thumbnail_blurhash: urlCache.get(cacheKey) };
            return;
        }

        const hash = await computeBlurhashFromUrl(url, { pageReferer: item.link || null });
        urlCache.set(cacheKey, hash);
        items[idx] = { ...item, thumbnail_blurhash: hash };
    }));

    await Promise.allSettled(tasks);
    return items;
}

module.exports = {
    isHttpUrl,
    isLikelyImageBuffer,
    buildThumbnailUrlCandidates,
    fetchImageBuffer,
    fetchImageBufferDirect,
    computeBlurhashFromUrl,
    attachThumbnailBlurhash,
};
