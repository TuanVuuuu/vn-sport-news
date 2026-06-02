const xml2js = require('xml2js');
const { getRssProvider } = require('../config/rssProviders');
const {
    resolveSource,
    resolveThumbnail,
    resolveChannelInfo,
    toText,
} = require('./rssFieldResolver');

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
 * @param {{ id?: string, name?: string, provider?: string }} category - Thông tin danh mục.
 * @returns {Promise<{channel: object, items: Array}>}
 */
function parseRSS(xmlData, category = {}) {
    const provider = getRssProvider(category.provider);

    return new Promise((resolve, reject) => {
        const xmlStartIndex = xmlData.indexOf('<');
        let cleanData = xmlStartIndex !== -1 ? xmlData.substring(xmlStartIndex) : xmlData;
        cleanData = cleanData.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');

        xml2js.parseString(cleanData, (parseErr, result) => {
            if (parseErr) return reject(parseErr);

            try {
                const channel = result.rss.channel[0];
                const items = channel.item || [];
                const channelInfo = resolveChannelInfo(channel);

                const parsedItems = items.map(item => {
                    const publishedAt = toText(item.pubDate);

                    return {
                        id: toText(item.guid) || toText(item.link),
                        category_id: category.id || '',
                        category_name: category.name || '',
                        source: resolveSource(provider, channel, item),
                        title: toText(item.title),
                        description: cleanHTML(toText(item.description)),
                        thumbnail_url: resolveThumbnail(item, provider.thumbnail),
                        link: toText(item.link),
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
