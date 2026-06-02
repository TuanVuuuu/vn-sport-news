/**
 * Từ khóa gợi ý fallback khi crawler chưa chạy hoặc không lấy được dữ liệu.
 * Chỉnh sửa trực tiếp file này khi muốn thêm/bớt gợi ý thủ công.
 *
 * - keyword: Text hiển thị trên UI
 * - order:   Thứ tự ưu tiên (số nhỏ = hiển thị trước)
 * - enabled: false để tạm ẩn mà không xóa
 */
const defaultSearchSuggestions = [
    { keyword: 'v-league', order: 1, enabled: true },
    { keyword: 'world cup 2026', order: 2, enabled: true },
    { keyword: 'chuyển nhượng', order: 3, enabled: true },
    { keyword: 'trump', order: 4, enabled: true },
];

/**
 * Nguồn crawl từ khóa gợi ý trên VnExpress.
 */
const searchSuggestionSources = [
    {
        id: 'sports',
        name: 'Thể thao',
        url: 'https://vnexpress.net/the-thao',
        // 'all' = tìm trong mọi danh mục, hoặc chỉ định id như 'sports', 'featured'
        validateCategory: 'all',
    },
];

module.exports = {
    defaultSearchSuggestions,
    searchSuggestionSources,
};
