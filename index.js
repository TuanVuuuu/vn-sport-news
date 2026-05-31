const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseRSS } = require('./parser');

const RSS_URL = 'https://vnexpress.net/rss/the-thao.rss';
const DATA_FILE_PATH = path.join(__dirname, 'data', 'articles.json');

// Hàm tải và lưu dữ liệu
async function fetchAndSaveData() {
    try {
        console.log(`\n[${new Date().toISOString()}] Bắt đầu tiến trình Crawler...`);
        
        // 1. Tải RSS XML
        console.log(`- Đang tải dữ liệu từ ${RSS_URL}`);
        const response = await axios.get(RSS_URL);
        const xmlData = response.data;
        
        // 2. Parse XML sang JSON
        console.log(`- Đang parse dữ liệu XML...`);
        const parsedData = await parseRSS(xmlData);
        const newItems = parsedData.items;
        
        // 3. Đọc dữ liệu cũ
        let existingItems = [];
        if (fs.existsSync(DATA_FILE_PATH)) {
            const rawData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
            if (rawData.trim()) {
                try {
                    existingItems = JSON.parse(rawData);
                } catch(e) {
                    console.log('File dữ liệu cũ bị lỗi, bắt đầu lại với mảng rỗng.');
                }
            }
        }
        
        // 4. Hợp nhất dữ liệu (Chống trùng lặp theo ID/Link)
        const existingIds = new Set(existingItems.map(item => item.id));
        let addedCount = 0;
        
        for (const item of newItems) {
            if (!existingIds.has(item.id)) {
                existingItems.push(item);
                addedCount++;
            }
        }
        
        if (addedCount === 0) {
            console.log(`- Không có bài viết mới nào. Bỏ qua cập nhật.`);
            return; // Nếu không có gì mới thì không cần lưu
        }
        
        // Sắp xếp lại theo thời gian (mới nhất lên đầu)
        existingItems.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
        
        // 5. Ghi vào file
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(existingItems, null, 2), 'utf8');
        console.log(`- Đã lưu ${addedCount} bài viết mới. Tổng cộng: ${existingItems.length} bài.`);
        console.log(`[${new Date().toISOString()}] Crawler hoàn tất chu kỳ.`);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] LỖI TIẾN TRÌNH:`, error.message);
        process.exit(1); // Thoát với mã lỗi để GitHub Actions biết là thất bại
    }
}

fetchAndSaveData();
