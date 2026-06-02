const fs = require('fs');
const path = require('path');
const { defaultSearchSuggestions } = require('../config/searchSuggestions');

const SUGGESTIONS_FILE = path.join(__dirname, '../../data/search_suggestions.json');

const PARENT_NAV_EXCLUDED = new Set([
    'lịch thi đấu',
    'hậu trường',
    'ảnh',
    'video',
    'các môn khác',
    'esportsfan',
]);

const SUBFOLDER_NAV_EXCLUDED = new Set([
    'các giải khác',
    'vnexpress marathon',
]);

function normalizeKeyword(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeLink(href) {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `https://vnexpress.net${href}`;
    return `https://vnexpress.net/${href}`;
}

function isExternalLink(href) {
    const normalized = normalizeLink(href);
    return !normalized.startsWith('https://vnexpress.net/');
}

/**
 * Đọc dữ liệu gợi ý đã crawl từ file.
 * @returns {{ source_url: string|null, last_updated: string|null, keywords: Array }}
 */
function loadSearchSuggestions() {
    if (!fs.existsSync(SUGGESTIONS_FILE)) {
        return { source_url: null, last_updated: null, keywords: [] };
    }

    try {
        const data = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
        return {
            source_url: data.source_url || null,
            last_updated: data.last_updated || null,
            keywords: Array.isArray(data.keywords) ? data.keywords : [],
        };
    } catch (e) {
        return { source_url: null, last_updated: null, keywords: [] };
    }
}

/**
 * Lưu kết quả crawl vào file JSON.
 * @param {{ source_url: string, keywords: Array }} payload
 */
function saveSearchSuggestions(payload) {
    const dir = path.dirname(SUGGESTIONS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
        source_url: payload.source_url,
        last_updated: new Date().toISOString(),
        keywords: payload.keywords,
    };

    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return data;
}

/**
 * Lấy danh sách fallback từ config.
 * @returns {Array<{ keyword: string, source: string }>}
 */
function getDefaultSuggestions() {
    return defaultSearchSuggestions
        .filter(item => item.enabled)
        .sort((a, b) => a.order - b.order)
        .map(item => ({
            keyword: item.keyword,
            source: 'default',
        }));
}

/**
 * Gộp keyword crawl + fallback, dedupe theo keyword đã chuẩn hóa.
 * @param {number} limit
 * @returns {{ data: Array, meta: object }}
 */
function getSearchSuggestionsForApi(limit) {
    const crawled = loadSearchSuggestions();
    const seen = new Set();
    const data = [];

    for (const item of crawled.keywords) {
        if (data.length >= limit) break;

        const key = normalizeKeyword(item.keyword);
        if (!key || seen.has(key)) continue;

        seen.add(key);
        data.push({
            keyword: item.keyword,
            link: item.link || null,
            source: 'crawler',
        });
    }

    for (const item of getDefaultSuggestions()) {
        if (data.length >= limit) break;

        const key = normalizeKeyword(item.keyword);
        if (seen.has(key)) continue;

        seen.add(key);
        data.push(item);
    }

    return {
        data,
        meta: {
            source_url: crawled.source_url,
            last_updated: crawled.last_updated,
        },
    };
}

module.exports = {
    PARENT_NAV_EXCLUDED,
    SUBFOLDER_NAV_EXCLUDED,
    normalizeKeyword,
    normalizeLink,
    isExternalLink,
    loadSearchSuggestions,
    saveSearchSuggestions,
    getSearchSuggestionsForApi,
};
