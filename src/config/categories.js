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
    {
        id: 'featured',
        name: 'Tin nổi bật',
        rssUrl: 'https://vnexpress.net/rss/tin-noi-bat.rss',
    },
];

module.exports = categories;
