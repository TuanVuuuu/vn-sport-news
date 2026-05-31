const axios = require('axios');

/**
 * Tải nội dung XML từ một URL RSS.
 * @param {string} url - Đường dẫn RSS feed.
 * @returns {Promise<string>} - Chuỗi XML thô.
 */
async function fetchRSS(url) {
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SportNewsCrawler/1.0)',
        },
        timeout: 15000,
    });
    return response.data;
}

module.exports = { fetchRSS };
