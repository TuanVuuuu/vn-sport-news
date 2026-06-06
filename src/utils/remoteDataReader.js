const axios = require('axios');
const dataRepo = require('../config/dataRepo');

const CACHE_TTL_MS = parseInt(process.env.DATA_CACHE_TTL_MS, 10) || 5 * 60 * 1000;
const cache = new Map();

function getRawUrl(relativePath) {
    const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
    return `${dataRepo.rawBaseUrl}/${normalizedPath}`;
}

/**
 * Fetch và cache JSON từ GitHub Raw.
 * @param {string} relativePath - Đường dẫn trong repo data, vd: sports/chunks/chunk_1.json
 * @returns {Promise<any|null>}
 */
async function fetchJson(relativePath) {
    const cached = cache.get(relativePath);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const response = await axios.get(getRawUrl(relativePath), {
            timeout: 15000,
            responseType: 'json',
        });
        cache.set(relativePath, { data: response.data, at: Date.now() });
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            return null;
        }
        throw error;
    }
}

function clearCache() {
    cache.clear();
}

module.exports = {
    getRawUrl,
    fetchJson,
    clearCache,
    CACHE_TTL_MS,
};
