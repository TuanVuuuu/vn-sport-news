const xml2js = require('xml2js');

/**
 * Làm sạch chuỗi HTML, loại bỏ các thẻ tag và trả về text thuần.
 * @param {string} html
 * @returns {string}
 */
function cleanHTML(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Trích xuất URL ảnh thumbnail từ một item RSS.
 * Ưu tiên thẻ <enclosure>, fallback sang thẻ <img> trong description.
 * @param {object} item - Một item RSS đã được xml2js parse.
 * @returns {string|null}
 */
function extractImage(item) {
    if (item.enclosure && item.enclosure[0] && item.enclosure[0].$) {
        if (item.enclosure[0].$.url) {
            return item.enclosure[0].$.url;
        }
    }
    const desc = item.description ? item.description[0] : '';
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    const match = imgRegex.exec(desc);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

/**
 * Chuyển pubDate của RSS sang ISO string để mobile dễ parse và hiển thị.
 * @param {string} publishedAt
 * @returns {string}
 */
function toCreateAt(publishedAt) {
    const date = new Date(publishedAt);
    return Number.isNaN(date.getTime()) ? publishedAt : date.toISOString();
}

/**
 * Parse một chuỗi XML RSS thành object JavaScript chuẩn hóa.
 * @param {string} xmlData - Chuỗi XML thô từ RSS feed.
 * @param {{ id?: string, name?: string }} category - Thông tin danh mục của RSS feed.
 * @returns {Promise<{channel: object, items: Array}>}
 */
function parseRSS(xmlData, category = {}) {
    return new Promise((resolve, reject) => {
        // Loại bỏ ký tự rác trước thẻ XML đầu tiên
        const xmlStartIndex = xmlData.indexOf('<');
        let cleanData = xmlStartIndex !== -1 ? xmlData.substring(xmlStartIndex) : xmlData;

        // Escape ký tự & không hợp lệ trong XML (thường gặp trong URL của enclosure)
        cleanData = cleanData.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');

        xml2js.parseString(cleanData, (parseErr, result) => {
            if (parseErr) return reject(parseErr);

            try {
                const channel = result.rss.channel[0];
                const items = channel.item || [];

                const channelInfo = {
                    title: channel.title ? channel.title[0] : '',
                    description: channel.description ? channel.description[0] : '',
                    logo_url: channel.image && channel.image[0] && channel.image[0].url
                        ? channel.image[0].url[0] : '',
                    link: channel.link ? channel.link[0] : '',
                    last_updated: channel.pubDate ? channel.pubDate[0] : '',
                };

                const parsedItems = items.map(item => {
                    const publishedAt = item.pubDate ? item.pubDate[0] : '';

                    return {
                        id: item.guid ? item.guid[0] : (item.link ? item.link[0] : ''),
                        category_id: category.id || '',
                        category_name: category.name || '',
                        source: channelInfo.description,
                        title: item.title ? item.title[0] : '',
                        description: cleanHTML(item.description ? item.description[0] : ''),
                        thumbnail_url: extractImage(item),
                        link: item.link ? item.link[0] : '',
                        published_at: publishedAt,
                        createAt: toCreateAt(publishedAt),
                    };
                });

                resolve({ channel: channelInfo, items: parsedItems });
            } catch (e) {
                reject(e);
            }
        });
    });
}

module.exports = { parseRSS };
