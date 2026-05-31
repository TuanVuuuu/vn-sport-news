const xml2js = require('xml2js');

// Hàm làm sạch HTML
function cleanHTML(html) {
    if (!html) return '';
    let text = html.replace(/<[^>]*>?/gm, '');
    return text.trim();
}

// Hàm trích xuất ảnh
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

// Hàm chính để parse chuỗi XML
function parseRSS(xmlData) {
    return new Promise((resolve, reject) => {
        // Xóa phần text thừa trước thẻ XML đầu tiên nếu có
        const xmlStartIndex = xmlData.indexOf('<');
        let cleanData = xmlStartIndex !== -1 ? xmlData.substring(xmlStartIndex) : xmlData;
        
        // Fix lỗi file RSS chứa ký tự & không hợp lệ trong url của thẻ enclosure
        cleanData = cleanData.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
        
        xml2js.parseString(cleanData, (parseErr, result) => {
            if (parseErr) {
                return reject(parseErr);
            }
            
            try {
                const channel = result.rss.channel[0];
                const items = channel.item || [];
                
                const channelInfo = {
                    title: channel.title ? channel.title[0] : '',
                    description: channel.description ? channel.description[0] : '',
                    logo_url: channel.image && channel.image[0] && channel.image[0].url ? channel.image[0].url[0] : '',
                    link: channel.link ? channel.link[0] : '',
                    last_updated: channel.pubDate ? channel.pubDate[0] : ''
                };
                
                const parsedItems = items.map(item => {
                    const rawDescription = item.description ? item.description[0] : '';
                    
                    return {
                        id: item.guid ? item.guid[0] : (item.link ? item.link[0] : ''),
                        title: item.title ? item.title[0] : '',
                        description: cleanHTML(rawDescription),
                        thumbnail_url: extractImage(item),
                        link: item.link ? item.link[0] : '',
                        published_at: item.pubDate ? item.pubDate[0] : ''
                    };
                });
                
                resolve({
                    channel: channelInfo,
                    items: parsedItems
                });
            } catch (e) {
                reject(e);
            }
        });
    });
}

module.exports = {
    parseRSS
};
