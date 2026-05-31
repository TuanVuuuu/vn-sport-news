/**
 * Cấu hình các nguồn RSS theo danh mục.
 * Để thêm danh mục mới, chỉ cần thêm một object vào mảng bên dưới.
 * 
 * - id:       Định danh duy nhất, được dùng làm tên thư mục lưu dữ liệu.
 * - name:     Tên hiển thị của danh mục.
 * - rssUrl:   Đường dẫn đến feed RSS của danh mục.
 */
const categories = [
    {
        id: 'sports',
        name: 'Thể thao',
        rssUrl: 'https://vnexpress.net/rss/the-thao.rss',
    },
    // Ví dụ mở rộng thêm danh mục trong tương lai:
    // {
    //     id: 'football',
    //     name: 'Bóng đá',
    //     rssUrl: 'https://vnexpress.net/rss/bong-da.rss',
    // },
];

module.exports = categories;
