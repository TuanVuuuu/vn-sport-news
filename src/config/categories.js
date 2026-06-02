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
        id: 'featured',
        name: 'Tin nổi bật',
        rssUrl: 'https://vnexpress.net/rss/tin-noi-bat.rss',
    },
    {
        id: 'latest',
        name: 'Tin mới nhất',
        rssUrl: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
    },
    {
        id: 'sports',
        name: 'Thể thao',
        rssUrl: 'https://vnexpress.net/rss/the-thao.rss',
    },
    {
        id: 'world-cup',
        name: 'World Cup 2026',
        rssUrl: 'https://thethao247.vn/world-cup.rss',
    },
    {
        id: 'world',
        name: 'Thế giới',
        rssUrl: 'https://vnexpress.net/rss/the-gioi.rss',
    },
    {
        id: 'relax',
        name: 'Thư giãn',
        rssUrl: 'https://vnexpress.net/rss/thu-gian.rss',
    },
    {
        id: 'entertainment',
        name: 'Giải trí',
        rssUrl: 'https://vnexpress.net/rss/giai-tri.rss',
    },
    {
        id: 'science-technology',
        name: 'Khoa học công nghệ',
        rssUrl: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
    },
    {
        id: 'most-viewed',
        name: 'Tin xem nhiều',
        rssUrl: 'https://vnexpress.net/rss/tin-xem-nhieu.rss',
    },
    {
        id: 'current-affairs',
        name: 'Thời sự',
        rssUrl: 'https://vnexpress.net/rss/thoi-su.rss',
    },
    {
        id: 'business',
        name: 'Kinh doanh',
        rssUrl: 'https://vnexpress.net/rss/kinh-doanh.rss',
    },
    {
        id: 'education',
        name: 'Giáo dục',
        rssUrl: 'https://vnexpress.net/rss/giao-duc.rss',
    },
    {
        id: 'real-estate',
        name: 'Bất động sản',
        rssUrl: 'https://vnexpress.net/rss/bat-dong-san.rss',
    },
    {
        id: 'life',
        name: 'Đời sống',
        rssUrl: 'https://vnexpress.net/rss/gia-dinh.rss',
    },
    {
        id: 'opinion',
        name: 'Ý kiến',
        rssUrl: 'https://vnexpress.net/rss/y-kien.rss',
    },
    {
        id: 'travel',
        name: 'Du lịch',
        rssUrl: 'https://vnexpress.net/rss/du-lich.rss',
    },
    {
        id: 'health',
        name: 'Sức khỏe',
        rssUrl: 'https://vnexpress.net/rss/suc-khoe.rss',
    },
    {
        id: 'vehicles',
        name: 'Xe',
        rssUrl: 'https://vnexpress.net/rss/oto-xe-may.rss',
    },
    {
        id: 'law',
        name: 'Pháp luật',
        rssUrl: 'https://vnexpress.net/rss/phap-luat.rss',
    },
    {
        id: 'perspectives',
        name: 'Góc nhìn',
        rssUrl: 'https://vnexpress.net/rss/goc-nhin.rss',
    },
];

module.exports = categories;
