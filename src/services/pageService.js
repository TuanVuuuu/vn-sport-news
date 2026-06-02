const axios = require('axios');

/**
 * Tải nội dung HTML từ một URL trang web.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchPage(url) {
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SportNewsCrawler/1.0)',
        },
        timeout: 15000,
    });
    return response.data;
}

module.exports = { fetchPage };
