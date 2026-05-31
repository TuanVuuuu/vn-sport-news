const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 100;
const BASE_DATA_DIR = path.join(__dirname, '../../data');
const MONTHS = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12,
};

/**
 * Lấy đường dẫn tới thư mục meta và chunks của một danh mục.
 * @param {string} categoryId - ID của danh mục (ví dụ: 'sports').
 * @returns {{ metaDir: string, chunksDir: string }}
 */
function getCategoryDirs(categoryId) {
    const categoryDir = path.join(BASE_DATA_DIR, categoryId);
    return {
        metaDir: path.join(categoryDir, 'meta'),
        chunksDir: path.join(categoryDir, 'chunks'),
    };
}

/**
 * Đảm bảo thư mục lưu trữ của danh mục tồn tại.
 * @param {string} categoryId
 */
function ensureDirs(categoryId) {
    const { metaDir, chunksDir } = getCategoryDirs(categoryId);
    if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
    if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });
}

/**
 * Đọc file metadata của một danh mục.
 * @param {string} categoryId
 * @returns {object}
 */
function loadMetadata(categoryId) {
    const { metaDir } = getCategoryDirs(categoryId);
    const metaPath = path.join(metaDir, 'metadata.json');
    if (fs.existsSync(metaPath)) {
        try {
            return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch (e) {}
    }
    return { total_articles: 0, files: [], channel: null };
}

/**
 * Lưu metadata của một danh mục.
 * @param {string} categoryId
 * @param {object} metadata
 */
function saveMetadata(categoryId, metadata) {
    const { metaDir } = getCategoryDirs(categoryId);
    fs.writeFileSync(
        path.join(metaDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf8'
    );
}

/**
 * Chuẩn hóa thời gian phát hành thành ISO string cho client mobile.
 * @param {object} item
 * @returns {string}
 */
function getCreateAt(item) {
    if (item.createAt) return item.createAt;

    const date = new Date(item.published_at);
    return Number.isNaN(date.getTime()) ? (item.published_at || '') : date.toISOString();
}

/**
 * Parse ngày phát hành từ RSS pubDate hoặc createAt để filter theo ngày/tháng/năm.
 * Ưu tiên pubDate gốc để giữ đúng ngày theo timezone của nguồn tin.
 * @param {object} item
 * @returns {{ day: number|null, month: number|null, year: number|null }}
 */
function getPublishedDateParts(item) {
    const publishedAt = item.published_at || '';
    const rfcMatch = publishedAt.match(/^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
    if (rfcMatch) {
        return {
            day: parseInt(rfcMatch[1], 10),
            month: MONTHS[rfcMatch[2]] || null,
            year: parseInt(rfcMatch[3], 10),
        };
    }

    const date = new Date(item.createAt || publishedAt);
    if (Number.isNaN(date.getTime())) {
        return { day: null, month: null, year: null };
    }

    return {
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
    };
}

/**
 * Format article response để luôn có createAt.
 * @param {object} item
 * @returns {object}
 */
function formatArticle(item) {
    return {
        ...item,
        createAt: getCreateAt(item),
    };
}

/**
 * Đọc tập hợp (Set) các ID bài viết đã có của một danh mục để lọc trùng lặp.
 * @param {string} categoryId
 * @param {object} metadata
 * @returns {Set<string>}
 */
function loadExistingIds(categoryId, metadata) {
    const { chunksDir } = getCategoryDirs(categoryId);
    const existingIds = new Set();
    for (const file of metadata.files) {
        const filePath = path.join(chunksDir, file);
        if (fs.existsSync(filePath)) {
            try {
                const chunkData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                for (const item of chunkData) existingIds.add(item.id);
            } catch (e) {}
        }
    }
    return existingIds;
}

/**
 * Ghi nối tiếp (Append-Only) các bài viết mới vào chunk.
 * Chỉ file chunk đang hoạt động bị ghi đè, không chỉnh sửa file cũ.
 * @param {string} categoryId
 * @param {object} metadata
 * @param {Array} itemsToAdd - Danh sách bài viết mới (đã sort tăng dần theo ngày).
 */
function appendItems(categoryId, metadata, itemsToAdd) {
    const { chunksDir } = getCategoryDirs(categoryId);

    let activeChunkFile = metadata.files.length > 0
        ? metadata.files[metadata.files.length - 1]
        : null;
    let activeChunkData = [];
    let activeChunkIndex = metadata.files.length;

    if (activeChunkFile) {
        const filePath = path.join(chunksDir, activeChunkFile);
        if (fs.existsSync(filePath)) {
            activeChunkData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } else {
        activeChunkFile = `chunk_1.json`;
        metadata.files.push(activeChunkFile);
        activeChunkIndex = 1;
    }

    let currentChunkModified = false;

    for (const item of itemsToAdd) {
        // Đóng băng chunk nếu đã đầy, tạo chunk mới
        if (activeChunkData.length >= CHUNK_SIZE) {
            fs.writeFileSync(path.join(chunksDir, activeChunkFile), JSON.stringify(activeChunkData, null, 2), 'utf8');
            activeChunkIndex++;
            activeChunkFile = `chunk_${activeChunkIndex}.json`;
            metadata.files.push(activeChunkFile);
            activeChunkData = [];
            currentChunkModified = false;
        }
        activeChunkData.push(item);
        metadata.total_articles++;
        currentChunkModified = true;
    }

    // Ghi chunk cuối cùng
    if (currentChunkModified) {
        fs.writeFileSync(path.join(chunksDir, activeChunkFile), JSON.stringify(activeChunkData, null, 2), 'utf8');
    }
}

/**
 * Đọc dữ liệu phân trang từ các file chunk của một danh mục.
 * Thuật toán ánh xạ trực tiếp page/limit vào đúng chunk cần đọc (O(1) file reads).
 * @param {string} categoryId
 * @param {object} metadata
 * @param {number} page
 * @param {number} limit
 * @returns {{ data: Array, pagination: object }}
 */
function getPaginatedItems(categoryId, metadata, page, limit) {
    const { chunksDir } = getCategoryDirs(categoryId);
    const totalItems = metadata.total_articles;
    const totalPages = Math.ceil(totalItems / limit);

    const startIndex = (page - 1) * limit;
    let endIndex = page * limit - 1;

    if (startIndex >= totalItems) {
        return {
            data: [],
            pagination: { current_page: page, total_pages: totalPages, total_items: totalItems, has_next: false },
        };
    }
    if (endIndex >= totalItems) endIndex = totalItems - 1;

    // Quy đổi index ảo (mới = 0) sang index vật lý (cũ = 0) của Append-Only storage
    const fileStartIdx = totalItems - 1 - endIndex;
    const fileEndIdx = totalItems - 1 - startIndex;

    const startChunk = Math.floor(fileStartIdx / CHUNK_SIZE);
    const endChunk = Math.floor(fileEndIdx / CHUNK_SIZE);

    // Chỉ đọc đúng 1-2 file chunk cần thiết
    let collectedItems = [];
    for (let i = startChunk; i <= endChunk; i++) {
        if (i >= 0 && i < metadata.files.length) {
            const filePath = path.join(chunksDir, metadata.files[i]);
            if (fs.existsSync(filePath)) {
                const chunkData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                collectedItems = collectedItems.concat(chunkData);
            }
        }
    }

    const offset = startChunk * CHUNK_SIZE;
    let finalData = collectedItems.slice(fileStartIdx - offset, fileEndIdx - offset + 1);
    finalData.reverse(); // Bài mới nhất lên đầu
    finalData = finalData.map(formatArticle);

    return {
        data: finalData,
        pagination: {
            current_page: page,
            total_pages: totalPages,
            total_items: totalItems,
            has_next: page < totalPages,
        },
    };
}

/**
 * Đọc toàn bộ bài viết của một danh mục từ các file chunk.
 * @param {string} categoryId
 * @param {object} metadata
 * @returns {Array}
 */
function loadAllItems(categoryId, metadata) {
    const { chunksDir } = getCategoryDirs(categoryId);
    let items = [];

    for (const file of metadata.files) {
        const filePath = path.join(chunksDir, file);
        if (fs.existsSync(filePath)) {
            try {
                const chunkData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                items = items.concat(chunkData);
            } catch (e) {}
        }
    }

    return items;
}

/**
 * Search bài viết theo link hoặc ngày/tháng/năm phát hành.
 * @param {string} categoryId
 * @param {object} metadata
 * @param {{ link?: string, published_at?: string, day?: number, month?: number, year?: number }} filters
 * @param {number} page
 * @param {number} size
 * @returns {{ data: Array, pagination: object }}
 */
function searchItems(categoryId, metadata, filters, page, size) {
    const normalizedLink = filters.link ? filters.link.toLowerCase().trim() : '';
    const normalizedPublishedAt = filters.published_at ? filters.published_at.toLowerCase().trim() : '';

    const filteredItems = loadAllItems(categoryId, metadata)
        .filter(item => {
            if (normalizedLink && !(item.link || '').toLowerCase().includes(normalizedLink)) {
                return false;
            }

            if (normalizedPublishedAt && !(item.published_at || '').toLowerCase().includes(normalizedPublishedAt)) {
                return false;
            }

            const { day, month, year } = getPublishedDateParts(item);
            if (filters.day !== null && day !== filters.day) return false;
            if (filters.month !== null && month !== filters.month) return false;
            if (filters.year !== null && year !== filters.year) return false;

            return true;
        })
        .sort((a, b) => new Date(getCreateAt(b)) - new Date(getCreateAt(a)));

    const totalItems = filteredItems.length;
    const totalPages = Math.ceil(totalItems / size);
    const startIndex = page * size;
    const data = filteredItems.slice(startIndex, startIndex + size).map(formatArticle);

    return {
        data,
        pagination: {
            page,
            size,
            current_page: page,
            total_pages: totalPages,
            total_items: totalItems,
            has_next: page + 1 < totalPages,
        },
    };
}

module.exports = {
    CHUNK_SIZE,
    ensureDirs,
    loadMetadata,
    saveMetadata,
    loadExistingIds,
    appendItems,
    getPaginatedItems,
    searchItems,
};
