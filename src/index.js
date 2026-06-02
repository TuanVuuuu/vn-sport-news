const categories = require('./config/categories');
const { fetchRSS } = require('./services/rssService');
const { parseRSS } = require('./services/parseService');
const { crawlSearchSuggestions } = require('./services/keywordCrawlerService');
const {
    ensureDirs,
    loadMetadata,
    saveMetadata,
    loadExistingIds,
    appendItems,
} = require('./utils/fileHelper');

/**
 * Chạy crawler cho một danh mục cụ thể.
 * @param {{ id: string, name: string, rssUrl: string }} category
 */
async function crawlCategory(category) {
    const { id, name, rssUrl } = category;
    console.log(`\n[${name}] Đang xử lý danh mục "${name}" (${rssUrl})`);

    ensureDirs(id);

    const xmlData = await fetchRSS(rssUrl);
    const { items: newItems, channel: channelInfo } = await parseRSS(xmlData, category);

    const metadata = loadMetadata(id);
    metadata.channel = channelInfo;

    const existingIds = loadExistingIds(id, metadata);
    let itemsToAdd = newItems.filter(item => !existingIds.has(item.id));

    if (itemsToAdd.length === 0) {
        console.log(`[${name}] Không có bài viết mới nào. Bỏ qua.`);
        return;
    }

    // Sắp xếp tăng dần (cũ -> mới) trước khi Append
    itemsToAdd.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));

    appendItems(id, metadata, itemsToAdd);

    metadata.last_updated = new Date().toISOString();
    saveMetadata(id, metadata);

    console.log(`[${name}] Đã thêm ${itemsToAdd.length} bài mới. Tổng: ${metadata.total_articles} bài trong ${metadata.files.length} chunks.`);
}

/**
 * Điểm khởi chạy chính: Duyệt qua tất cả danh mục và crawl.
 */
async function main() {
    console.log(`\n======================================`);
    console.log(`[${new Date().toISOString()}] Bắt đầu tiến trình Crawler`);
    console.log(`Số danh mục: ${categories.length}`);
    console.log(`======================================`);

    for (const category of categories) {
        try {
            await crawlCategory(category);
        } catch (err) {
            console.error(`[LỖI] Danh mục "${category.name}":`, err.message);
        }
    }

    try {
        await crawlSearchSuggestions();
    } catch (err) {
        console.error('[LỖI] Crawl từ khóa gợi ý:', err.message);
    }

    console.log(`\n[${new Date().toISOString()}] Crawler hoàn tất tất cả danh mục.`);
}

main().catch(err => {
    console.error('Lỗi nghiêm trọng:', err);
    process.exit(1);
});
