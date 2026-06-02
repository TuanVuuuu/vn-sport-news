/**
 * Cấu hình các nguồn RSS theo danh mục.
 *
 * - id:       Định danh duy nhất, dùng làm tên thư mục lưu dữ liệu.
 * - name:     Tên hiển thị của danh mục.
 * - rssUrl:   Đường dẫn feed RSS.
 * - provider: Id nguồn parse (xem src/config/rssProviders.js).
 */
const VNEXPRESS_RSS_BASE = 'https://vnexpress.net/rss';
const THETHAO247_RSS_BASE = 'https://thethao247.vn';

const vnexpressCategories = [
    { id: 'featured', name: 'Tin nổi bật', slug: 'tin-noi-bat' },
    { id: 'latest', name: 'Tin mới nhất', slug: 'tin-moi-nhat' },
    { id: 'sports', name: 'Thể thao', slug: 'the-thao' },
    { id: 'world', name: 'Thế giới', slug: 'the-gioi' },
    { id: 'relax', name: 'Thư giãn', slug: 'thu-gian' },
    { id: 'entertainment', name: 'Giải trí', slug: 'giai-tri' },
    { id: 'science-technology', name: 'Khoa học công nghệ', slug: 'khoa-hoc-cong-nghe' },
    { id: 'most-viewed', name: 'Tin xem nhiều', slug: 'tin-xem-nhieu' },
    { id: 'current-affairs', name: 'Thời sự', slug: 'thoi-su' },
    { id: 'business', name: 'Kinh doanh', slug: 'kinh-doanh' },
    { id: 'education', name: 'Giáo dục', slug: 'giao-duc' },
    { id: 'real-estate', name: 'Bất động sản', slug: 'bat-dong-san' },
    { id: 'life', name: 'Đời sống', slug: 'gia-dinh' },
    { id: 'opinion', name: 'Ý kiến', slug: 'y-kien' },
    { id: 'travel', name: 'Du lịch', slug: 'du-lich' },
    { id: 'health', name: 'Sức khỏe', slug: 'suc-khoe' },
    { id: 'vehicles', name: 'Xe', slug: 'oto-xe-may' },
    { id: 'law', name: 'Pháp luật', slug: 'phap-luat' },
    { id: 'perspectives', name: 'Góc nhìn', slug: 'goc-nhin' },
].map(({ slug, ...category }) => ({
    ...category,
    rssUrl: `${VNEXPRESS_RSS_BASE}/${slug}.rss`,
    provider: 'vnexpress',
}));

const thethao247Categories = [
    { id: 'world-cup', name: 'World Cup 2026', slug: 'world-cup' },
    { id: 'vietnam-football', name: 'Bóng đá Việt Nam', slug: 'bong-da-viet-nam-c1' },
].map(({ slug, ...category }) => ({
    ...category,
    rssUrl: `${THETHAO247_RSS_BASE}/${slug}.rss`,
    provider: 'thethao247',
}));

const categories = [
    ...vnexpressCategories,
    ...thethao247Categories,
];

module.exports = categories;
